/**
 * Title screen. A live 3D backdrop (lazy-loaded; a CSS gradient shows until it is ready or if WebGL is
 * unavailable) with the menu on top. Every button does something:
 *   Continue      resumes the player's unfinished run (server: GET /games/current)
 *   New game      starts a fresh run with a new seed — Normal, or Hard once the player has escaped once
 *   Armory        equip the cape rewards unlocked by achievements
 *   Records       dashboard + leaderboard      How to play / Settings   dialogs
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Difficulty, type GameDto, type Stats } from '../services/api.service';
import { useAuth } from '../contexts/AuthContext';
import Dialog from '../components/Dialog';
import SettingsPanel from '../components/SettingsPanel';
import { CloseIcon, GearIcon, KeyIcon, TrophyIcon } from '../components/icons';
import { CHAPTERS } from '../game/levels';
import CapePicker from '../components/CapePicker';
import { SceneBoundary } from '../components/Feedback';
import { webglAvailable } from '../scene/support';

const MenuBackdrop = lazy(() => import('../scene/MenuBackdrop'));

const fmt = (ms: number | null) => (ms === null ? '—' : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`);

function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Dialog className="menu-overlay" labelledBy="how-title" onClose={onClose}>
      <div className="panel">
        <header className="panel-head">
          <h2 id="how-title">How to play</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </header>
        <ol className="howto">
          <li><strong>Five dungeons, thirteen sealed doors.</strong> Every room hides a golden key for the door out of it.</li>
          <li><strong>Break each seal:</strong> stand at the door and press <kbd>E</kbd>. Every door is guarded by its own live riddle from the University of Bedfordshire's Banana API — our server checks your answer.</li>
          <li><strong>Reach the glowing portal</strong> once every door is open to recover a relic and descend. Beware spikes and patrolling guards — you have three hearts.</li>
          <li><strong>Win rewards.</strong> Finishing earns a rank (S–A–B–C), achievements and hero capes. Every run is a new dungeon with new riddles; Hard mode unlocks after your first escape.</li>
        </ol>
        <dl className="controls">
          <div><dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows</dt><dd>Move</dd></div>
          <div><dt><kbd>E</kbd> · <kbd>Enter</kbd> · <kbd>Space</kbd></dt><dd>Use / break the seal</dd></div>
          <div><dt><kbd>Esc</kbd></dt><dd>Pause</dd></div>
        </dl>
        <footer className="panel-foot"><button type="button" onClick={onClose} data-autofocus>Got it</button></footer>
      </div>
    </Dialog>
  );
}

export default function Home() {
  const { user, serverStatus } = useAuth();
  const nav = useNavigate();
  const [current, setCurrent] = useState<GameDto | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dialog, setDialog] = useState<'settings' | 'how' | 'armory' | 'difficulty' | null>(null);
  const [gl] = useState(webglAvailable);

  useEffect(() => {
    if (!user || serverStatus !== 'online') return;
    let alive = true;
    api.currentGame().then((g) => alive && setCurrent(g ?? null)).catch(() => undefined);
    api.stats().then((s) => alive && setStats(s)).catch(() => undefined);
    return () => { alive = false; };
  }, [user, serverStatus]);

  const play = (mode: 'new' | 'continue', difficulty: Difficulty = 'normal') => nav('/play', { state: { mode, difficulty } });
  const startNew = () => (stats?.hardUnlocked ? setDialog('difficulty') : play('new'));

  return (
    <section className="title">
      <div className="title-bg" aria-hidden="true">
        {gl && <SceneBoundary><Suspense fallback={null}><MenuBackdrop /></Suspense></SceneBoundary>}
      </div>
      <div className="title-shade" aria-hidden="true" />

      <div className="title-inner">
        <header className="title-head">
          <p className="eyebrow">A browser dungeon crawler</p>
          <h1>Dungeon <span>Escape</span></h1>
          <p className="tagline">Claim the key. Break the seal. Outwit the Banana Oracle.</p>
        </header>

        <nav className="menu" aria-label="Main menu">
          {user ? (
            <>
              {current && (
                <button type="button" className="menu-primary" onClick={() => play('continue')} data-autofocus>
                  <span>Continue</span>
                  <small>Chapter {current.level + 1} · {CHAPTERS[Math.min(current.level, CHAPTERS.length - 1)]!.name} · door {Math.min(current.doorsOpened + 1, current.doorsInLevel)}/{current.doorsInLevel}{current.difficulty === 'hard' ? ' · Hard' : ''}</small>
                </button>
              )}
              <button type="button" className={current ? 'menu-secondary' : 'menu-primary'} onClick={startNew} data-autofocus={current ? undefined : true}>
                <span>{current ? 'New game' : 'Play'}</span>
                {!current && <small>Welcome back, {user.displayName}</small>}
              </button>
            </>
          ) : (
            <>
              <Link className="btn menu-primary" to="/register"><span>Create adventurer</span><small>Your progress and scores are saved to your account</small></Link>
              <Link className="btn menu-secondary" to="/login"><span>Log in</span></Link>
            </>
          )}
          <Link className="btn menu-secondary" to="/dashboard"><TrophyIcon /> <span>Records &amp; leaderboard</span></Link>
          <div className="menu-row">
            <button type="button" className="menu-tertiary" onClick={() => setDialog('how')}><KeyIcon /> How to play</button>
            {user && stats && <button type="button" className="menu-tertiary" onClick={() => setDialog('armory')}><TrophyIcon /> Armory</button>}
            <button type="button" className="menu-tertiary" onClick={() => setDialog('settings')}><GearIcon /> Settings</button>
          </div>
        </nav>

        {user && stats && stats.completed > 0 && (
          <p className="title-stats" aria-label="Your progress">
            {stats.completed} escape{stats.completed === 1 ? '' : 's'} · best {fmt(stats.bestTimeMs)} · {stats.relicsTotal} relics · {stats.puzzlesSolved} riddles solved
          </p>
        )}
        <p className="title-foot">
          CIS046-3 Software for Enterprise · Riddles from the{' '}
          <a href="https://marcconrad.com/uob/banana/doc.php" target="_blank" rel="noopener noreferrer">Banana API</a>{' '}
          (University of Bedfordshire)
        </p>
      </div>

      {dialog === 'settings' && <SettingsPanel onClose={() => setDialog(null)} />}
      {dialog === 'how' && <HowToPlay onClose={() => setDialog(null)} />}
      {dialog === 'armory' && stats && (
        <Dialog className="menu-overlay" labelledBy="armory-title" onClose={() => setDialog(null)}>
          <div className="panel">
            <header className="panel-head">
              <h2 id="armory-title">Armory</h2>
              <button type="button" className="icon-btn" onClick={() => setDialog(null)} aria-label="Close"><CloseIcon /></button>
            </header>
            <CapePicker stats={stats} onChange={setStats} />
            <footer className="panel-foot"><button type="button" onClick={() => setDialog(null)} data-autofocus>Done</button></footer>
          </div>
        </Dialog>
      )}
      {dialog === 'difficulty' && (
        <Dialog className="menu-overlay" labelledBy="diff-title" onClose={() => setDialog(null)}>
          <div className="panel narrow">
            <h2 id="diff-title">Choose your descent</h2>
            <div className="stack-btns">
              <button type="button" onClick={() => play('new', 'normal')} data-autofocus>Normal<small className="btn-sub">3 hearts · 3 attempts per riddle</small></button>
              <button type="button" className="ghost" onClick={() => play('new', 'hard')}>Hard<small className="btn-sub">2 hearts · 2 attempts per riddle · score ×1.5</small></button>
              <button type="button" className="ghost" onClick={() => setDialog(null)}>Cancel</button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
