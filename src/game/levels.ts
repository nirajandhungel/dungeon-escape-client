/**
 * Levels: a chapter is a CHAIN OF ROOMS separated by sealed doors. Each non-final room holds one key that opens the
 * door out of it; the last room holds the exit portal. Layouts are generated from the run's server-issued `seed`, so
 * every run differs but a given seed always rebuilds the same dungeon (resume and "retry level" depend on that).
 *
 * The generator only emits a room after a connectivity check proves entry → key → exit is reachable with every
 * prop treated as solid, and `levels.test.ts` re-proves solvability of the finished chapter for many seeds.
 *
 * Tile legend (also used by the parser)
 *   #  wall      .  floor     P  player start   K  key shrine (one per door)   D  sealed door   E  exit portal
 *   T  spike trap              e / v  guard patrolling left-right / up-down
 *   o barrel  x crate  p pillar  s broken statue  f brazier   (solid props)
 * Tile (x, y) occupies world space [x, x+1] × [y, y+1]; y grows towards the camera (south).
 */
import { rng } from './rng';

export interface Pt { x: number; y: number }
export type PropKind = 'barrel' | 'crate' | 'pillar' | 'statue' | 'brazier';
export interface Prop extends Pt { kind: PropKind }
export interface Guard extends Pt { axis: 'x' | 'y' }

export interface LevelData {
  index: number;
  name: string;
  width: number;
  height: number;
  rows: string[];
  start: Pt;
  /** keys[i] opens doors[i]; both are ordered west → east. */
  keys: Pt[];
  doors: Pt[];
  exit: Pt;
  traps: Pt[];
  guards: Guard[];
  props: Prop[];
  walls: boolean[][];
  /** Walls plus solid props. Doors are handled by the engine because they open. */
  solid: boolean[][];
  torches: Pt[];
}

export interface Chapter { name: string; doors: number; props: number; traps: number; guards: number }
/** `doors` is the default; a run always passes the server's door count so both sides agree. */
export const CHAPTERS: Chapter[] = [
  { name: 'The Cellars',        doors: 2, props: 5, traps: 2, guards: 0 },
  { name: 'The Warrens',        doors: 2, props: 6, traps: 3, guards: 1 },
  { name: 'The Gauntlet',       doors: 3, props: 6, traps: 4, guards: 1 },
  { name: 'The Sunken Crypt',   doors: 3, props: 7, traps: 4, guards: 2 },
  { name: "The Oracle's Vault", doors: 3, props: 7, traps: 5, guards: 2 },
];

const RW = 9;          // room width (tiles)
const RH = 12;         // room height
const SOLID_CHARS = new Set(['#', 'o', 'x', 'p', 's', 'f']);
const PROPS: Record<string, PropKind> = { o: 'barrel', x: 'crate', p: 'pillar', s: 'statue', f: 'brazier' };

type Grid = string[][];
const blank = (): Grid => Array.from({ length: RH }, () => Array<string>(RW).fill('.'));

/** Flood fill over a room grid; props and walls block, traps and guards do not. */
function flood(g: Grid, sx: number, sy: number): Set<number> {
  const seen = new Set<number>([sy * RW + sx]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= RW || ny >= RH || seen.has(ny * RW + nx) || SOLID_CHARS.has(g[ny]![nx]!)) continue;
      seen.add(ny * RW + nx);
      q.push([nx, ny]);
    }
  }
  return seen;
}

interface RoomSpec { entryRow: number; exitRow: number; hasKey: boolean; props: number; traps: number; guards: number; last: boolean }

function genRoom(r: () => number, s: RoomSpec): Grid {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
  const laneBlocked = (x: number, y: number) =>
    (y === s.entryRow && x <= 1) || (y === s.exitRow && x >= RW - 2);
  const connected = (g: Grid, key: [number, number] | null) => {
    const f = flood(g, 0, s.entryRow);
    return f.has(s.exitRow * RW + (RW - 1)) && (!key || f.has(key[1] * RW + key[0]));
  };

  for (let attempt = 0; attempt < 80; attempt++) {
    const g = blank();
    let key: [number, number] | null = null;
    const style = attempt > 60 ? 'none' : pick(['none', 'baffle', 'baffle', 'chamber', 'chamber']);

    if (style === 'baffle') {
      const by = 3 + Math.floor(r() * 6);
      const from = r() < 0.5 ? 2 : 0, to = r() < 0.5 ? RW - 3 : RW - 1;   // sometimes seal one end: a longer detour
      for (let x = from; x <= to; x++) g[by]![x] = '#';
    } else if (style === 'chamber' && s.hasKey) {
      const cx = 2 + Math.floor(r() * 3), cy = 1 + Math.floor(r() * 6);
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        if (dx === 0 || dx === 3 || dy === 0 || dy === 3) g[cy + dy]![cx + dx] = '#';
      }
      // one doorway on a random side (never a corner)
      const side = Math.floor(r() * 4), off = 1 + Math.floor(r() * 2);
      const [gx, gy] = side === 0 ? [cx + off, cy] : side === 1 ? [cx + off, cy + 3] : side === 2 ? [cx, cy + off] : [cx + 3, cy + off];
      g[gy]![gx] = '.';
      key = [cx + 1 + Math.floor(r() * 2), cy + 1 + Math.floor(r() * 2)];
    }
    // Lanes the player walks in and out through must stay open.
    for (const [x, y] of [[0, s.entryRow], [1, s.entryRow], [RW - 2, s.exitRow], [RW - 1, s.exitRow]] as const) {
      if (g[y]![x] === '#') g[y]![x] = '.';
    }
    if (s.hasKey && !key) {
      for (let t = 0; t < 40 && !key; t++) {
        const x = 2 + Math.floor(r() * 5), y = 1 + Math.floor(r() * 10);
        if (g[y]![x] === '.' && !laneBlocked(x, y)) key = [x, y];
      }
      if (!key) continue;
    }
    if (key) g[key[1]]![key[0]] = 'K';
    if (!connected(g, key)) continue;

    const place = (ch: string, ok: (x: number, y: number) => boolean, tries = 30): [number, number] | null => {
      for (let t = 0; t < tries; t++) {
        const x = Math.floor(r() * RW), y = Math.floor(r() * RH);
        if (g[y]![x] !== '.' || laneBlocked(x, y) || !ok(x, y)) continue;
        g[y]![x] = ch;
        if (SOLID_CHARS.has(ch) && !connected(g, key)) { g[y]![x] = '.'; continue; }   // would wall something off
        return [x, y];
      }
      return null;
    };
    const awayFromEntry = (x: number, y: number, d: number) => Math.hypot(x, y - s.entryRow) >= d;
    const awayFromKey = (x: number, y: number) => !key || Math.hypot(x - key[0], y - key[1]) >= 2;

    for (const [x, y] of [[0, 0], [RW - 1, RH - 1]] as const) {          // braziers light the corners
      if (g[y]![x] === '.' && !laneBlocked(x, y)) { g[y]![x] = 'f'; if (!connected(g, key)) g[y]![x] = '.'; }
    }
    for (let i = 0; i < s.props; i++) place(pick(['o', 'x', 'p', 'o', 'x', 's']), (x, y) => awayFromKey(x, y) || r() < 0.2);
    for (let i = 0; i < s.traps; i++) place('T', (x, y) => awayFromEntry(x, y, 3) && awayFromKey(x, y) && !(s.last && x >= RW - 2));
    for (let i = 0; i < s.guards; i++) {
      const axis = r() < 0.5 ? 'e' : 'v';
      place(axis, (x, y) => {
        if (!awayFromEntry(x, y, 4) || !awayFromKey(x, y)) return false;
        let run = 1;                                                      // the guard needs room to patrol
        for (const sgn of [1, -1]) for (let k = 1; k < 5; k++) {
          const nx = axis === 'e' ? x + sgn * k : x, ny = axis === 'v' ? y + sgn * k : y;
          if (nx < 0 || ny < 0 || nx >= RW || ny >= RH || SOLID_CHARS.has(g[ny]![nx]!)) break;
          run++;
        }
        return run >= 5;
      });
    }
    if (s.last) g[s.exitRow]![RW - 1] = 'E';
    return g;
  }
  // Fallback that is always valid: an open room.
  const g = blank();
  if (s.hasKey) g[5]![4] = 'K';
  if (s.last) g[s.exitRow]![RW - 1] = 'E';
  return g;
}

export function parseLevel(index: number, name: string, rows: string[]): LevelData {
  const height = rows.length;
  const width = rows[0]!.length;
  let start: Pt | undefined, exit: Pt | undefined;
  const keys: Pt[] = [], doors: Pt[] = [], traps: Pt[] = [], guards: Guard[] = [], props: Prop[] = [];
  const walls = rows.map(() => Array<boolean>(width).fill(false));
  const solid = rows.map(() => Array<boolean>(width).fill(false));

  rows.forEach((line, y) => {
    if (line.length !== width) throw new Error(`Level ${index + 1}: row ${y} is ${line.length} wide, expected ${width}`);
    [...line].forEach((c, x) => {
      const at = { x, y };
      if (c === '#') { walls[y]![x] = true; solid[y]![x] = true; }
      else if (c === 'P') { if (start) throw new Error(`Level ${index + 1}: duplicate P`); start = at; }
      else if (c === 'E') { if (exit) throw new Error(`Level ${index + 1}: duplicate E`); exit = at; }
      else if (c === 'K') keys.push(at);
      else if (c === 'D') doors.push(at);
      else if (c === 'T') traps.push(at);
      else if (c === 'e') guards.push({ ...at, axis: 'x' });
      else if (c === 'v') guards.push({ ...at, axis: 'y' });
      else if (PROPS[c]) { props.push({ ...at, kind: PROPS[c]! }); solid[y]![x] = true; }
      else if (c !== '.') throw new Error(`Level ${index + 1}: unknown tile "${c}" at ${x},${y}`);
    });
  });
  if (!start || !exit) throw new Error(`Level ${index + 1}: needs exactly one P and one E`);
  if (doors.length === 0 || keys.length !== doors.length) throw new Error(`Level ${index + 1}: needs one key per door`);
  keys.sort((a, b) => a.x - b.x);
  doors.sort((a, b) => a.x - b.x);

  // Torches hang on south-facing wall faces (what the camera sees), spread at least 5 tiles apart.
  const torches: Pt[] = [];
  for (let y = 0; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!walls[y]![x] || walls[y + 1]![x] || rows[y + 1]![x] === 'D') continue;
      if ((x * 7 + y * 13) % 5 !== 0) continue;
      if (torches.every((t) => Math.hypot(t.x - x, t.y - y) >= 5)) torches.push({ x, y });
    }
  }
  return { index, name, width, height, rows, start, keys, doors, exit, traps, guards, props, walls, solid, torches };
}

/**
 * Build chapter `index` for a run. `doors` comes from the server (so both sides always agree on the layout size);
 * the same (seed, index, doors) always returns the same dungeon.
 */
export function generateLevel(seed: number, index: number, doors: number = CHAPTERS[index]?.doors ?? 2): LevelData {
  const ch = CHAPTERS[Math.min(index, CHAPTERS.length - 1)]!;
  const r = rng((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const rooms = doors + 1;
  const doorRow = Array.from({ length: doors }, () => 2 + Math.floor(r() * 8));   // 2..9
  const width = 2 + rooms * RW + doors;
  const rows = Array.from({ length: RH + 2 }, () => Array<string>(width).fill('#'));

  for (let room = 0; room < rooms; room++) {
    const last = room === rooms - 1;
    const entryRow = room === 0 ? 6 : doorRow[room - 1]!;
    const exitRow = last ? 2 + Math.floor(r() * 8) : doorRow[room]!;
    const g = genRoom(r, {
      entryRow, exitRow, hasKey: !last, last,
      props: ch.props, traps: ch.traps, guards: room === 0 ? Math.max(0, ch.guards - 1) : ch.guards,
    });
    const x0 = 1 + room * (RW + 1);
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) rows[1 + y]![x0 + x] = g[y]![x]!;
    if (room === 0) rows[1 + entryRow]![x0] = 'P';
    if (!last) rows[1 + doorRow[room]!]![x0 + RW] = 'D';
  }
  return parseLevel(index, ch.name, rows.map((row) => row.join('')));
}
