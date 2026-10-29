/**
 * DungeonScene — Phaser 3 scene
 *
 * EVENT-DRIVEN ARCHITECTURE
 * ─────────────────────────
 * Producer events (emitted by this scene via bus):
 *   key:collected  → player walked over the key
 *   player:damaged → took damage from trap/enemy (payload = remaining HP)
 *   door:locked    → touched door without the key
 *   door:touched   → touched door with the key → triggers puzzle
 *   door:unlocked  → puzzle solved, door destroyed
 *   game:paused    → ESC pressed
 *   game:resumed   → ESC pressed while paused
 *   game:won       → player walked through the exit
 *   game:dead      → HP reached 0
 *
 * Consumer events (received from React via bus):
 *   puzzle:solved    → unlock the door
 *   puzzle:dismissed → resume from puzzle state
 *
 * STATE MACHINE: PLAYING ↔ PAUSED | PLAYING → PUZZLE_ACTIVE → DOOR_UNLOCKED → VICTORY | DEAD
 */
import Phaser from 'phaser';
import type { GameBus } from '../events';

export const TILE = 32;

export const MAPS = [
  // ── Level 1 — Tutorial ──────────────────────────────────────────────────
  [
    '####################',
    '#P.......#.........#',
    '#........#....T....#',
    '#...K....#.........#',
    '#........##########',
    '#........#.........#',
    '#........D........E#',
    '#........#.........#',
    '#..##....#....##...#',
    '#........#.........#',
    '#........#.........#',
    '####################',
  ],
  // ── Level 2 — Hazards ───────────────────────────────────────────────────
  [
    '####################',
    '#P.....T.#.........#',
    '#.######.#.........#',
    '#.#..K...#...T.....#',
    '#.#......#.........#',
    '#.########.........#',
    '#........D........E#',
    '#...T....#.........#',
    '#........#.........#',
    '#........#.......T.#',
    '#........#.........#',
    '####################',
  ],
  // ── Level 3 — Final Gauntlet ────────────────────────────────────────────
  [
    '####################',
    '#P.....##..........#',
    '#......##..........#',
    '#.##.K.##...T......#',
    '#.##...##..........#',
    '#.######.#.........#',
    '#........D........E#',
    '#..T.....#...T.....#',
    '#........#.........#',
    '#.####...#.####....#',
    '#........#.........#',
    '####################',
  ],
];

export const MAP = MAPS[0]!;

type State = 'PLAYING' | 'PAUSED' | 'PUZZLE_ACTIVE' | 'DOOR_UNLOCKED' | 'VICTORY' | 'DEAD';
const TRANSITIONS: Record<State, State[]> = {
  PLAYING:       ['PAUSED', 'PUZZLE_ACTIVE', 'DEAD'],
  PAUSED:        ['PLAYING', 'DOOR_UNLOCKED'],
  PUZZLE_ACTIVE: ['PLAYING', 'DOOR_UNLOCKED'],
  DOOR_UNLOCKED: ['PAUSED', 'VICTORY'],
  VICTORY:       [],
  DEAD:          [],
};

const MAX_HP          = 3;
const SPEED           = 155;
const INVINCIBLE_MS   = 1300;
const ENEMY_SPEED     = 60;
const ENEMY_TURN_TICKS = 130;

export class DungeonScene extends Phaser.Scene {
  private state: State = 'PLAYING';
  private resumeTarget: State = 'PLAYING';
  private hasKey     = false;
  private doorOpen   = false;
  private cooldown   = false;
  private hp         = MAX_HP;
  private invincibleUntil = 0;
  private level: number;

  private player!:       Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private door!:         Phaser.Types.Physics.Arcade.ImageWithStaticBody;
  private doorCollider!: Phaser.Physics.Arcade.Collider;
  private cursors!:      Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!:         Record<'W'|'A'|'S'|'D', Phaser.Input.Keyboard.Key>;
  private trapGroup!:    Phaser.Physics.Arcade.StaticGroup;
  private enemyGroup!:   Phaser.Physics.Arcade.Group;
  private particles!:    Phaser.GameObjects.Particles.ParticleEmitter;
  private unsubscribe: Array<() => void> = [];

  constructor(private bus: GameBus, level = 0) {
    super('dungeon');
    this.level = level;
  }

  private go(next: State): boolean {
    if (!TRANSITIONS[this.state].includes(next)) return false;
    this.state = next;
    return true;
  }

  create() {
    const map = MAPS[this.level] ?? MAPS[0]!;
    this.makeTextures();

    const walls    = this.physics.add.staticGroup();
    this.trapGroup = this.physics.add.staticGroup();
    this.enemyGroup = this.physics.add.group();

    let key:  Phaser.Types.Physics.Arcade.ImageWithStaticBody | undefined;
    let exit: Phaser.Types.Physics.Arcade.ImageWithStaticBody | undefined;

    /* ── Build tilemap ─────────────────────────────────────────────── */
    map.forEach((row, y) => [...row].forEach((c, x) => {
      const px = x * TILE + TILE / 2;
      const py = y * TILE + TILE / 2;

      this.add.image(px, py, (x + y) % 3 === 0 ? 'floor2' : 'floor').setDepth(0);

      if (c === '#') {
        walls.create(px, py, 'wall').setDepth(2);
        // Sparse torch glow
        if (x > 0 && y > 0 && x < (map[0]!.length - 1) && Math.random() < 0.07) {
          this.addTorch(px, py - TILE / 2);
        }
      }
      if (c === 'K') {
        key = this.physics.add.staticImage(px, py, 'key').setDepth(3);
        // Spinning glow around key
        this.addGlow(px, py, 0xf2d16b, 20);
        this.tweens.add({ targets: key, angle: 360, duration: 3000, repeat: -1, ease: 'Linear' });
      }
      if (c === 'D') {
        this.door = this.physics.add.staticImage(px, py, 'door').setDepth(3);
        // Faint red pulse on the locked door
        this.addGlow(px, py, 0xcc3333, 10);
      }
      if (c === 'E') {
        exit = this.physics.add.staticImage(px, py, 'exit').setDepth(3);
        this.addPortalEffect(px, py);
      }
      if (c === 'P') {
        this.player = this.physics.add.sprite(px, py, 'hero').setDepth(5);
        this.player.setSize(18, 18); // tighter hitbox than visual sprite
      }
      if (c === 'T') {
        const trap = this.trapGroup.create(px, py, 'trap') as Phaser.Types.Physics.Arcade.ImageWithStaticBody;
        trap.setDepth(2);
        this.tweens.add({ targets: trap, alpha: { from: 0.55, to: 1 }, duration: 500 + Math.random() * 200, yoyo: true, repeat: -1 });
      }
    }));

    /* ── Enemies ────────────────────────────────────────────────────── */
    if (this.level >= 1) {
      this.spawnEnemy(16 * TILE + TILE / 2, 2 * TILE + TILE / 2);
      this.spawnEnemy(17 * TILE + TILE / 2, 8 * TILE + TILE / 2);
    }
    if (this.level >= 2) {
      this.spawnEnemy(15 * TILE + TILE / 2, 5 * TILE + TILE / 2);
    }

    /* ── Physics ────────────────────────────────────────────────────── */
    this.physics.add.collider(this.player, walls);
    this.doorCollider = this.physics.add.collider(this.player, this.door, () => this.onDoor());
    this.physics.add.overlap(this.player, this.trapGroup, () => this.takeDamage());
    this.physics.add.overlap(this.player, this.enemyGroup, () => this.takeDamage());
    this.physics.add.collider(this.enemyGroup, walls, (_e) => {
      const e = _e as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      const dir = (e.getData('dir') as number) * -1;
      e.setData('dir', dir);
      e.setVelocityX(dir * ENEMY_SPEED);
    });

    if (key) {
      const k = key;
      this.physics.add.overlap(this.player, k, () => {
        if (this.hasKey) return;
        this.hasKey = true;
        k.destroy();
        this.cameras.main.flash(200, 242, 209, 107, true);
        this.bus.emit('key:collected', undefined);
      });
    }
    if (exit) {
      this.physics.add.overlap(this.player, exit, () => {
        if (!this.doorOpen || !this.go('VICTORY')) return;
        this.physics.pause();
        this.cameras.main.flash(600, 79, 157, 122, true);
        this.bus.emit('game:won', undefined);
      });
    }

    /* ── Camera ─────────────────────────────────────────────────────── */
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, map[0]!.length * TILE, map.length * TILE);
    this.cameras.main.setZoom(1.4);

    /* ── Input ──────────────────────────────────────────────────────── */
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd    = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause());

    /* ── Bus listeners ──────────────────────────────────────────────── */
    this.unsubscribe.push(
      this.bus.on('puzzle:solved', () => this.unlockDoor()),
      this.bus.on('puzzle:dismissed', () => {
        if (this.go('PLAYING')) {
          this.input.keyboard!.enabled = true;
          this.physics.resume();
          this.coolDown(800);
        }
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe.forEach(u => u()));

    /* ── Ambient particle dust ──────────────────────────────────────── */
    this.particles = this.add.particles(0, 0, 'dust', {
      x: { min: 0, max: map[0]!.length * TILE },
      y: { min: 0, max: map.length * TILE },
      speed: { min: 2, max: 6 },
      angle: { min: 250, max: 290 },
      alpha: { start: 0.3, end: 0 },
      lifespan: { min: 2000, max: 4000 },
      quantity: 0.4,
      scale: { min: 0.4, max: 1.2 },
    }).setDepth(6);
  }

  /* ── Helpers ─────────────────────────────────────────────────────── */

  private spawnEnemy(ex: number, ey: number) {
    const e = this.physics.add.sprite(ex, ey, 'enemy').setDepth(4);
    e.setSize(18, 18);
    e.setData('dir', 1);
    e.setData('ticks', 0);
    e.setVelocityX(ENEMY_SPEED);
    this.enemyGroup.add(e);
    // Enemy pulse
    this.tweens.add({ targets: e, alpha: { from: 0.8, to: 1 }, duration: 400, yoyo: true, repeat: -1 });
  }

  private addTorch(x: number, y: number) {
    const torch = this.add.image(x, y, 'torch').setDepth(3).setScale(0.9);
    // Flicker
    this.tweens.add({ targets: torch, alpha: { from: 0.75, to: 1 }, duration: 80 + Math.random() * 60, yoyo: true, repeat: -1 });
    // Warm glow
    const glow = this.add.graphics().setDepth(1);
    glow.fillStyle(0xe3a840, 0.06);
    glow.fillCircle(x, y, 52);
  }

  private addGlow(x: number, y: number, color: number, radius: number) {
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(color, 0.18);
    g.fillCircle(x, y, radius);
    this.tweens.add({ targets: g, alpha: { from: 0.5, to: 1 }, duration: 800, yoyo: true, repeat: -1 });
  }

  private addPortalEffect(x: number, y: number) {
    // Layered rotating rings
    [24, 16, 8].forEach((r, i) => {
      const ring = this.add.graphics().setDepth(3 + i);
      ring.lineStyle(2, 0x4f9d7a, 0.6);
      ring.strokeCircle(0, 0, r);
      ring.setPosition(x, y);
      this.tweens.add({ targets: ring, angle: i % 2 === 0 ? 360 : -360, duration: 2500 + i * 800, repeat: -1, ease: 'Linear' });
    });
    // Centre glow
    const c = this.add.graphics().setDepth(6);
    c.fillStyle(0x7fcfb0, 0.5);
    c.fillCircle(x, y, 7);
    this.tweens.add({ targets: c, alpha: { from: 0.3, to: 0.8 }, duration: 700, yoyo: true, repeat: -1 });
  }

  private coolDown(ms: number) {
    this.cooldown = true;
    this.time.delayedCall(ms, () => { this.cooldown = false; });
  }

  private takeDamage() {
    if (this.state !== 'PLAYING') return;
    const now = this.time.now;
    if (now < this.invincibleUntil) return;
    this.invincibleUntil = now + INVINCIBLE_MS;
    this.hp -= 1;
    // Red flash + shake
    this.cameras.main.shake(220, 0.012);
    this.cameras.main.flash(120, 200, 40, 40, true);
    // Blink player
    this.tweens.add({ targets: this.player, alpha: { from: 0.2, to: 1 }, duration: 100, repeat: 5, yoyo: false });
    this.bus.emit('player:damaged', this.hp);
    if (this.hp <= 0 && this.go('DEAD')) {
      this.physics.pause();
      this.cameras.main.fade(600, 0, 0, 0);
      this.bus.emit('game:dead', undefined);
    }
  }

  private onDoor() {
    if (this.cooldown || this.state !== 'PLAYING') return;
    if (!this.hasKey) {
      this.coolDown(1200);
      this.cameras.main.shake(150, 0.008);
      this.bus.emit('door:locked', undefined);
      return;
    }
    if (!this.go('PUZZLE_ACTIVE')) return;
    this.physics.pause();
    this.player.setVelocity(0);
    this.input.keyboard!.enabled = false;
    this.bus.emit('door:touched', undefined);
  }

  private unlockDoor() {
    if (!this.go('DOOR_UNLOCKED')) return;
    this.doorOpen = true;
    this.input.keyboard!.enabled = true;
    this.physics.resume();
    this.door.destroy();
    this.doorCollider.destroy();
    this.cameras.main.flash(400, 79, 157, 122, true);
    this.bus.emit('door:unlocked', undefined);
  }

  private togglePause() {
    if (this.state === 'PLAYING' || this.state === 'DOOR_UNLOCKED') {
      const prev = this.state;
      if (!this.go('PAUSED')) return;
      this.resumeTarget = prev;
      this.physics.pause();
      this.bus.emit('game:paused', undefined);
    } else if (this.state === 'PAUSED') {
      if (!this.go(this.resumeTarget)) return;
      this.physics.resume();
      this.bus.emit('game:resumed', undefined);
    }
  }

  update() {
    if (this.state === 'PAUSED' || this.state === 'PUZZLE_ACTIVE' || this.state === 'VICTORY' || this.state === 'DEAD') return;

    const dx = Number(this.cursors.right.isDown || this.wasd.D.isDown) - Number(this.cursors.left.isDown || this.wasd.A.isDown);
    const dy = Number(this.cursors.down.isDown  || this.wasd.S.isDown) - Number(this.cursors.up.isDown   || this.wasd.W.isDown);
    const v  = new Phaser.Math.Vector2(dx, dy).normalize().scale(SPEED);
    this.player.setVelocity(v.x, v.y);
    if (dx < 0) this.player.setFlipX(true);
    if (dx > 0) this.player.setFlipX(false);

    // Enemy patrol
    this.enemyGroup.getChildren().forEach(obj => {
      const e = obj as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      const ticks = (e.getData('ticks') as number) + 1;
      e.setData('ticks', ticks);
      if (ticks > ENEMY_TURN_TICKS) {
        const dir = (e.getData('dir') as number) * -1;
        e.setData('dir', dir);
        e.setData('ticks', 0);
        e.setVelocityX(dir * ENEMY_SPEED);
      }
      e.setFlipX(e.body!.velocity.x < 0);
    });
  }

  /* ── Procedural texture generation ───────────────────────────────── */
  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const tex = (name: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      g.clear(); draw(g); g.generateTexture(name, w, h);
    };

    // Floor — dark stone with subtle mortar
    tex('floor', TILE, TILE, g => {
      g.fillStyle(0x18161f).fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x1e1c26, 0.6).fillRect(2, 2, TILE - 4, TILE - 4);
      g.lineStyle(1, 0x100f15, 0.8).strokeRect(0, 0, TILE, TILE);
    });

    // Floor variant — slightly lighter
    tex('floor2', TILE, TILE, g => {
      g.fillStyle(0x1c1a24).fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x242130, 0.5).fillRect(3, 3, TILE - 6, TILE - 6);
      g.lineStyle(1, 0x14121a, 0.8).strokeRect(0, 0, TILE, TILE);
    });

    // Wall — stone blocks with highlight and shadow
    tex('wall', TILE, TILE, g => {
      g.fillStyle(0x2a2633).fillRect(0, 0, TILE, TILE);
      // Upper brick
      g.fillStyle(0x363240).fillRect(2, 2, TILE - 4, 12);
      // Lower brick
      g.fillStyle(0x332f3d).fillRect(2, 18, TILE - 4, 12);
      // Top highlight
      g.fillStyle(0x47424f).fillRect(2, 2, TILE - 4, 1);
      // Mortar lines
      g.lineStyle(1, 0x1e1c26);
      g.lineBetween(0, 15, TILE, 15);
      g.lineBetween(TILE / 2, 15, TILE / 2, TILE);
      g.strokeRect(0, 0, TILE, TILE);
    });

    // Hero — detailed adventurer
    tex('hero', 24, 28, g => {
      // Boots
      g.fillStyle(0x3a2518).fillRect(4, 22, 6, 6).fillRect(14, 22, 6, 6);
      // Trousers
      g.fillStyle(0x2a2850).fillRect(5, 16, 6, 8).fillRect(13, 16, 6, 8);
      // Belt
      g.fillStyle(0x6b4c2a).fillRect(5, 15, 14, 2);
      g.fillStyle(0xe3b04b).fillRect(11, 15, 2, 2);
      // Tunic
      g.fillStyle(0x3d5f9a).fillRect(4, 8, 16, 9);
      g.fillStyle(0x304d7a).fillRect(4, 12, 16, 3);
      // Cape / shoulders
      g.fillStyle(0x6b3020).fillRect(2, 8, 3, 7).fillRect(19, 8, 3, 7);
      // Neck
      g.fillStyle(0xd4a76a).fillRect(10, 7, 4, 3);
      // Head
      g.fillStyle(0xd4a76a).fillCircle(12, 5, 5);
      // Hood
      g.fillStyle(0x2a2850).fillRect(7, 1, 10, 6);
      g.fillStyle(0x3a3870).fillRect(7, 1, 10, 2);
      // Eyes
      g.fillStyle(0xffe0a0).fillRect(9, 4, 2, 2).fillRect(13, 4, 2, 2);
      // Sword (right side)
      g.fillStyle(0xaaaacc).fillRect(20, 9, 2, 12);
      g.fillStyle(0xe3b04b).fillRect(18, 9, 6, 2);
      g.fillStyle(0x6b4c2a).fillRect(20, 11, 2, 4);
    });

    // Key — ornate golden key
    tex('key', TILE, TILE, g => {
      g.fillStyle(0xf2d16b);
      g.lineStyle(3, 0xf2d16b);
      g.strokeCircle(11, 13, 7);
      g.fillCircle(11, 13, 4);
      g.fillStyle(0xe8c558);
      g.fillRect(16, 11, 13, 4);
      g.fillRect(24, 15, 3, 5);
      g.fillRect(20, 15, 2, 4);
      g.fillStyle(0xfde68a);
      g.fillRect(16, 11, 13, 1);
    });

    // Door — heavy iron-banded wood
    tex('door', TILE, TILE, g => {
      // Wood planks
      g.fillStyle(0x5c3d1e).fillRect(1, 0, TILE - 2, TILE);
      g.fillStyle(0x4e3418).fillRect(1, 10, TILE - 2, 2).fillRect(1, 20, TILE - 2, 2);
      // Iron bands
      g.fillStyle(0x444455).fillRect(1, 8, TILE - 2, 4).fillRect(1, 18, TILE - 2, 4);
      // Band bolts
      g.fillStyle(0x888899).fillCircle(4, 10, 2).fillCircle(TILE - 4, 10, 2);
      g.fillCircle(4, 20, 2).fillCircle(TILE - 4, 20, 2);
      // Ring handle
      g.lineStyle(2, 0xe3b04b);
      g.strokeCircle(TILE - 7, 16, 4);
      g.fillStyle(0xe3b04b).fillCircle(TILE - 3, 16, 2);
      // Runic glow hints
      g.lineStyle(1, 0xff4444, 0.6);
      g.lineBetween(4, 4, TILE - 4, 4);
      g.lineBetween(4, TILE - 4, TILE - 4, TILE - 4);
      g.fillStyle(0xff4444, 0.3).fillCircle(TILE / 2, TILE / 2, 4);
    });

    // Exit portal — emerald shimmer
    tex('exit', TILE, TILE, g => {
      g.fillStyle(0x0d1f18).fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x1e5c42, 0.9).fillRect(3, 3, TILE - 6, TILE - 6);
      g.fillStyle(0x2d9e6a, 0.7).fillRect(7, 7, TILE - 14, TILE - 14);
      // Cross rune
      g.lineStyle(1, 0x7fcfb0, 0.8);
      g.lineBetween(TILE / 2, 6, TILE / 2, TILE - 6);
      g.lineBetween(6, TILE / 2, TILE - 6, TILE / 2);
      // Corner runes
      g.fillStyle(0x4fc090, 0.6);
      g.fillRect(5, 5, 3, 3).fillRect(TILE - 8, 5, 3, 3);
      g.fillRect(5, TILE - 8, 3, 3).fillRect(TILE - 8, TILE - 8, 3, 3);
    });

    // Trap — spike pit
    tex('trap', TILE, TILE, g => {
      g.fillStyle(0x14121a).fillRect(0, 0, TILE, TILE);
      g.fillStyle(0x333344, 0.5).fillRect(1, 1, TILE - 2, TILE - 2);
      // Spikes
      const spike = (sx: number) => {
        g.fillStyle(0x8888aa).fillTriangle(sx, TILE - 2, sx + 7, TILE - 2, sx + 3, 3);
        g.fillStyle(0xaaaac8).fillTriangle(sx + 1, TILE - 4, sx + 6, TILE - 4, sx + 3, 6);
      };
      spike(2); spike(11); spike(20);
      // Blood stains
      g.fillStyle(0x882222, 0.4).fillCircle(14, TILE - 4, 3).fillCircle(7, TILE - 6, 2);
    });

    // Enemy — skeletal guard
    tex('enemy', 24, 26, g => {
      // Legs
      g.fillStyle(0x991a2a).fillRect(6, 18, 5, 8).fillRect(13, 18, 5, 8);
      // Body armour
      g.fillStyle(0xbb2233).fillRect(5, 9, 14, 11);
      g.fillStyle(0x881122).fillRect(5, 13, 14, 3);
      // Pauldrons
      g.fillStyle(0x440011).fillRect(2, 9, 4, 5).fillRect(18, 9, 4, 5);
      // Head
      g.fillStyle(0xcc2a3a).fillRect(8, 2, 8, 8);
      // Visor / eyes glow
      g.fillStyle(0xff8888).fillRect(8, 4, 8, 2);
      g.fillStyle(0xff2200).fillRect(9, 4, 3, 2).fillRect(12, 4, 3, 2);
      // Blade (axe)
      g.fillStyle(0x8888aa).fillRect(0, 7, 3, 10);
      g.fillStyle(0xaaaacc).fillTriangle(0, 5, 0, 9, -5, 7);
      g.fillStyle(0x666688).fillRect(21, 7, 3, 10);
    });

    // Torch
    tex('torch', 10, 20, g => {
      // Handle
      g.fillStyle(0x6b4c2a).fillRect(4, 10, 2, 10);
      // Flame base
      g.fillStyle(0xe3582b).fillCircle(5, 7, 4);
      // Flame mid
      g.fillStyle(0xe3b04b).fillCircle(5, 5, 3);
      // Flame tip
      g.fillStyle(0xfff0a0).fillCircle(5, 3, 1);
    });

    // Dust particle
    tex('dust', 4, 4, g => {
      g.fillStyle(0x9090b0, 0.5).fillCircle(2, 2, 2);
    });

    g.destroy();
  }
}
