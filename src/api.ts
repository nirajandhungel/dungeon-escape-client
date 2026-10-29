/**
 * API client — typed fetch wrapper
 *
 * All server communication goes through this module. No component fetches
 * directly. This decouples the React components from the HTTP details and
 * makes contract changes easy to find and update.
 *
 * SECURITY: credentials:'include' ensures session cookies are sent with every
 * request. The server uses SameSite=Lax cookies; the Vite dev proxy makes
 * requests same-origin so cookies work without special CORS treatment.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? data.error ?? res.statusText);
  return data as T;
}

// ─── Domain types (mirror server publicGame / publicPuzzle shapes) ─────────
export interface User { id: string; displayName: string; email?: string }
export interface GameDto {
  id: string;
  status: string;
  keyCollected: boolean;
  startedAt: string;
  wrongAttempts: number;
  lockedUntil: string | null;
  score: number | null;
}
/** PuzzleDto — returned to client. Solution field is deliberately absent. */
export interface PuzzleDto {
  id: string;
  imageUrl: string;  // will be proxied via /api/v1/puzzle-image
  expiresAt: string;
  attemptsRemaining: number;
}
export interface Stats {
  completed: number;
  totalScore: number;
  bestTimeMs: number | null;
  recent: GameDto[];
}
export interface Row { displayName: string; score: number; durationMs: number }

// ─── API surface ───────────────────────────────────────────────────────────
export const api = {
  // Virtual identity
  me:       () => request<User>('GET', '/auth/me'),
  login:    (email: string, password: string) => request<User>('POST', '/auth/login', { email, password }),
  register: (email: string, displayName: string, password: string) => request<User>('POST', '/auth/register', { email, displayName, password }),
  logout:   () => request<void>('POST', '/auth/logout'),

  // Game lifecycle
  newGame:       () => request<GameDto>('POST', '/games'),
  collectKey:    (id: string) => request<GameDto>('POST', `/games/${id}/key`),
  requestPuzzle: (id: string) => request<PuzzleDto>('POST', `/games/${id}/puzzles`),
  verify:        (puzzleId: string, answer: number) => request<{ correct: boolean; attemptsRemaining?: number }>('POST', `/puzzles/${puzzleId}/verify`, { answer }),
  complete:      (id: string) => request<GameDto & { durationMs: number }>('POST', `/games/${id}/complete`),

  // Statistics and social
  stats:       () => request<Stats>('GET', '/users/me/stats'),
  leaderboard: () => request<Row[]>('GET', '/leaderboard?limit=10'),

  /**
   * puzzleImageUrl — converts an upstream image URL (may be http://) to a
   * same-origin proxy URL so the browser never makes a mixed-content request.
   * This is an interoperability boundary: the external image lives on sanfoh.com,
   * we tunnel it through our Express server.
   */
  puzzleImageUrl: (rawUrl: string) => `/api/v1/puzzle-image?url=${encodeURIComponent(rawUrl)}`,
};
