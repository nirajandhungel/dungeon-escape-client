# Dungeon Escape — Client

React + TypeScript + Phaser 3 browser game with event-driven architecture.

## Stack
- **React 18** — UI and state
- **Phaser 3** — 2D game engine (canvas / WebGL)
- **Vite** — dev server + bundler
- **react-router-dom** — client-side routing

## Setup

```bash
cp .env.example .env   # no secrets needed for client
pnpm install
pnpm run dev           # Vite dev server on http://localhost:5173
```

> The server must be running on `http://localhost:4000` for API calls to work.
> The client degrades gracefully when the server is offline — a red banner
> and retry button appear automatically.

## Architecture

### Event-Driven Design
All game state flows through a **typed event bus** (`src/events.ts`):

```
DungeonScene (Phaser) → bus.emit(event) → React (Play.tsx) → API call → server
```

Key events:
| Event | Producer | Consumer |
|---|---|---|
| `key:collected` | DungeonScene | Play.tsx → api.collectKey() |
| `door:touched` | DungeonScene | Play.tsx → open PuzzleModal |
| `puzzle:solved` | PuzzleModal | DungeonScene → unlockDoor() |
| `game:won` | DungeonScene | Play.tsx → api.complete() |

### Interoperability — Banana API
1. Player reaches door → `door:touched` event
2. React opens `PuzzleModal`
3. Modal calls `POST /api/v1/games/:id/puzzles` (server fetches from Banana API)
4. Image served via `/api/v1/puzzle-image` proxy (mixed-content fix)
5. Player submits answer → `POST /api/v1/puzzles/:id/verify`
6. Server validates → `{ correct: true }` → `puzzle:solved` event
7. DungeonScene unlocks door

### Offline / Server Failure UX
- `useServerHealth` polls `/api/v1/health` every 8 s
- If offline: red sticky banner + "OFFLINE" nav indicator
- Protected routes show a full offline gate with retry button
- Play page shows retryable error instead of broken canvas
- Mid-game: floating toast if server goes down during gameplay

## Folder Structure
```
src/
  api.ts           — typed fetch wrapper (single API boundary)
  auth.tsx         — AuthContext + server status
  events.ts        — TypedEmitter event bus
  useServerHealth.ts — health polling hook
  components/
    PuzzleModal.tsx        — Banana API puzzle UI
    ServerOfflineBanner.tsx — offline indicator
  game/
    DungeonScene.ts  — Phaser 3 scene
  pages/
    Home.tsx | Auth.tsx | Play.tsx | Dashboard.tsx
```
