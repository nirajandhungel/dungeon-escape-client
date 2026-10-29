/**
 * Play.tsx — Main game page
 *
 * EVENT-DRIVEN ARCHITECTURE:
 * This component is the primary EVENT CONSUMER. It subscribes to the GameBus
 * and updates React state in response to game events emitted by DungeonScene.
 *
 * Event handlers registered here:
 *   key:collected   → setHasKey(true), call api.collectKey() to persist
 *   player:damaged  → update hp state, trigger heart animation
 *   door:locked     → update hint message
 *   door:touched    → open PuzzleModal
 *   door:unlocked   → close PuzzleModal, update hint
 *   game:paused     → show pause overlay
 *   game:resumed    → hide pause overlay
 *   game:won        → call api.complete(), show victory screen
 *   game:dead       → show death screen
 *
 * MEMORY MANAGEMENT:
 * All bus subscriptions are stored in the `off` array and called on cleanup.
 * The Phaser game is destroyed on cleanup, preventing canvas/WebGL leaks.
 * The interval timer (seconds) is cleared on cleanup.
 *
 * INTEROPERABILITY FLOW:
 * Player action (Phaser) → bus event → React state → PuzzleModal
 *   → api.requestPuzzle() → Express /games/:id/puzzles
 *   → BananaClient.fetchPuzzle() → https://marcconrad.com/uob/banana/api.php
 *   → puzzle stored in MongoDB → PuzzleDto returned to client
 *   → player submits answer → api.verify() → Express /puzzles/:id/verify
 *   → answer compared server-side → { correct: true } → bus.emit('puzzle:solved')
 *   → scene.unlockDoor() → door destroyed → exit reachable
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Phaser from 'phaser';
import { api, type GameDto } from '../api';
import { TypedEmitter, type GameEvents } from '../events';
import { DungeonScene, MAPS, TILE } from '../game/DungeonScene';
import PuzzleModal from '../components/PuzzleModal';

type Result = GameDto & { durationMs: number };
const MAX_HP = 3;
const LEVELS = MAPS.length; // 3

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Play() {
  const navigate = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameDto | null>(null);
  const [bus] = useState(() => new TypedEmitter<GameEvents>());
  const [level, setLevel] = useState(0);
  const [hasKey, setHasKey] = useState(false);
  const [doorOpen, setDoorOpen] = useState(false);
  const [hp, setHp] = useState(MAX_HP);
  const [paused, setPaused] = useState(false);
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const [hint, setHint] = useState('Find the golden key.');
  const [result, setResult] = useState<Result | null>(null);
  const [dead, setDead] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [phaserRef, setPhaserRef] = useState<Phaser.Game | null>(null);
  const [animateHeart, setAnimateHeart] = useState(false);
  const [doorLvl, setDoorLvl] = useState(false); // door unlocked on this level
  const gameIdRef = useRef<string | null>(null);

  // ── Bootstrap: create a new server-side game session ────────────────────
  useEffect(() => {
    api.newGame()
      .then((g) => { setGame(g); gameIdRef.current = g.id; })
      .catch(() => setError('Could not connect to the game server. Is the server running?'));
  }, []);

  // ── Mount Phaser when game session is ready ──────────────────────────────
  useEffect(() => {
    if (!game || !host.current) return;
    const id = game.id;
    const map = MAPS[level]!;

    const phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      pixelArt: true,
      backgroundColor: '#0d0b12',
      width: map[0]!.length * TILE,
      height: map.length * TILE,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
      scene: new DungeonScene(bus, level),
    });
    setPhaserRef(phaser);

    // ── Event subscriptions (producers: DungeonScene / PuzzleModal) ─────
    const off = [
      /**
       * key:collected — player walked over the key sprite.
       * PRODUCER: DungeonScene physics overlap handler
       * CONSUMER: (1) Update React HUD, (2) persist to server so score can be computed
       */
      bus.on('key:collected', () => {
        setHasKey(true);
        setHint('Key found! Try the iron door.');
        void api.collectKey(id);
      }),

      /**
       * player:damaged — player touched a trap or enemy.
       * PRODUCER: DungeonScene.takeDamage()
       * CONSUMER: Update HP display, animate hearts
       */
      bus.on('player:damaged', (remaining) => {
        setHp(remaining);
        setAnimateHeart(true);
        setTimeout(() => setAnimateHeart(false), 400);
        if (remaining <= 0) setHint('');
        else setHint(remaining === 1 ? '⚠️ One heart remaining!' : 'You took damage!');
      }),

      bus.on('door:locked', () => setHint('The door is sealed. Find the key first.')),

      /**
       * door:touched — player with key reached the door.
       * PRODUCER: DungeonScene.onDoor()
       * CONSUMER: Show PuzzleModal to request a Banana API puzzle
       */
      bus.on('door:touched', () => {
        setPuzzleOpen(true);
        setHint('Solve the rune puzzle to break the seal…');
      }),

      /**
       * door:unlocked — server confirmed correct puzzle answer.
       * PRODUCER: DungeonScene.unlockDoor() (after React emits puzzle:solved)
       * CONSUMER: Close puzzle UI, update hint
       */
      bus.on('door:unlocked', () => {
        setDoorOpen(true);
        setDoorLvl(true);
        setPuzzleOpen(false);
        setHint('The seal is broken! Reach the glowing exit!');
      }),

      bus.on('game:paused', () => setPaused(true)),
      bus.on('game:resumed', () => setPaused(false)),

      /**
       * game:won — player reached the exit tile.
       * PRODUCER: DungeonScene (exit overlap)
       * CONSUMER: Call api.complete() to compute and persist server-side score.
       */
      bus.on('game:won', () => {
        void api.complete(id).then(setResult).catch(() => setError('Score not saved — server error.'));
      }),

      bus.on('game:dead', () => {
        setDead(true);
        setHint('');
      }),
    ];

    // Cleanup: remove all listeners and destroy Phaser to free WebGL context
    return () => {
      off.forEach((f) => f());
      phaser.destroy(true);
      setPhaserRef(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, level]);

  // ── Elapsed timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!game || result || dead) return;
    const t = setInterval(
      () => setSeconds(Math.floor((Date.now() - new Date(game.startedAt).getTime()) / 1000)),
      500,
    );
    return () => clearInterval(t);
  }, [game, result, dead]);

  // ── Restart: re-create game session and reset all state ─────────────────
  const restart = useCallback(() => {
    if (phaserRef) { phaserRef.destroy(true); setPhaserRef(null); }
    setGame(null); setHasKey(false); setDoorOpen(false);
    setHp(MAX_HP); setPaused(false); setPuzzleOpen(false);
    setResult(null); setDead(false); setError(''); setSeconds(0);
    setHint('Find the golden key.'); setLevel(0); setDoorLvl(false);
    api.newGame()
      .then((g) => { setGame(g); gameIdRef.current = g.id; })
      .catch(() => setError('Could not start a new game.'));
  }, [phaserRef]);

  const hearts = Array.from({ length: MAX_HP }, (_, i) => ({
    full: i < hp,
    pulse: animateHeart && i === hp,
  }));

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <section className="play" aria-label="Dungeon Escape Game">
      {/* ── HUD ──────────────────────────────────────────────────────── */}
      <div className="hud" aria-live="polite" aria-label="Game status">
        <div className="hud-item">
          <span className="hud-label">Level</span>
          <span className="level-badge">{level + 1} / {LEVELS}</span>
        </div>
        <div className="hud-item">
          <span className="hud-label">HP</span>
          <div className="hp-hearts" aria-label={`${hp} of ${MAX_HP} hearts`}>
            {hearts.map((h, i) => (
              <span
                key={i}
                className={`heart ${h.full ? 'full' : 'empty'} ${h.pulse ? 'pulse' : ''}`}
                aria-hidden="true"
              >
                {h.full ? '♥' : '♡'}
              </span>
            ))}
          </div>
        </div>
        <div className="hud-item">
          <span className="hud-label">Key</span>
          <span className={`hud-value ${hasKey ? 'good' : ''}`}>{hasKey ? 'Held ✓' : 'Missing'}</span>
        </div>
        <div className="hud-item">
          <span className="hud-label">Door</span>
          <span className={`hud-value ${doorLvl ? 'good' : ''}`}>{doorLvl ? 'Open ✓' : 'Sealed'}</span>
        </div>
        <div className="hud-item hud-timer">
          <span className="hud-label">Time</span>
          <span className="hud-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTime(seconds)}</span>
        </div>
        {hint && !paused && (
          <div className="hud-hint" role="status">{hint}</div>
        )}
        {paused && (
          <div className="hud-hint" role="status" style={{ color: 'var(--amber)' }}>
            ⏸ Paused — press Esc or Resume to continue
          </div>
        )}
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────── */}
      <div className="stage" ref={host} id="game-canvas-host" aria-label="Game canvas" />

      {/* ── Controls hint ────────────────────────────────────────────── */}
      <div className="controls-hint" aria-label="Keyboard controls">
        <span><span className="key-icon">↑</span><span className="key-icon">↓</span><span className="key-icon">←</span><span className="key-icon">→</span> or <span className="key-icon">W</span><span className="key-icon">A</span><span className="key-icon">S</span><span className="key-icon">D</span> — Move</span>
        <span><span className="key-icon">Esc</span> — Pause</span>
      </div>

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && <p className="msg bad" role="alert">{error}</p>}

      {/* ── Pause overlay ─────────────────────────────────────────────── */}
      {paused && (
        <div className="overlay pause-overlay" role="dialog" aria-modal="true" aria-label="Game paused">
          <div className="card">
            <h2>Paused</h2>
            <ul className="pause-menu">
              <li><button id="pause-resume-btn" onClick={() => bus.emit('game:resumed', undefined)}>Resume</button></li>
              <li><button id="pause-restart-btn" className="ghost" onClick={restart}>Restart</button></li>
              <li><Link className="btn ghost" to="/dashboard" id="pause-dashboard-btn">Dashboard</Link></li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Puzzle modal ──────────────────────────────────────────────── */}
      {puzzleOpen && game && (
        <PuzzleModal
          gameId={game.id}
          onSolved={() => { setPuzzleOpen(false); bus.emit('puzzle:solved', undefined); }}
          onClose={() => { setPuzzleOpen(false); bus.emit('puzzle:dismissed', undefined); }}
        />
      )}

      {/* ── Victory screen ────────────────────────────────────────────── */}
      {result && !dead && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Victory">
          <div className="card victory-card" style={{ textAlign: 'center' }}>
            <h2>⚔️ You Escaped!</h2>
            <p className="muted" style={{ marginBottom: '.5rem' }}>The dungeon is behind you.</p>
            <div className="score-display">{result.score?.toLocaleString() ?? '—'}</div>
            <div className="score-label">Score</div>
            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', margin: '1rem 0', fontSize: '.9rem', color: 'var(--ink2)' }}>
              <span>⏱ {(result.durationMs / 1000).toFixed(1)}s</span>
              <span>✗ {result.wrongAttempts} wrong</span>
              <span>📊 Level {level + 1}</span>
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button id="victory-play-again-btn" onClick={restart}>Play Again</button>
              <Link className="btn ghost" to="/dashboard" id="victory-dashboard-btn">Dashboard</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Death screen ──────────────────────────────────────────────── */}
      {dead && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Game over">
          <div className="card death-card" style={{ textAlign: 'center' }}>
            <h2>💀 You Perished</h2>
            <p className="muted" style={{ margin: '.75rem 0' }}>The dungeon claimed another soul.</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button id="death-retry-btn" onClick={restart}>Try Again</button>
              <Link className="btn ghost" to="/" id="death-home-btn">Home</Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
