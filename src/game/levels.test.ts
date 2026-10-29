import { describe, it, expect } from 'vitest';
import { CHAPTERS, generateLevel, parseLevel, type LevelData, type Pt } from './levels';

const key = (p: Pt) => `${p.x},${p.y}`;

/** Flood fill over the whole level with props/walls solid and only the first `open` doors passable. */
function reach(l: LevelData, from: Pt, open: number): Set<string> {
  const seen = new Set([key(from)]);
  const q = [from];
  const doorIdx = new Map(l.doors.map((d, i) => [key(d), i]));
  while (q.length) {
    const c = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (l.solid[n.y]?.[n.x] !== false || seen.has(key(n))) continue;
      const d = doorIdx.get(key(n));
      if (d !== undefined && d >= open) continue;
      seen.add(key(n)); q.push(n);
    }
  }
  return seen;
}

/** The whole chapter is playable in order: key i is reachable before door i opens, and the exit only after the last door. */
function expectSolvable(l: LevelData) {
  for (let i = 0; i < l.doors.length; i++) {
    const r = reach(l, l.start, i);                              // doors 0..i-1 open, door i sealed
    expect(r.has(key(l.keys[i]!)), `key ${i} reachable`).toBe(true);
    expect(r.has(key({ x: l.doors[i]!.x - 1, y: l.doors[i]!.y })), `door ${i} approachable`).toBe(true);
    expect(r.has(key({ x: l.doors[i]!.x + 1, y: l.doors[i]!.y })), `door ${i} really seals the next room`).toBe(false);
    expect(r.has(key(l.exit)), 'exit sealed until the last door').toBe(false);
  }
  expect(reach(l, l.start, l.doors.length).has(key(l.exit))).toBe(true);
}

describe('generated levels', () => {
  it('every chapter is solvable, in order, for 60 different seeds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      CHAPTERS.forEach((_, i) => expectSolvable(generateLevel(seed * 7919, i)));
    }
  });

  it('the solvability check itself catches an unsolvable level (a key walled in)', () => {
    const l = generateLevel(1, 0);
    const k = l.keys[0]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) l.solid[k.y + dy]![k.x + dx] = true;
    expect(() => expectSolvable(l)).toThrow();
  });

  it('has the documented shape: one key per door, a solid border, one start and exit', () => {
    CHAPTERS.forEach((c, i) => {
      const l = generateLevel(12345, i);
      expect(l.doors).toHaveLength(c.doors);
      expect(l.keys).toHaveLength(c.doors);
      expect(l.width).toBe(2 + (c.doors + 1) * 9 + c.doors);
      expect(l.height).toBe(14);
      for (let x = 0; x < l.width; x++) { expect(l.walls[0]![x]).toBe(true); expect(l.walls[l.height - 1]![x]).toBe(true); }
      for (let y = 0; y < l.height; y++) { expect(l.walls[y]![0]).toBe(true); expect(l.walls[y]![l.width - 1]).toBe(true); }
      expect(l.torches.length).toBeGreaterThanOrEqual(c.doors + 1);
      // keys and doors alternate west → east: key i lies west of door i, door i west of key i+1
      l.keys.forEach((k, n) => { expect(k.x).toBeLessThan(l.doors[n]!.x); if (n > 0) expect(k.x).toBeGreaterThan(l.doors[n - 1]!.x); });
      expect(l.exit.x).toBeGreaterThan(l.doors[l.doors.length - 1]!.x);
    });
  });

  it('honours the door count the server sends', () => {
    expect(generateLevel(1, 0, 4).doors).toHaveLength(4);
    expectSolvable(generateLevel(99, 3, 1));
    expectSolvable(generateLevel(99, 3, 4));
  });

  it('is deterministic per seed and varies between seeds (that is the replay value)', () => {
    expect(generateLevel(42, 2).rows).toEqual(generateLevel(42, 2).rows);
    const layouts = new Set(Array.from({ length: 25 }, (_, s) => generateLevel(s + 1, 2).rows.join('/')));
    expect(layouts.size).toBeGreaterThan(20);
  });

  it('scales hazards with the chapter, and the first chapter has no guards', () => {
    const count = (i: number) => { const l = generateLevel(5, i); return { g: l.guards.length, t: l.traps.length }; };
    expect(count(0).g).toBe(0);
    expect(count(4).g).toBeGreaterThan(count(1).g);
    expect(count(4).t).toBeGreaterThan(count(0).t);
  });

  it('never puts a hazard on the start, a key or the exit', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const l = generateLevel(seed, 4);
      for (const t of l.traps) for (const p of [l.start, l.exit, ...l.keys]) expect(t.x === p.x && t.y === p.y).toBe(false);
      for (const g of l.guards) for (const p of [l.start, l.exit, ...l.keys]) expect(g.x === p.x && g.y === p.y).toBe(false);
    }
  });
});

describe('parseLevel', () => {
  it('rejects malformed maps', () => {
    expect(() => parseLevel(0, 'bad', ['####', '#P.#', '####'])).toThrow(/needs exactly one P and one E/);
    expect(() => parseLevel(0, 'bad', ['#####', '#PDE#', '#####'])).toThrow(/one key per door/);
    expect(() => parseLevel(0, 'bad', ['#####', '#P?E#', '#####'])).toThrow(/unknown tile/);
    expect(() => parseLevel(0, 'bad', ['#####', '#KD#', '#####'])).toThrow(/wide/);
  });
});
