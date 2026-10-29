/**
 * Play.tsx — the game screen and the main EVENT CONSUMER.
 *
 *   keyboard / touch ──▶ InputController ──▶ GameEngine (rules) ──▶ typed events on the bus
 *                                                                        │
 *      ┌─────────────────────────────────────────────────────────────────┘
 *      ▼
 *   Play.tsx (this file)  ── updates HUD state, calls the server at the right moments:
 *        key:collected(i) → POST /games/:id/key {index}    (key i, for door i, is saved)
 *        door:touched(i)  → opens <BananaChallengeModal>   (which calls the Banana-backed endpoints)
 *        puzzle:solved    → engine.unlockDoor()            (only after the SERVER said correct)
 *        level:cleared    → POST /games/:id/advance        (next chapter; a relic is recovered)
 *        game:won         → POST /games/:id/complete       (server scores the run and awards rank, achievements, capes)
 *   audio.ts also subscribes to the same bus (sound effects) without Play knowing about it.
 *
 * A run is a campaign of chapters; each chapter is a chain of rooms, and EVERY door has its own key and its own Banana
 * challenge. The dungeon for chapter N is generated from the run's server-issued seed, so a resume rebuilds the same rooms.
 *
 * LIFECYCLE SAFETY: every bus subscription is unsubscribed in the effect cleanup; input listeners are removed on
 * unmount; the WebGL canvas is torn down by React Three Fiber when this component unmounts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, type Cape, type Difficulty, type GameDto, type Rewards, type VerifyResult } from '../api';
import { TypedEmitter, type GameEvents } from '../events';
import { GameEngine } from '../game/engine';
import { CHAPTERS, generateLevel } from '../game/levels';
import { InputController } from '../game/input';
import { attachAudio } from '../audio';
import { updateSettings, useSettings } from '../settings';
import { useAuth } from '../auth';
import GameScene from '../scene/GameScene';
import { webglAvailable } from '../scene/support';
import HUD from '../components/HUD';
import TouchControls from '../components/TouchControls';
import Dialog from '../components/Dialog';
import SettingsPanel from '../components/SettingsPanel';
import BananaChallengeModal from '../components/BananaChallengeModal';
import { ErrorScreen, LoadingScreen, SceneBoundary } from '../components/Feedback';
import { SkullIcon, TrophyIcon } from '../components/icons';

type Won = GameDto & { durationMs: number; rewards: Rewards };
type Screen = 'play' | 'dead' | 'cleared' | 'won';

const DEFAULT_CAPE = '#8a2a2a';
const fmtDuration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const chapterName = (level: number) => CHAPTERS[Math.min(level, CHAPTERS.length - 1)]!.name;

export default function Play() {
  const nav = useNavigate();
  const location = useLocation();
  const { serverStatus, retryServer } = useAuth();
  const { sound } = useSettings();
  const [initial] = useState(() => {
    const s = location.state as { mode?: 'new' | 'continue'; difficulty?: Difficulty } | null;
    return { mode: s?.mode ?? 'continue', difficulty: s?.difficulty ?? 'normal' } as const;
  });

  const [bus] = useState(() => new TypedEmitter<GameEvents>());
  const [game, setGame] = useState<GameDto | null>(null);
  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootSeq, setBootSeq] = useState(0);
  const [bootMode, setBootMode] = useState<'new' | 'continue'>(initial.mode);
  const [bootDifficulty, setBootDifficulty] = useState<Difficulty>(initial.difficulty);
  const [attempt, setAttempt] = useState(0);            // bumped to rebuild the engine for "retry level"
  const [capeColor, setCapeColor] = useState(DEFAULT_CAPE);

  const [hp, setHp] = useState(3);
  const [rev, setRev] = useState(0);                    // bumped when keys/doors change so the HUD re-reads the engine
  const [prompt, setPrompt] = useState(false);
  const [notice, setNotice] = useState('');
  const [hurtKey, setHurtKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [challenge, setChallenge] = useState<number | null>(null);   // index of the door being challenged
  const [settings, setSettings] = useState(false);
  const [screen, setScreen] = useState<Screen>('play');
  const [next, setNext] = useState<{ game: GameDto | null; error: string }>({ game: null, error: '' });
  const [won, setWon] = useState<Won | null>(null);
  const [saveError, setSaveError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [lost, setLost] = useState(false);

  const gameRef = useRef<GameDto | null>(null);
  gameRef.current = game;
  const engineRef = useRef<GameEngine | null>(null);
  const keySync = useRef(new Map<number, Promise<boolean>>());
  const noticeTimer = useRef<number>();

  const flash = useCallback((text: string, ms = 2600) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), ms);
  }, []);

  // ── Bootstrap: resume the current run, or start a new one ───────────────────────────────
  useEffect(() => {
    let alive = true;
    setBoot('loading');
    (async () => {
      try {
        const existing = bootMode === 'new' ? undefined : await api.currentGame();
        // Hard is a reward; if the server says it is still locked, fall back to a normal run rather than failing.
        const g: GameDto = existing ?? await api.newGame(bootDifficulty).catch((e: unknown) =>
          e instanceof ApiError && e.code === 'hard_locked' ? api.newGame('normal') : Promise.reject(e));
        if (!alive) return;
        setGame(g);
        setBoot('ready');
        if (location.state) nav('/play', { replace: true, state: null });   // a reload must not start another new run
        api.stats().then((s) => alive && setCapeColor(s.capes.find((c) => c.id === s.cape)?.color ?? DEFAULT_CAPE)).catch(() => undefined);
      } catch {
        if (alive) setBoot('error');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootSeq]);

  const startNewRun = useCallback((difficulty?: Difficulty) => {
    setBootMode('new'); setBootDifficulty(difficulty ?? gameRef.current?.difficulty ?? 'normal');
    setGame(null); setWon(null); setSaveError(''); setBootSeq((n) => n + 1);
  }, []);

  // ── The engine for the chapter being played. Rebuilt on a new run, a new chapter, or "retry level". ──
  const engine = useMemo(() => {
    const g = gameRef.current;
    if (!g) return null;
    keySync.current = new Map();
    return new GameEngine(generateLevel(g.seed, g.level, g.doorsInLevel), bus.emit.bind(bus), {
      keysCollected: g.keysCollected,
      doorsOpened: g.doorsOpened,
      final: g.level >= g.levelCount - 1,
      maxHp: g.difficulty === 'hard' ? 2 : 3,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, game?.level, attempt, bus]);
  engineRef.current = engine;
  // Development-only hook so the browser smoke test can observe and drive the engine (stripped from production builds).
  if (import.meta.env.DEV) (window as unknown as { __engine?: GameEngine | null }).__engine = engine;

  const input = useMemo(() => {
    const c = new InputController({
      onInteract: () => engineRef.current?.interact(),
      onPause: () => engineRef.current?.togglePause(),
    });
    c.enabled = () => engineRef.current?.phase === 'PLAYING';
    return c;
  }, []);
  useEffect(() => input.attach(), [input]);

  // Reset presentation state whenever a fresh engine takes over.
  useEffect(() => {
    if (!engine) return;
    setHp(engine.hp); setPrompt(false); setPaused(false); setChallenge(null); setScreen('play'); setNotice(''); setRev((n) => n + 1);
    input.clear();
  }, [engine, input]);

  useEffect(() => attachAudio(bus), [bus]);

  /** Ask the server to move the run to the next chapter (also the retry action when that call failed). */
  const advance = useCallback(async () => {
    const g = gameRef.current;
    if (!g) return;
    setNext({ game: null, error: '' });
    try { setNext({ game: await api.advance(g.id), error: '' }); }
    catch (e) { setNext({ game: null, error: e instanceof ApiError ? e.message : 'Could not save your progress. Check your connection.' }); }
  }, []);

  // ── Event subscriptions (consumers of the engine's events) ──────────────────────────────
  useEffect(() => {
    if (!engine || !game) return;
    const id = game.id;
    const off = [
      bus.on('key:collected', (i) => {
        setRev((n) => n + 1);
        flash('You took a golden key');
        keySync.current.set(i, api.collectKey(id, i).then(() => true).catch(() => false));   // saved server-side (re-tried before the challenge)
      }),
      bus.on('player:damaged', (left) => { setHp(left); setHurtKey((n) => n + 1); }),
      bus.on('interact:available', (t) => setPrompt(t !== null)),
      bus.on('door:locked', () => flash('The door is sealed. Find its golden key first.')),
      bus.on('door:touched', (door) => {
        input.clear();
        void (async () => {
          // The server only issues a challenge after it knows this door's key was collected: make sure that write landed.
          // (Idempotent, so resumed runs whose key the server already holds simply get a 200.) Bounded wait: a hung server
          // must never leave the hero frozen in CHALLENGE with no dialog on screen.
          const saved = (keySync.current.get(door) ?? Promise.resolve(false)).then((v) => v || api.collectKey(id, door).then(() => true).catch(() => false));
          const ok = await Promise.race([saved, new Promise<boolean>((r) => setTimeout(() => r(false), 8000))]);
          if (!ok) { engine.dismissChallenge(); flash('Could not reach the server. Try the door again.'); return; }
          setChallenge(door);
        })();
      }),
      bus.on('door:unlocked', (door) => {
        setChallenge(null); setRev((n) => n + 1);
        flash(engine.allOpen ? 'Every seal is broken! Find the portal.' : `Door ${door + 1} opens — on to the next room.`, 3600);
      }),
      bus.on('game:paused', () => setPaused(true)),
      bus.on('game:resumed', () => setPaused(false)),
      bus.on('level:cleared', (lvl) => {
        if (lvl >= game.levelCount - 1) return;          // final chapter → game:won handles it
        setScreen('cleared');
        void advance();
      }),
      bus.on('game:won', () => {
        setScreen('won');
        setSaveError('');
        void api.complete(id).then(setWon).catch((e) => setSaveError(e instanceof ApiError ? e.message : 'Could not save your score.'));
      }),
      bus.on('game:dead', () => setScreen('dead')),
    ];
    return () => off.forEach((f) => f());
  }, [engine, game, bus, flash, input, advance]);

  // ── Timer: the server's wall clock since the run started ───────────────────────────────
  useEffect(() => {
    if (!game || screen === 'won') return;
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(game.startedAt)) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [game, screen]);

  // ── Housekeeping: no page scroll, auto-pause when the tab is hidden ─────────────────────
  useEffect(() => {
    document.documentElement.classList.add('is-playing');
    const onHide = () => { const e = engineRef.current; if (document.hidden && e?.phase === 'PLAYING') e.togglePause(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.documentElement.classList.remove('is-playing'); document.removeEventListener('visibilitychange', onHide); window.clearTimeout(noticeTimer.current); };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────────────────
  const closeChallenge = () => { setChallenge(null); engine?.dismissChallenge(); };
  const solved = (r: VerifyResult) => {
    setChallenge(null);
    bus.emit('puzzle:solved', undefined);
    // Mirror the server's new progress locally (the engine is NOT rebuilt: it is keyed by game id / chapter only).
    setGame((g) => g && {
      ...g,
      doorsOpened: r.doorsOpened ?? g.doorsOpened + 1,
      keysCollected: Math.max(g.keysCollected, r.doorsOpened ?? g.doorsOpened + 1),
      status: r.chapterUnlocked ? 'DOOR_UNLOCKED' : g.status,
    });
    engine?.unlockDoor();
  };
  const descend = () => { if (next.game) { setGame(next.game); setNext({ game: null, error: '' }); } };
  const resume = () => engine?.togglePause();
  const equipNow = async (c: Cape) => { try { await api.setCape(c.id); setCapeColor(c.color); } catch { flash('Could not equip that cape.'); } };

  // ── Render ──────────────────────────────────────────────────────────────────────────────
  if (!webglAvailable()) {
    return <ErrorScreen title="3D graphics unavailable" message="This browser cannot create a WebGL context, which the dungeon needs. Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled." />;
  }
  if (boot === 'error') {
    return (
      <ErrorScreen title="The dungeon gates are shut" message="Could not reach the game server. Make sure it is running, then try again."
        actions={<><button type="button" onClick={() => { retryServer(); setBootSeq((n) => n + 1); }}>Try again</button><Link className="btn ghost" to="/">Back to menu</Link></>} />
    );
  }
  if (boot === 'loading' || !game || !engine) return <LoadingScreen label={bootMode === 'new' ? 'Forging a new dungeon…' : 'Returning to the dungeon…'} />;

  void rev;   // re-render trigger: HUD values below are read straight from the engine
  const level = engine.level;
  const hard = game.difficulty === 'hard';
  const doorLabel = (d: number) => `Chapter ${game.level + 1} · Sealed door ${d + 1} of ${game.doorsInLevel}`;
  const nextChapter = next.game ? chapterName(next.game.level) : '';

  return (
    <section className="play" aria-label="Dungeon Escape game">
      <SceneBoundary>
        <GameScene engine={engine} input={input} cape={capeColor} onContextLost={() => setLost(true)} />
      </SceneBoundary>
      <div className="vignette" aria-hidden="true" />
      {hurtKey > 0 && <div key={hurtKey} className="hurt-flash" aria-hidden="true" />}

      <HUD
        levelName={level.name} level={game.level} levelCount={game.levelCount}
        hp={hp} maxHp={engine.maxHp} keyHeld={engine.hasKeyForNext}
        doorsOpen={engine.doorsOpenCount} doorsTotal={level.doors.length}
        relics={game.relics} hard={hard} seconds={seconds}
        prompt={prompt && !paused && challenge === null} notice={notice} paused={paused}
        soundOn={sound} hurtKey={hurtKey}
        onPause={resume} onToggleSound={() => updateSettings({ sound: !sound })}
        onInteract={() => engine.interact()}
      />
      <TouchControls input={input} canUse={prompt && screen === 'play' && !paused && challenge === null} onInteract={() => engine.interact()} />

      {serverStatus === 'offline' && (
        <div className="toast bad" role="alert">Server offline — progress may not save. <button type="button" className="ghost sm" onClick={retryServer}>Retry</button></div>
      )}

      {challenge !== null && <BananaChallengeModal gameId={game.id} levelLabel={doorLabel(challenge)} onSolved={solved} onClose={closeChallenge} />}

      {paused && !settings && (
        <Dialog className="menu-overlay" label="Game paused" onClose={resume}>
          <div className="panel narrow">
            <h2>Paused</h2>
            <p className="muted">
              {level.name} · door {Math.min(engine.doorsOpenCount + 1, level.doors.length)} of {level.doors.length}{hard ? ' · Hard' : ''}.
              The clock keeps running — it is measured by the server.
            </p>
            <div className="stack-btns">
              <button type="button" onClick={resume} data-autofocus>Resume</button>
              <button type="button" className="ghost" onClick={() => setSettings(true)}>Settings</button>
              <button type="button" className="ghost" onClick={() => startNewRun()}>Restart run</button>
              <Link className="btn ghost" to="/">Quit to menu</Link>
            </div>
          </div>
        </Dialog>
      )}
      {settings && <SettingsPanel onClose={() => setSettings(false)} />}

      {screen === 'cleared' && (
        <Dialog className="menu-overlay" label="Chapter cleared" locked>
          <div className="panel narrow center good">
            <p className="eyebrow">Relic {game.level + 1} of {game.levelCount} recovered</p>
            <h2>{level.name} falls silent</h2>
            <div className="relics big" role="img" aria-label={`${game.level + 1} of ${game.levelCount} relics`}>
              {Array.from({ length: game.levelCount }, (_, i) => <i key={i} className={i <= game.level ? 'got' : ''} />)}
            </div>
            {next.error ? (
              <>
                <p className="feedback bad" role="alert">{next.error}</p>
                <div className="stack-btns">
                  <button type="button" onClick={() => void advance()} data-autofocus>Try again</button>
                  <Link className="btn ghost" to="/">Quit to menu</Link>
                </div>
              </>
            ) : next.game ? (
              <>
                <p className="muted">Next: {nextChapter} · {next.game.doorsInLevel} sealed doors</p>
                <button type="button" onClick={descend} data-autofocus>Descend</button>
              </>
            ) : <p className="muted" role="status">Saving your progress…</p>}
          </div>
        </Dialog>
      )}

      {screen === 'dead' && (
        <Dialog className="menu-overlay danger" label="You died" locked>
          <div className="panel narrow center bad">
            <SkullIcon className="big-icon" />
            <h2>You perished</h2>
            <p className="muted">The dungeon claimed another soul. Your keys and broken doors are kept.</p>
            <div className="stack-btns">
              <button type="button" onClick={() => setAttempt((n) => n + 1)} data-autofocus>Retry chapter</button>
              <button type="button" className="ghost" onClick={() => startNewRun()}>Restart run</button>
              <Link className="btn ghost" to="/">Quit to menu</Link>
            </div>
          </div>
        </Dialog>
      )}

      {screen === 'won' && (
        <Dialog className="menu-overlay" label="Victory" locked>
          <div className="panel center good victory">
            <TrophyIcon className="big-icon gold" />
            <h2>You escaped the Oracle's Vault!</h2>
            {won ? (
              <>
                <div className={`rank rank-${won.rewards.rank}`} aria-label={`Rank ${won.rewards.rank}`}>{won.rewards.rank}</div>
                <div className="score">{won.rewards.score.toLocaleString()}</div>
                <p className="muted">
                  score · {fmtDuration(won.durationMs)} · {won.wrongAttempts} wrong answer{won.wrongAttempts === 1 ? '' : 's'} · {won.rewards.relics} relics{hard ? ' · Hard' : ''}
                </p>
                {won.rewards.newAchievements.length > 0 && (
                  <div className="unlocks">
                    <h3>Achievements unlocked</h3>
                    <ul>{won.rewards.newAchievements.map((a) => <li key={a.id}><TrophyIcon /><span><strong>{a.title}</strong> {a.description}</span></li>)}</ul>
                  </div>
                )}
                {won.rewards.newCapes.length > 0 && (
                  <div className="unlocks">
                    <h3>New cape{won.rewards.newCapes.length === 1 ? '' : 's'}</h3>
                    <ul>{won.rewards.newCapes.map((c) => (
                      <li key={c.id}><i className="swatch" style={{ background: c.color }} aria-hidden="true" /><span><strong>{c.name}</strong></span>
                        <button type="button" className="ghost sm" onClick={() => void equipNow(c)} disabled={capeColor === c.color}>{capeColor === c.color ? 'Equipped' : 'Equip'}</button></li>
                    ))}</ul>
                  </div>
                )}
              </>
            ) : saveError ? <p className="feedback bad" role="alert">{saveError}</p> : <p className="muted" role="status">Recording your escape…</p>}
            <div className="stack-btns">
              <button type="button" onClick={() => startNewRun(hard ? 'hard' : 'normal')} data-autofocus>Play again — a new dungeon every run</button>
              {!hard && won && <button type="button" className="ghost" onClick={() => startNewRun('hard')}>Take on Hard mode</button>}
              <Link className="btn ghost" to="/dashboard">Records, rewards &amp; leaderboard</Link>
              <Link className="btn ghost" to="/">Menu</Link>
            </div>
          </div>
        </Dialog>
      )}

      {lost && (
        <ErrorScreen title="Graphics context lost" message="The browser reclaimed the graphics card. Reload to continue — your progress is saved."
          actions={<button type="button" onClick={() => window.location.reload()}>Reload</button>} />
      )}
    </section>
  );
}
