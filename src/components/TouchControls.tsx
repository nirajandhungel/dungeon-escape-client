import type { InputController } from '../game/input';

type Dir = 'up' | 'down' | 'left' | 'right';
const GLYPH: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

/** On-screen D-pad + action button. Visible only on touch devices (CSS `pointer: coarse`); drives the same InputController as the keyboard. */
export default function TouchControls({ input, canUse, onInteract }: { input: InputController; canUse: boolean; onInteract(): void }) {
  const press = (dir: Dir) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); input.setVirtual(dir, true); },
    onPointerUp: () => input.setVirtual(dir, false),
    onPointerCancel: () => input.setVirtual(dir, false),
    onLostPointerCapture: () => input.setVirtual(dir, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  return (
    <div className="touch" aria-label="Touch controls">
      <div className="dpad">
        {(['up', 'left', 'right', 'down'] as Dir[]).map((d) => (
          <button key={d} type="button" className={`dpad-${d}`} aria-label={`Move ${d}`} {...press(d)}>{GLYPH[d]}</button>
        ))}
      </div>
      <button type="button" className={`touch-use ${canUse ? 'ready' : ''}`} onClick={onInteract} disabled={!canUse}>Use</button>
    </div>
  );
}
