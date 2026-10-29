/**
 * Input — keyboard (and touch) → a movement vector plus discrete actions.
 *
 * EVENT-DRIVEN: native `keydown` / `keyup` listeners keep a Set of held keys; the engine polls
 * `vector()` once per frame. Discrete actions (interact, pause) are forwarded to callbacks.
 *
 * FOCUS SAFETY: key events that originate in a text field, select or contenteditable are ignored, so
 * typing the Banana answer can never move the hero. Enter/Space on a focused button or link is also
 * ignored (it must activate that control, not "interact"). Held keys are cleared on blur/visibility
 * change so the hero can never get "stuck" walking after alt-tabbing.
 */
export interface InputHandlers { onInteract(): void; onPause(): void }

const MOVE: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

const isTextTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
const isControlTarget = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('button, a, [role="button"]');

export class InputController {
  private held = new Set<'up' | 'down' | 'left' | 'right'>();
  private virtual = new Set<'up' | 'down' | 'left' | 'right'>();
  /** Return false to ignore game input entirely (e.g. while a modal owns the keyboard). */
  enabled = () => true;

  constructor(private handlers: InputHandlers) {}

  attach(): () => void {
    const down = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTextTarget(e.target)) return;
      const dir = MOVE[e.key];
      if (dir) { if (this.enabled()) this.held.add(dir); e.preventDefault(); return; }
      if (e.key === 'Escape') { if (!e.repeat) this.handlers.onPause(); return; }
      if ((e.key === 'e' || e.key === 'E' || e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        if (e.key !== 'e' && e.key !== 'E' && isControlTarget(e.target)) return;
        if (this.enabled()) { this.handlers.onInteract(); e.preventDefault(); }
      }
    };
    const up = (e: KeyboardEvent) => { const dir = MOVE[e.key]; if (dir) this.held.delete(dir); };
    const clear = () => { this.held.clear(); this.virtual.clear(); };
    const vis = () => { if (document.hidden) clear(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', vis);
      clear();
    };
  }

  /** On-screen D-pad support. */
  setVirtual(dir: 'up' | 'down' | 'left' | 'right', pressed: boolean) {
    if (pressed) this.virtual.add(dir); else this.virtual.delete(dir);
  }
  clear() { this.held.clear(); this.virtual.clear(); }

  /** Movement vector, x: east+, y: south+ (towards the camera). Zero when input is disabled. */
  vector(): { x: number; y: number } {
    if (!this.enabled()) return { x: 0, y: 0 };
    const has = (d: 'up' | 'down' | 'left' | 'right') => this.held.has(d) || this.virtual.has(d);
    return { x: Number(has('right')) - Number(has('left')), y: Number(has('down')) - Number(has('up')) };
  }
}
