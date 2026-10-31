/**
 * Typed event bus — the event-driven core of the client.
 *
 * It is the CONTRACT between the game engine (producer of gameplay events) and the React UI /
 * audio (consumers). Neither side imports the other's internals; they share only this interface.
 *
 * EVENT TAXONOMY
 *   Player action   key:collected · player:step · player:damaged (payload = HP left)
 *   Interaction     interact:available (payload = what the player can use now, or null)
 *   Door            door:locked (bumped it without the key) · door:touched (player chose to open it →
 *                   challenge) · door:unlocked (server validated the Banana answer)
 *   Challenge       puzzle:solved · puzzle:dismissed — emitted by the UI, consumed by the engine
 *   Lifecycle       game:paused · game:resumed · level:cleared (payload = level index) · game:won · game:dead
 *
 * MEMORY MANAGEMENT: on() returns an unsubscribe function; every consumer calls it in its cleanup.
 */
/** Index of the door the player can use right now, or null. */
export type InteractTarget = number | null;

export interface GameEvents {
  'key:collected':    number;      // key index (key i opens door i)
  'player:step':      undefined;
  'player:damaged':   number;
  'interact:available': InteractTarget;
  'door:locked':      undefined;
  'door:touched':     number;      // door index → opens that door's Banana challenge
  'door:unlocked':    number;
  'puzzle:solved':    undefined;
  'puzzle:dismissed': undefined;
  'game:paused':      undefined;
  'game:resumed':     undefined;
  'level:cleared':    number;
  'game:won':         undefined;
  'game:dead':        undefined;
}

type Handler<T> = (payload: T) => void;

/** Minimal type-safe publish/subscribe. Kept independent of any rendering library on purpose. */
export class TypedEmitter<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  /** Subscribe; returns the unsubscribe function. */
  on<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(fn as Handler<never>);
    this.handlers.set(event, set);
    return () => { set.delete(fn as Handler<never>); };
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.handlers.get(event)?.forEach((fn) => (fn as Handler<E[K]>)(payload));
  }
}

export type GameBus = TypedEmitter<GameEvents>;
export type Emit = <K extends keyof GameEvents>(event: K, payload: GameEvents[K]) => void;
