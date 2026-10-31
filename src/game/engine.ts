/**
 * GameEngine — the authoritative, rendering-free rules of one dungeon level.
 *
 * Why separate it from the 3D scene: collision, damage, the door/key state machine and level exit are
 * deterministic game rules. Keeping them here (plain TypeScript, no WebGL, no React) means they can be
 * unit-tested and the visuals can never change what the rules decide. The scene only READS this state
 * every frame; the engine PUBLISHES events (events.ts) when something meaningful happens.
 *
 * A level is a chain of rooms: key i opens door i, and each door is broken by its own Banana challenge.
 *
 * STATE MACHINE
 *   PLAYING ⇄ PAUSED
 *   PLAYING → CHALLENGE (player chose to break a seal) → PLAYING (dismissed, or solved → that door opens)
 *   PLAYING → CLEARED (reached the exit with EVERY door open) | DEAD (HP 0)
 *
 * World units: 1 tile = 1 unit. `player.x/y` are world coordinates (tile centre = tile index + 0.5).
 */
import type { Emit, InteractTarget } from '../services/events.service';
import type { LevelData, Pt } from './levels';

export type Phase = 'PLAYING' | 'PAUSED' | 'CHALLENGE' | 'CLEARED' | 'DEAD';
export interface Input { x: number; y: number }
export interface GuardState { x: number; y: number; dx: number; dy: number; yaw: number }

export const MAX_HP = 3;
export const PLAYER_SPEED = 4.6;      // tiles / second
export const PLAYER_RADIUS = 0.3;
export const GUARD_SPEED = 1.9;
export const GUARD_RADIUS = 0.3;
export const INVINCIBLE_S = 1.3;
export const INTERACT_RANGE = 1.6;
export const STEP_DISTANCE = 0.9;
export const TRAP_CYCLE_S = 2.6;
export const TRAP_ACTIVE_HEIGHT = 0.7;
const TRAP_STAGGER_S = 0.7;

/** Spike height 0..1 over one cycle: hidden → telegraph (peek) → rise → armed → retract. Shared with the renderer. */
export function trapHeight(time: number, offset = 0): number {
  const t = (((time + offset) % TRAP_CYCLE_S) + TRAP_CYCLE_S) % TRAP_CYCLE_S;
  if (t < 0.9) return 0;
  if (t < 1.2) return 0.25;
  if (t < 1.4) return 0.25 + ((t - 1.2) / 0.2) * 0.75;
  if (t < 2.2) return 1;
  return 1 - (t - 2.2) / 0.4;
}
export const trapOffset = (index: number) => index * TRAP_STAGGER_S;

export interface EngineOptions {
  keysCollected?: number;  // resume: the server says this many keys were already collected on this level
  doorsOpened?: number;    // resume: …and this many doors already unlocked (the first N, in order)
  final?: boolean;         // last level → also emit game:won
  maxHp?: number;          // Hard mode uses fewer hearts
}

const centre = (p: Pt): Pt => ({ x: p.x + 0.5, y: p.y + 0.5 });

export class GameEngine {
  phase: Phase = 'PLAYING';
  readonly maxHp: number;
  hp: number;
  /** keyTaken[i] / doorOpen[i] follow the order of level.keys / level.doors (west → east). */
  readonly keyTaken: boolean[];
  readonly doorOpen: boolean[];
  /** Seconds of un-paused play on this level; drives trap cycles and animation. */
  time = 0;
  target: InteractTarget = null;
  lastDamageAt = -Infinity;
  readonly player: { x: number; y: number; yaw: number; speed: number };
  readonly guards: GuardState[];

  private invincibleUntil = 0;
  private bumpLockUntil = 0;
  private interactLockUntil = 0;
  private stepDist = 0;
  private touchedDoor = -1;
  private challengeDoor = -1;
  private readonly doorAt = new Map<number, number>();
  private readonly doorC: Pt[];
  private readonly exitC: Pt;
  private readonly keyC: Pt[];
  private readonly final: boolean;

  constructor(readonly level: LevelData, private readonly emit: Emit, opts: EngineOptions = {}) {
    this.maxHp = opts.maxHp ?? MAX_HP;
    this.hp = this.maxHp;
    const opened = opts.doorsOpened ?? 0;
    this.doorOpen = level.doors.map((_, i) => i < opened);
    this.keyTaken = level.keys.map((_, i) => i < Math.max(opened, opts.keysCollected ?? 0));
    level.doors.forEach((d, i) => this.doorAt.set(d.y * level.width + d.x, i));
    this.final = !!opts.final;
    const s = centre(level.start);
    this.player = { x: s.x, y: s.y, yaw: 0, speed: 0 };
    this.doorC = level.doors.map(centre);
    this.exitC = centre(level.exit);
    this.keyC = level.keys.map(centre);
    this.guards = level.guards.map((g) => {
      const c = centre(g);
      return { x: c.x, y: c.y, dx: g.axis === 'x' ? 1 : 0, dy: g.axis === 'y' ? 1 : 0, yaw: g.axis === 'x' ? Math.PI / 2 : 0 };
    });
  }

  /** Doors already open / total, and the next door still sealed (-1 when all are open). */
  get doorsOpenCount() { return this.doorOpen.filter(Boolean).length; }
  get allOpen() { return this.doorOpen.every(Boolean); }
  get nextDoor() { return this.doorOpen.indexOf(false); }
  /** Is the key for the next sealed door in hand? (HUD) */
  get hasKeyForNext() { const n = this.nextDoor; return n >= 0 && this.keyTaken[n]!; }

  // ── Input from the outside world ───────────────────────────────────────
  update(dt: number, input: Input): void {
    if (this.phase !== 'PLAYING') { this.player.speed = 0; return; }
    this.time += dt;
    this.touchedDoor = -1;
    this.movePlayer(dt, input);
    this.moveGuards(dt);
    this.checkKey();
    this.checkHazards();
    if (this.phase !== 'PLAYING') return;
    this.checkDoorBump();
    this.refreshTarget();
    this.checkExit();
  }

  /** The player pressed the interact key / button. Opens that door's Banana challenge when standing at a sealed door with its key. */
  interact(): void {
    if (this.phase !== 'PLAYING' || this.target === null || this.time < this.interactLockUntil) return;
    const door = this.target;
    this.challengeDoor = door;
    this.phase = 'CHALLENGE';
    this.player.speed = 0;
    this.setTarget(null);
    this.emit('door:touched', door);
  }

  /** Challenge closed without a solution. */
  dismissChallenge(): void {
    if (this.phase !== 'CHALLENGE') return;
    this.challengeDoor = -1;
    this.phase = 'PLAYING';
    this.interactLockUntil = this.time + 0.6;
  }

  /** Called only after the SERVER confirmed a correct answer for the door being challenged. */
  unlockDoor(): void {
    if (this.phase !== 'CHALLENGE' || this.challengeDoor < 0) return;
    const door = this.challengeDoor;
    this.challengeDoor = -1;
    this.phase = 'PLAYING';
    this.doorOpen[door] = true;
    this.emit('door:unlocked', door);
  }

  togglePause(): void {
    if (this.phase === 'PLAYING') { this.phase = 'PAUSED'; this.emit('game:paused', undefined); }
    else if (this.phase === 'PAUSED') { this.phase = 'PLAYING'; this.emit('game:resumed', undefined); }
  }

  // ── Rules ──────────────────────────────────────────────────────────────
  /** Circle-vs-tile collision. The closed door counts as solid for everyone. */
  collides(x: number, y: number, r: number, byPlayer = false): boolean {
    const { solid, width, height } = this.level;
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        const outside = tx < 0 || ty < 0 || tx >= width || ty >= height;
        const doorIdx = outside ? undefined : this.doorAt.get(ty * width + tx);
        const isDoor = doorIdx !== undefined && !this.doorOpen[doorIdx];
        if (!(outside || solid[ty]![tx]! || isDoor)) continue;
        const nx = Math.max(tx, Math.min(x, tx + 1));
        const ny = Math.max(ty, Math.min(y, ty + 1));
        if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) {
          if (isDoor && byPlayer) this.touchedDoor = doorIdx!;
          return true;
        }
      }
    }
    return false;
  }

  private movePlayer(dt: number, input: Input) {
    const p = this.player;
    const len = Math.hypot(input.x, input.y);
    const vx = len > 0 ? (input.x / len) * PLAYER_SPEED : 0;
    const vy = len > 0 ? (input.y / len) * PLAYER_SPEED : 0;
    let moved = 0;
    // Axes are resolved separately so the player slides along walls instead of sticking to them.
    if (vx && !this.collides(p.x + vx * dt, p.y, PLAYER_RADIUS, true)) { p.x += vx * dt; moved += Math.abs(vx * dt); }
    if (vy && !this.collides(p.x, p.y + vy * dt, PLAYER_RADIUS, true)) { p.y += vy * dt; moved += Math.abs(vy * dt); }
    p.speed = dt > 0 ? moved / dt : 0;
    if (len > 0) p.yaw = Math.atan2(vx, vy);
    this.stepDist += moved;
    while (this.stepDist >= STEP_DISTANCE) { this.stepDist -= STEP_DISTANCE; this.emit('player:step', undefined); }
  }

  private moveGuards(dt: number) {
    for (const g of this.guards) {
      const nx = g.x + g.dx * GUARD_SPEED * dt;
      const ny = g.y + g.dy * GUARD_SPEED * dt;
      if (this.collides(nx, ny, GUARD_RADIUS)) { g.dx = -g.dx; g.dy = -g.dy; }
      else { g.x = nx; g.y = ny; }
      g.yaw = Math.atan2(g.dx, g.dy);
    }
  }

  private checkKey() {
    this.keyC.forEach((k, i) => {
      if (this.keyTaken[i] || Math.hypot(this.player.x - k.x, this.player.y - k.y) >= 0.7) return;
      this.keyTaken[i] = true;
      this.emit('key:collected', i);
    });
  }

  private checkHazards() {
    if (this.time < this.invincibleUntil) return;
    const { x, y } = this.player;
    const onTrap = this.level.traps.some((t, i) =>
      trapHeight(this.time, trapOffset(i)) >= TRAP_ACTIVE_HEIGHT && Math.abs(x - (t.x + 0.5)) < 0.55 && Math.abs(y - (t.y + 0.5)) < 0.55);
    const hitByGuard = this.guards.some((g) => Math.hypot(x - g.x, y - g.y) < PLAYER_RADIUS + GUARD_RADIUS + 0.05);
    if (onTrap || hitByGuard) this.damage();
  }

  private damage() {
    this.hp -= 1;
    this.invincibleUntil = this.time + INVINCIBLE_S;
    this.lastDamageAt = this.time;
    this.emit('player:damaged', this.hp);
    if (this.hp <= 0) {
      this.phase = 'DEAD';
      this.player.speed = 0;
      this.setTarget(null);
      this.emit('game:dead', undefined);
    }
  }

  private checkDoorBump() {
    if (this.touchedDoor >= 0 && !this.keyTaken[this.touchedDoor] && this.time >= this.bumpLockUntil) {
      this.bumpLockUntil = this.time + 1.5;
      this.emit('door:locked', undefined);
    }
  }

  private refreshTarget() {
    let best: InteractTarget = null, bestD = INTERACT_RANGE;
    this.doorC.forEach((d, i) => {
      if (this.doorOpen[i] || !this.keyTaken[i]) return;
      const dist = Math.hypot(this.player.x - d.x, this.player.y - d.y);
      if (dist < bestD) { bestD = dist; best = i; }
    });
    this.setTarget(best);
  }

  private setTarget(t: InteractTarget) {
    if (t === this.target) return;
    this.target = t;
    this.emit('interact:available', t);
  }

  private checkExit() {
    if (!this.allOpen) return;
    if (Math.hypot(this.player.x - this.exitC.x, this.player.y - this.exitC.y) < 0.6) {
      this.phase = 'CLEARED';
      this.player.speed = 0;
      this.setTarget(null);
      this.emit('level:cleared', this.level.index);
      if (this.final) this.emit('game:won', undefined);
    }
  }
}
