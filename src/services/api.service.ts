/**
 * API client — typed fetch wrapper and the single HTTP boundary of the client.
 *
 * No component calls fetch() directly, so a contract change is fixed in one place.
 *
 * VIRTUAL IDENTITY: `credentials: 'include'` sends the HttpOnly session cookie set by the server at
 * login. The browser never sees or stores a token, and no request carries a user id — the server
 * derives identity from the session.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? data.error ?? res.statusText);
  return data as T;
}

// ─── Domain types (mirror the server's publicGame / publicPuzzle / stats / rewards shapes) ─────
export interface User { id: string; displayName: string; email?: string }
export type GameStatus = 'IN_PROGRESS' | 'DOOR_UNLOCKED' | 'COMPLETED' | 'ABANDONED';
export type Difficulty = 'normal' | 'hard';
export type Rank = 'S' | 'A' | 'B' | 'C';

/** One run of the campaign. `level` is the chapter; `seed` makes the dungeon layouts reproducible for this run. */
export interface GameDto {
  id: string;
  status: GameStatus;
  level: number;
  levelCount: number;
  doorsInLevel: number;
  keysCollected: number;      // in the current chapter
  doorsOpened: number;        // in the current chapter
  doorsTotal: number;
  doorsOpenedTotal: number;
  seed: number;
  difficulty: Difficulty;
  startedAt: string;
  wrongAttempts: number;
  lockedUntil: string | null;
  score: number | null;
  rank: Rank | null;
  relics: number;             // chapters cleared so far
}
/** The Banana challenge as the browser sees it. The solution and the raw image bytes are deliberately absent. */
export interface PuzzleDto {
  id: string;
  imageUrl: string;           // same-origin, owner-checked: /api/v1/puzzles/:id/image
  expiresAt: string;
  attemptsRemaining: number;
  maxAttempts: number;
}
export interface VerifyResult {
  correct: boolean;
  attemptsRemaining?: number;
  doorsOpened?: number;
  doorsInLevel?: number;
  chapterUnlocked?: boolean;
}
export interface Achievement { id: string; title: string; description: string }
export interface Cape { id: string; name: string; color: string; unlocked?: boolean }
export interface Rewards { score: number; rank: Rank; relics: number; newAchievements: Achievement[]; newCapes: Cape[] }
export interface Stats {
  completed: number;
  runs: number;
  totalScore: number;
  bestScore: number | null;
  bestTimeMs: number | null;
  puzzlesSolved: number;
  relicsTotal: number;
  levelsCleared: number;
  achievements: Achievement[];
  capes: Cape[];
  cape: string;
  hardUnlocked: boolean;
  recent: GameDto[];
}
export interface Row { displayName: string; score: number; durationMs: number; rank: Rank; difficulty: Difficulty }

export const api = {
  // Virtual identity
  me:       () => request<User>('GET', '/auth/me'),
  login:    (email: string, password: string) => request<User>('POST', '/auth/login', { email, password }),
  register: (email: string, displayName: string, password: string) => request<User>('POST', '/auth/register', { email, displayName, password }),
  logout:   () => request<void>('POST', '/auth/logout'),

  // Game lifecycle
  newGame:       (difficulty: Difficulty = 'normal') => request<GameDto>('POST', '/games', { difficulty }),
  currentGame:   () => request<GameDto | undefined>('GET', '/games/current'),
  collectKey:    (id: string, index: number) => request<GameDto>('POST', `/games/${id}/key`, { index }),
  advance:       (id: string) => request<GameDto>('POST', `/games/${id}/advance`),
  complete:      (id: string) => request<GameDto & { durationMs: number; rewards: Rewards }>('POST', `/games/${id}/complete`),

  // Banana challenge (server fetches it from the external API; the answer never leaves the server)
  requestPuzzle: (gameId: string, signal?: AbortSignal) => request<PuzzleDto>('POST', `/games/${gameId}/puzzles`, undefined, signal),
  verify:        (puzzleId: string, answer: number) => request<VerifyResult>('POST', `/puzzles/${puzzleId}/verify`, { answer }),

  // Statistics and social
  stats:       () => request<Stats>('GET', '/users/me/stats'),
  setCape:     (cape: string) => request<{ cape: string }>('PUT', '/users/me/cape', { cape }),
  leaderboard: () => request<Row[]>('GET', '/leaderboard?limit=10'),
};
