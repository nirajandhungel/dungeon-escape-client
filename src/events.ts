/**
 * Typed event bus — event-driven architecture core
 *
 * This module defines the CONTRACT between the Phaser game scene (producer)
 * and the React UI layer (consumer). Neither layer depends on the other's
 * internals — they only share this typed interface and the bus instance.
 *
 * EVENT TAXONOMY:
 *
 * Player action events (produced by DungeonScene.update / physics handlers):
 *   key:collected    — player walked over the key sprite
 *   player:damaged   — player touched a trap or enemy, includes remaining HP
 *
 * Door state events (produced by DungeonScene physics collider callbacks):
 *   door:locked      — player touched door without the key
 *   door:touched     — player touched door while holding the key → triggers puzzle
 *   door:unlocked    — puzzle was solved; door is removed from the physics world
 *
 * Puzzle lifecycle events (produced by React PuzzleModal → game scene):
 *   puzzle:solved    — server confirmed the answer is correct
 *   puzzle:dismissed — player closed the puzzle modal without solving it
 *
 * Game lifecycle events (produced by DungeonScene):
 *   game:paused      — ESC pressed while PLAYING or DOOR_UNLOCKED
 *   game:resumed     — ESC pressed while PAUSED
 *   game:won         — player walked into the exit after the door was unlocked
 *   game:dead        — HP reached 0
 *
 * MEMORY MANAGEMENT:
 * on() returns an unsubscribe function. All React consumers call the returned
 * function in their useEffect cleanup, preventing stale listeners and memory leaks.
 */

export interface GameEvents {
  'key:collected':   undefined;
  'player:damaged':  number;        // remaining HP
  'door:locked':     undefined;
  'door:touched':    undefined;     // player reached the door while holding the key
  'puzzle:solved':   undefined;     // emitted by the UI after SERVER confirmed the answer
  'puzzle:dismissed': undefined;
  'door:unlocked':   undefined;
  'game:paused':     undefined;
  'game:resumed':    undefined;
  'game:won':        undefined;
  'game:dead':       undefined;
}

type Handler<T> = (payload: T) => void;

/**
 * TypedEmitter — minimal, type-safe publish/subscribe bus.
 *
 * Chosen over the Phaser EventEmitter for the cross-boundary (Phaser ↔ React)
 * communication path to keep the React layer independent from Phaser types.
 * Phaser's own EventEmitter is still used for internal scene events (SHUTDOWN).
 */
export class TypedEmitter<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * IMPORTANT: call the returned function in useEffect cleanup to prevent leaks.
   */
  on<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(fn as Handler<never>);
    this.handlers.set(event, set);
    return () => set.delete(fn as Handler<never>);
  }

  /** Emit an event with its payload to all registered handlers. */
  emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.handlers.get(event)?.forEach((fn) => (fn as Handler<E[K]>)(payload));
  }
}

export type GameBus = TypedEmitter<GameEvents>;
