import { describe, it, expect } from 'vitest';
import { generateLevel, parseLevel, type Pt } from './levels';
import { GameEngine, MAX_HP, INVINCIBLE_S, TRAP_CYCLE_S, trapHeight, trapOffset, PLAYER_SPEED, type Input } from './engine';
import type { GameEvents } from '../services/events.service';

/** A tiny hand-built level keeps the physics numbers exact (the generator is covered in levels.test.ts). */
const MINI = parseLevel(0, 'Mini', [
  '##########',
  '#P..#....#',
  '#...#.e..#',
  '#.K.D...E#',
  '#...#.o..#',
  '#...#..T.#',
  '##########',
]);
const [KEY, DOOR] = [MINI.keys[0]!, MINI.doors[0]!];

type Logged = { event: keyof GameEvents; payload: unknown };
const make = (level = MINI, opts = {}) => {
  const log: Logged[] = [];
  const engine = new GameEngine(level, (event, payload) => log.push({ event, payload }), opts);
  const names = () => log.map((l) => l.event);
  return { engine, log, names };
};
const run = (e: GameEngine, input: Input, seconds: number, dt = 1 / 60) => {
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) e.update(dt, input);   // integer steps: no float drift
};
const put = (e: GameEngine, p: Pt) => { e.player.x = p.x + 0.5; e.player.y = p.y + 0.5; };
const beforeDoor = () => ({ x: DOOR.x - 1, y: DOOR.y });

describe('movement and collision', () => {
  it('moves at PLAYER_SPEED and faces the direction of travel', () => {
    const { engine } = make();
    const x0 = engine.player.x;
    run(engine, { x: 1, y: 0 }, 0.3);
    expect(engine.player.x - x0).toBeCloseTo(PLAYER_SPEED * 0.3, 1);
    expect(engine.player.yaw).toBeCloseTo(Math.PI / 2);   // +x = east
    run(engine, { x: 0, y: 1 }, 0.1);
    expect(engine.player.yaw).toBeCloseTo(0);             // +y = towards the camera
  });

  it('is blocked by walls and cannot leave the map', () => {
    const { engine } = make();
    run(engine, { x: -1, y: 0 }, 3);
    expect(engine.player.x).toBeGreaterThan(1.29);        // wall tile + radius 0.3
    run(engine, { x: 0, y: -1 }, 3);
    expect(engine.player.y).toBeGreaterThan(1.29);
  });

  it('slides along a wall instead of sticking to it', () => {
    const { engine } = make();
    run(engine, { x: -1, y: 1 }, 0.5);
    expect(engine.player.x).toBeGreaterThan(1.29);
    expect(engine.player.y).toBeGreaterThan(3);
  });

  it('normalises diagonal speed', () => {
    const a = make().engine, b = make().engine;
    run(a, { x: 1, y: 0 }, 0.2); run(b, { x: 1, y: 1 }, 0.2);
    const da = a.player.x - 1.5;
    const db = Math.hypot(b.player.x - 1.5, b.player.y - 1.5);
    expect(db).toBeCloseTo(da, 1);
  });

  it('solid props block the player', () => {
    const barrel = MINI.props.find((p) => p.kind === 'barrel')!;
    const { engine } = make(MINI, { doorsOpened: 1 });
    put(engine, { x: barrel.x - 1, y: barrel.y });
    run(engine, { x: 1, y: 0 }, 1);
    expect(engine.player.x).toBeLessThan(barrel.x);
  });

  it('is deterministic: same inputs give the same state', () => {
    const a = make().engine, b = make().engine;
    for (const e of [a, b]) { run(e, { x: 1, y: 0 }, 0.5); run(e, { x: 0, y: 1 }, 0.7); }
    expect(a.player).toEqual(b.player);
  });
});

describe('keys, doors and the challenge flow', () => {
  it('picks the key up by walking over it and reports which key', () => {
    const { engine, log } = make();
    put(engine, { x: KEY.x - 1, y: KEY.y });
    run(engine, { x: 1, y: 0 }, 0.5);
    expect(engine.keyTaken[0]).toBe(true);
    expect(log.filter((l) => l.event === 'key:collected').map((l) => l.payload)).toEqual([0]);
  });

  it('bumping a door without its key emits door:locked (rate limited) and offers no interaction', () => {
    const { engine, names } = make();
    put(engine, beforeDoor());
    run(engine, { x: 1, y: 0 }, 1);
    expect(engine.player.x).toBeLessThan(DOOR.x);
    expect(names().filter((n) => n === 'door:locked')).toHaveLength(1);
    expect(engine.target).toBeNull();
    engine.interact();
    expect(engine.phase).toBe('PLAYING');
  });

  it('with the key the door is interactable; interact() opens its challenge and freezes movement', () => {
    const { engine, log } = make(MINI, { keysCollected: 1 });
    put(engine, beforeDoor());
    run(engine, { x: 0, y: 0 }, 0.1);
    expect(engine.target).toBe(0);
    engine.interact();
    expect(engine.phase).toBe('CHALLENGE');
    expect(log.find((l) => l.event === 'door:touched')?.payload).toBe(0);
    const x = engine.player.x;
    run(engine, { x: 1, y: 0 }, 1);
    expect(engine.player.x).toBe(x);
    expect(engine.doorOpen[0]).toBe(false);
  });

  it('dismissing resumes play with the door sealed and briefly blocks an instant re-open', () => {
    const { engine } = make(MINI, { keysCollected: 1 });
    put(engine, beforeDoor());
    run(engine, { x: 0, y: 0 }, 0.1);
    engine.interact();
    engine.dismissChallenge();
    expect(engine.phase).toBe('PLAYING');
    expect(engine.doorOpen[0]).toBe(false);
    engine.interact();
    expect(engine.phase).toBe('PLAYING');
  });

  it('only unlockDoor() (after server validation) opens the door; outside a challenge it does nothing', () => {
    const { engine, log } = make(MINI, { keysCollected: 1 });
    engine.unlockDoor();
    expect(engine.doorOpen[0]).toBe(false);
    put(engine, beforeDoor());
    run(engine, { x: 0, y: 0 }, 0.1);
    engine.interact();
    engine.unlockDoor();
    expect(engine.doorOpen[0]).toBe(true);
    expect(log.find((l) => l.event === 'door:unlocked')?.payload).toBe(0);
    run(engine, { x: 1, y: 0 }, 1);
    expect(engine.player.x).toBeGreaterThan(DOOR.x + 0.5);
  });

  it('the exit does nothing until EVERY door is open; then it clears the level (and wins on the final one)', () => {
    const sealed = make();
    put(sealed.engine, MINI.exit);
    run(sealed.engine, { x: 0, y: 0 }, 0.2);
    expect(sealed.engine.phase).toBe('PLAYING');

    const mid = make(MINI, { doorsOpened: 1 });
    put(mid.engine, { x: MINI.exit.x - 1, y: MINI.exit.y });
    run(mid.engine, { x: 1, y: 0 }, 0.6);
    expect(mid.engine.phase).toBe('CLEARED');
    expect(mid.log.find((l) => l.event === 'level:cleared')?.payload).toBe(0);
    expect(mid.names()).not.toContain('game:won');

    const fin = make(MINI, { doorsOpened: 1, final: true });
    put(fin.engine, { x: MINI.exit.x - 1, y: MINI.exit.y });
    run(fin.engine, { x: 1, y: 0 }, 0.6);
    expect(fin.names()).toContain('game:won');
  });
});

describe('several doors in one chapter', () => {
  const L = generateLevel(2024, 2);   // chapter 3: three sealed doors

  it('tracks keys and doors independently and in order', () => {
    expect(L.doors).toHaveLength(3);
    const { engine } = make(L);
    expect(engine.nextDoor).toBe(0);
    expect(engine.hasKeyForNext).toBe(false);
    put(engine, L.keys[0]!);
    run(engine, { x: 0, y: 0 }, 0.1);
    expect(engine.hasKeyForNext).toBe(true);
    expect(engine.allOpen).toBe(false);
  });

  it('opens exactly the door that was challenged and moves on to the next', () => {
    const { engine, log } = make(L, { keysCollected: 2, doorsOpened: 1 });
    expect(engine.doorOpen).toEqual([true, false, false]);
    expect(engine.keyTaken).toEqual([true, true, false]);
    put(engine, { x: L.doors[1]!.x - 1, y: L.doors[1]!.y });
    run(engine, { x: 0, y: 0 }, 0.1);
    expect(engine.target).toBe(1);
    engine.interact();
    expect(log.find((l) => l.event === 'door:touched')?.payload).toBe(1);
    engine.unlockDoor();
    expect(engine.doorOpen).toEqual([true, true, false]);
    expect(engine.nextDoor).toBe(2);
    expect(engine.doorsOpenCount).toBe(2);
  });

  it('the portal stays dormant until the last door is open', () => {
    const open2 = make(L, { doorsOpened: 2 });
    put(open2.engine, L.exit);
    run(open2.engine, { x: 0, y: 0 }, 0.2);
    expect(open2.engine.phase).toBe('PLAYING');
    const open3 = make(L, { doorsOpened: 3 });
    put(open3.engine, L.exit);
    run(open3.engine, { x: 0, y: 0 }, 0.2);
    expect(open3.engine.phase).toBe('CLEARED');
  });
});

describe('health, hazards and pause', () => {
  it('trap spikes cycle and only hurt while raised', () => {
    expect(trapHeight(0)).toBe(0);
    expect(trapHeight(1.0)).toBe(0.25);
    expect(trapHeight(1.8)).toBe(1);
    expect(trapHeight(TRAP_CYCLE_S + 1.8)).toBe(1);
    const t = MINI.traps[0]!;
    const calm = make();
    put(calm.engine, t);
    calm.engine.update(1 / 60, { x: 0, y: 0 });
    expect(calm.engine.hp).toBe(MAX_HP);
    const armed = make();
    armed.engine.time = 1.5 - 1 / 60;
    put(armed.engine, t);
    armed.engine.update(1 / 60, { x: 0, y: 0 });
    expect(armed.engine.hp).toBe(MAX_HP - 1);
  });

  it('invincibility frames: one hit per window, then again after it', () => {
    const { engine, names } = make();
    engine.time = 1.5;
    put(engine, MINI.traps[0]!);
    run(engine, { x: 0, y: 0 }, 0.5);
    expect(names().filter((n) => n === 'player:damaged')).toHaveLength(1);
    engine.time = 1.5 + TRAP_CYCLE_S;
    run(engine, { x: 0, y: 0 }, 0.1);
    expect(engine.hp).toBe(MAX_HP - 2);
    expect(INVINCIBLE_S).toBeLessThan(TRAP_CYCLE_S);
  });

  it('a guard patrols, reverses at the wall and hurts on contact', () => {
    const { engine } = make(MINI, { doorsOpened: 1 });
    const g = engine.guards[0]!;
    const x0 = g.x;
    run(engine, { x: 0, y: 0 }, 0.5);
    expect(g.x).toBeGreaterThan(x0);
    for (let i = 0; i < 600 && g.dx > 0; i++) engine.update(1 / 60, { x: 0, y: 0 });
    expect(g.dx).toBe(-1);
    expect(g.x).toBeGreaterThan(8);
    expect(g.x).toBeLessThan(9);
    engine.player.x = g.x; engine.player.y = g.y;
    engine.update(1 / 60, { x: 0, y: 0 });
    expect(engine.hp).toBe(MAX_HP - 1);
  });

  it('dies at 0 HP, emits game:dead once and stops responding', () => {
    const { engine, names } = make(MINI, { doorsOpened: 1 });
    const g = engine.guards[0]!;
    for (let i = 0; i < 6 && engine.phase === 'PLAYING'; i++) {
      engine.player.x = g.x; engine.player.y = g.y;
      run(engine, { x: 0, y: 0 }, INVINCIBLE_S + 0.2);
    }
    expect(engine.hp).toBe(0);
    expect(engine.phase).toBe('DEAD');
    expect(names().filter((n) => n === 'game:dead')).toHaveLength(1);
    const x = engine.player.x;
    run(engine, { x: 1, y: 0 }, 1);
    expect(engine.player.x).toBe(x);
  });

  it('Hard mode: fewer hearts', () => {
    const { engine, names } = make(MINI, { maxHp: 2, doorsOpened: 1 });
    expect(engine.maxHp).toBe(2);
    const g = engine.guards[0]!;
    for (let i = 0; i < 4 && engine.phase === 'PLAYING'; i++) {
      engine.player.x = g.x; engine.player.y = g.y;
      run(engine, { x: 0, y: 0 }, INVINCIBLE_S + 0.2);
    }
    expect(engine.phase).toBe('DEAD');
    expect(names().filter((n) => n === 'player:damaged')).toHaveLength(2);
  });

  it('pause freezes time, movement and hazards; resume restores them', () => {
    const { engine, names } = make();
    engine.togglePause();
    expect(engine.phase).toBe('PAUSED');
    const snap = { x: engine.player.x, t: engine.time };
    run(engine, { x: 1, y: 0 }, 1);
    expect(engine.player.x).toBe(snap.x);
    expect(engine.time).toBe(snap.t);
    engine.togglePause();
    run(engine, { x: 1, y: 0 }, 0.2);
    expect(engine.player.x).toBeGreaterThan(snap.x);
    expect(names()).toEqual(expect.arrayContaining(['game:paused', 'game:resumed']));
  });

  it('cannot pause during a challenge', () => {
    const { engine } = make(MINI, { keysCollected: 1 });
    put(engine, beforeDoor());
    run(engine, { x: 0, y: 0 }, 0.1);
    engine.interact();
    engine.togglePause();
    expect(engine.phase).toBe('CHALLENGE');
  });

  it('resume options: server counts restore keys and doors; an open door implies its key', () => {
    expect(make(MINI, { keysCollected: 1 }).engine.keyTaken[0]).toBe(true);
    const d = make(MINI, { doorsOpened: 1 }).engine;
    expect(d.doorOpen[0] && d.keyTaken[0]).toBe(true);
    expect(trapOffset(2)).toBeCloseTo(1.4);
  });
});
