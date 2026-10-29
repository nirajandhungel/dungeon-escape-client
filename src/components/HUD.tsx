import { HeartIcon, KeyIcon, LockIcon, UnlockIcon, PauseIcon, ClockIcon, SoundIcon, MuteIcon } from './icons';

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export interface HudProps {
  levelName: string;
  level: number;
  levelCount: number;
  hp: number;
  maxHp: number;
  keyHeld: boolean;        // is the key for the NEXT sealed door in hand?
  doorsOpen: number;       // doors broken in this chapter
  doorsTotal: number;      // doors in this chapter
  relics: number;          // chapters cleared in this run
  hard: boolean;
  seconds: number;
  prompt: boolean;
  notice: string;
  paused: boolean;
  soundOn: boolean;
  hurtKey: number;
  onPause(): void;
  onToggleSound(): void;
  onInteract(): void;
}

/** Objective text follows the state of the level. */
const objective = (p: HudProps) =>
  p.doorsOpen >= p.doorsTotal ? 'Every seal is broken — reach the glowing portal'
  : p.keyHeld ? `Take the key to the sealed door (${p.doorsOpen + 1} of ${p.doorsTotal})`
  : `Find the golden key — door ${p.doorsOpen + 1} of ${p.doorsTotal}`;

/**
 * Heads-up display. Compact, translucent and pinned to the screen edges so the dungeon stays visible.
 * Status is in an aria-live region only for changes that matter (objective / notices), not every tick.
 */
export default function HUD(p: HudProps) {
  const allOpen = p.doorsOpen >= p.doorsTotal;
  return (
    <div className="hud" role="region" aria-label="Game status">
      <div className="hud-top">
        <div className="hud-left">
        <div className="hud-panel hud-level">
          <span className="eyebrow">
            Chapter {p.level + 1} / {p.levelCount}
            {p.hard && <span className="tag-hard">Hard</span>}
          </span>
          <strong className="hud-name">{p.levelName}</strong>
          <span className="hud-objective" aria-live="polite">{objective(p)}</span>
          <span className="relics" role="img" aria-label={`Relics recovered: ${p.relics} of ${p.levelCount}`}>
            {Array.from({ length: p.levelCount }, (_, i) => <i key={i} className={i < p.relics ? 'got' : ''} />)}
          </span>
        </div>
        <div className="hud-panel hud-vitals">
          <div className="hearts" role="img" aria-label={`Health: ${p.hp} of ${p.maxHp}`}>
            {Array.from({ length: p.maxHp }, (_, i) => (
              <span key={i} className={`heart ${i < p.hp ? 'full' : 'empty'} ${i === p.hp && p.hurtKey ? 'lost' : ''}`} data-k={p.hurtKey}>
                <HeartIcon />
              </span>
            ))}
          </div>
          <span className={`chip ${p.keyHeld ? 'on' : ''}`}><KeyIcon /> <span>{p.keyHeld ? 'Key held' : 'No key'}</span></span>
          <span className={`chip ${allOpen ? 'ok' : ''}`}>{allOpen ? <UnlockIcon /> : <LockIcon />} <span>Doors {p.doorsOpen}/{p.doorsTotal}</span></span>
        </div>
        </div>
        <div className="hud-right">
          <div className="hud-panel hud-timer" role="timer" aria-label="Elapsed time"><ClockIcon /><span>{fmtTime(p.seconds)}</span></div>
          <button type="button" className="icon-btn hud-btn" onClick={p.onToggleSound} aria-pressed={p.soundOn} aria-label={p.soundOn ? 'Mute sound' : 'Unmute sound'}>
            {p.soundOn ? <SoundIcon /> : <MuteIcon />}
          </button>
          <button type="button" className="icon-btn hud-btn" onClick={p.onPause} aria-label="Pause game"><PauseIcon /></button>
        </div>
      </div>

      <div className="hud-bottom">
        <div className="hud-center">
          {p.paused ? (
            <div className="prompt">Paused</div>
          ) : p.prompt ? (
            <button type="button" className="prompt prompt-action" onClick={p.onInteract}>
              <kbd>E</kbd> Break the seal
            </button>
          ) : p.notice ? (
            <div className="prompt notice" role="status">{p.notice}</div>
          ) : null}
        </div>

        <div className="hud-panel hud-keys" aria-hidden="true">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> move</span>
          <span><kbd>E</kbd> use</span>
          <span><kbd>Esc</kbd> pause</span>
        </div>
      </div>
    </div>
  );
}
