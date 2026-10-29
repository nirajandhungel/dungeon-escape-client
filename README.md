# Dungeon Escape — Client

React 18 + TypeScript + **three.js (React Three Fiber v8)** browser game. Real 3D: procedural geometry, PBR materials, shadows, fog and a follow camera. No external art or sound assets.

## Run

```bash
npm install            # or pnpm install
npm run dev            # Vite on http://localhost:5173 (proxies /api to the server on :4000)
npm test               # 31 unit tests: engine rules + generated-level solvability (vitest)
npm run typecheck && npm run build
```

The API server (`../dungeon-escape-server`) must be running with MongoDB. The client shows a retryable offline screen if it is not.

## Structure

```
src/
  events.ts          typed event bus — the contract between engine, UI and audio
  game/
    levels.ts        seeded chapter generator (rooms chained by sealed doors, key per door) + parser
    engine.ts        authoritative rules: movement, collisions, hazards, door/key state machine
    input.ts         keyboard + touch → movement vector; ignores keys typed into inputs
    rng.ts           deterministic PRNG so a run's seed always rebuilds the same dungeon
    engine.test.ts / levels.test.ts   unit tests, incl. proof every generated chapter is solvable in door order
  scene/             React Three Fiber: Environment, Actors, Effects, GameScene (camera/lights), assets (procedural textures)
  components/        HUD, BananaChallengeModal, CapePicker (Armory), Dialog (focus trap), SettingsPanel, TouchControls, Feedback
  pages/             Home (title screen + 3D backdrop), Play, Dashboard, Auth
  api.ts             the only HTTP boundary (session cookie, typed DTOs)
  audio.ts           procedural Web Audio effects, subscribed to the event bus
  settings.ts        persisted settings: sound, reduced motion, graphics quality
```

## Event flow

`keyboard/touch → InputController → GameEngine → typed events → Play.tsx (HUD + server calls) / audio.ts`

| Event | Producer | Consumer |
|---|---|---|
| `key:collected(i)` | engine | Play → `POST /games/:id/key {index}` |
| `door:touched(i)` | engine `interact()` | Play → opens that door's `BananaChallengeModal` |
| `puzzle:solved` | Play, after the **server** confirmed the answer | engine `unlockDoor()` → `door:unlocked(i)` |
| `level:cleared` / `game:won` | engine (only when every door is open) | Play → `POST /advance` / `POST /complete` (rewards) |
| `player:damaged`, `game:dead`, `game:paused/resumed` | engine | HUD, dialogs, audio |

## Banana challenge

A run is 5 chapters with 13 sealed doors; **every door has its own key and its own Banana challenge**. The browser never calls the Banana API. `BananaChallengeModal` asks our server for a puzzle, shows the image from the owner-checked route `/api/v1/puzzles/:id/image`, and submits digits to `/api/v1/puzzles/:id/verify`. The solution never reaches the client. See `../docs/ASSIGNMENT-GUIDE.md` for the full account, test results and limitations.

## Campaign, rewards, replay

Each run has a server-issued seed (different dungeons every run). Finishing awards a rank, relics, achievements and hero capes (equip them in the Armory — the server re-checks). Hard mode unlocks after the first escape.

## Notes

- Controls: WASD/arrows move, `E`/`Enter`/`Space` use, `Esc` pause; on touch devices an on-screen D-pad and **Use** button appear.
- `window.__engine` exists only in development builds (used by the browser smoke test) and is compiled out of production.
