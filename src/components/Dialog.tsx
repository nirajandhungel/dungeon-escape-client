/**
 * Accessible modal dialog: role=dialog + aria-modal, focus moves in on open, Tab is trapped inside,
 * Escape closes (only the top-most dialog reacts), and focus returns to whatever had it before.
 * The Escape keydown is `preventDefault()`ed so the game's global input handler ignores it (see input.ts).
 */
import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stack: symbol[] = [];

interface Props {
  label?: string;
  labelledBy?: string;
  className?: string;
  onClose?: () => void;
  /** Escape/backdrop are ignored while true (e.g. a request is in flight). */
  locked?: boolean;
  children: ReactNode;
}

export default function Dialog({ label, labelledBy, className = '', onClose, locked, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const isLocked = useRef(locked);
  close.current = onClose;
  isLocked.current = locked;

  useEffect(() => {
    const id = Symbol('dialog');
    stack.push(id);
    const previous = document.activeElement as HTMLElement | null;
    const el = root.current!;
    const start = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    start.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!isLocked.current) close.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0]!, last = items[items.length - 1]!;
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className={`overlay ${className}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose?.(); }}>
      <div ref={root} className="dialog" role="dialog" aria-modal="true" aria-label={label} aria-labelledby={labelledBy} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
