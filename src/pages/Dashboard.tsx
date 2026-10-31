import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, type GameDto, type Row, type Stats } from '../services/api.service';
import { CHAPTERS } from '../game/levels';
import { TrophyIcon } from '../components/icons';
import CapePicker from '../components/CapePicker';

const fmt = (ms: number | null) =>
  ms === null ? '—' : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`;

const MEDALS = ['🥇', '🥈', '🥉'];

const runLabel = (g: GameDto) => {
  const hard = g.difficulty === 'hard' ? ' · Hard' : '';
  return g.status === 'COMPLETED' ? { text: `Escaped · rank ${g.rank ?? '—'}${hard}`, cls: 'completed' }
    : g.status === 'ABANDONED' ? { text: `Abandoned · ${g.doorsOpenedTotal}/${g.doorsTotal} doors${hard}`, cls: 'abandoned' }
    : { text: `In progress · ${CHAPTERS[Math.min(g.level, CHAPTERS.length - 1)]!.name}${hard}`, cls: 'progress' };
};

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    Promise.all([api.stats(), api.leaderboard()])
      .then(([s, b]) => { if (alive) { setStats(s); setBoard(b); } })
      .catch(() => alive && setError('Could not load your records.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [seq]);

  if (loading) return (
    <section className="dash" aria-busy="true" aria-label="Loading records">
      <div className="card"><div className="skeleton" style={{ width: '40%', height: '1.2rem', marginBottom: '1rem' }} />
        <div className="stat-grid">{[1, 2, 3, 4].map((i) => <div key={i} className="stat-item"><div className="skeleton" style={{ height: '2rem' }} /></div>)}</div></div>
    </section>
  );

  if (error) return (
    <section className="dash"><div className="error-state" role="alert"><p>{error}</p>
      <button type="button" onClick={() => setSeq((n) => n + 1)}>Try again</button></div></section>
  );

  const noPlays = (stats?.runs ?? 0) === 0;

  return (
    <section className="dash" aria-label="Player records">
      <header className="dash-head">
        <div><p className="eyebrow">Adventurer</p><h1>{user?.displayName ?? 'Adventurer'}</h1></div>
        <Link className="btn" to="/play" state={{ mode: 'continue' }} id="dash-play-btn">Enter the dungeon</Link>
      </header>

      <div className="dash-grid">
        <div className="card">
          <h2>Your records</h2>
          {noPlays ? (
            <div className="empty-state"><p>No escapes yet.</p>
              <Link className="btn" to="/play" state={{ mode: 'new' }} id="dash-first-run-btn">Begin your first run</Link></div>
          ) : (
            <div className="stat-grid">
              <div className="stat-item"><div className="stat-num">{stats?.completed ?? 0}<small>/{stats?.runs ?? 0}</small></div><div className="stat-lbl">Escapes / runs</div></div>
              <div className="stat-item"><div className="stat-num">{stats?.bestScore?.toLocaleString() ?? '—'}</div><div className="stat-lbl">Best score</div></div>
              <div className="stat-item"><div className="stat-num">{fmt(stats?.bestTimeMs ?? null)}</div><div className="stat-lbl">Best time</div></div>
              <div className="stat-item"><div className="stat-num">{stats?.puzzlesSolved ?? 0}</div><div className="stat-lbl">Riddles solved</div></div>
              <div className="stat-item"><div className="stat-num">{stats?.relicsTotal ?? 0}</div><div className="stat-lbl">Relics</div></div>
              <div className="stat-item"><div className="stat-num">{stats?.hardUnlocked ? 'Open' : 'Locked'}</div><div className="stat-lbl">Hard mode</div></div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Achievements</h2>
          {stats && stats.achievements.length > 0 ? (
            <ul className="achievements">
              {stats.achievements.map((a) => (
                <li key={a.id}><TrophyIcon /><div><strong>{a.title}</strong><span>{a.description}</span></div></li>
              ))}
            </ul>
          ) : <div className="empty-state"><p>Escape the dungeon to earn your first achievement.</p></div>}
        </div>
      </div>

      {stats && (
        <div className="card">
          <h2>Armory</h2>
          <CapePicker stats={stats} onChange={setStats} />
        </div>
      )}

      {!noPlays && (
        <div className="card">
          <h2>Recent runs</h2>
          {(stats?.recent ?? []).slice(0, 8).map((r) => {
            const l = runLabel(r);
            return (
              <div className="recent-run" key={r.id}>
                <span className={`run-status ${l.cls}`}>{l.text}</span>
                <span className="muted">{new Date(r.startedAt).toLocaleString()}</span>
                {r.score != null && <span className="run-score">{r.score.toLocaleString()}</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2>Global leaderboard</h2>
        {board.length === 0 ? <div className="empty-state"><p>No scores yet — be the first!</p></div> : (
          <table className="leaderboard-table" aria-label="Global leaderboard">
            <thead><tr><th style={{ width: '3.5rem' }}>#</th><th>Adventurer</th><th>Grade</th><th style={{ textAlign: 'right' }}>Score</th><th style={{ textAlign: 'right' }}>Time</th></tr></thead>
            <tbody>
              {board.map((r, i) => (
                <tr key={r.displayName + i} className={i < 3 ? `rank-${i + 1}` : ''}>
                  <td>{MEDALS[i] ?? `#${i + 1}`}</td><td>{r.displayName}{r.difficulty === 'hard' && <span className="tag-hard">Hard</span>}</td><td><span className={`grade rank-${r.rank}`}>{r.rank}</span></td>
                  <td style={{ textAlign: 'right' }}>{r.score.toLocaleString()}</td><td style={{ textAlign: 'right' }}>{fmt(r.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
