import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, type Row, type Stats } from '../api';

const fmt = (ms: number | null) =>
  ms === null ? '—' : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`;

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.stats(), api.leaderboard()])
      .then(([s, b]) => { setStats(s); setBoard(b); })
      .catch(() => setError('Could not load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <section className="dash" aria-busy="true" aria-label="Loading dashboard">
      <div className="card">
        <div className="skeleton" style={{ width: '40%', height: '1.2rem', marginBottom: '1rem' }} />
        <div className="stat-grid">
          {[1,2,3,4].map((i) => <div key={i} className="stat-item"><div className="skeleton" style={{ height: '2rem' }} /></div>)}
        </div>
      </div>
      <div className="card">
        <div className="skeleton" style={{ width: '50%', height: '1.2rem', marginBottom: '1rem' }} />
        {[1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: '2.5rem', marginBottom: '.5rem' }} />)}
      </div>
    </section>
  );

  if (error) return (
    <section className="dash">
      <div className="error-state">
        <p>⚠️ {error}</p>
        <button onClick={() => location.reload()} style={{ marginTop: '1rem' }}>Retry</button>
      </div>
    </section>
  );

  const noPlays = (stats?.completed ?? 0) === 0;

  return (
    <section className="dash" aria-label="Player dashboard">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '.5rem' }}>
        <h1 style={{ fontSize: '1.5rem' }}>{user?.displayName ?? 'Adventurer'}</h1>
        <Link className="btn sm" to="/play" id="dash-play-btn">▶ Play</Link>
      </div>

      <div className="dash-grid">
        {/* ── Personal stats ────────────────────────────────────────── */}
        <div className="card">
          <h2>Your Records</h2>
          {noPlays ? (
            <div className="empty-state">
              <p>No escapes yet.</p>
              <Link className="btn" to="/play" id="dash-first-run-btn" style={{ marginTop: '1rem', display: 'inline-flex' }}>
                Begin Your First Run
              </Link>
            </div>
          ) : (
            <div className="stat-grid">
              <div className="stat-item">
                <div className="stat-num">{stats?.completed ?? '—'}</div>
                <div className="stat-lbl">Escapes</div>
              </div>
              <div className="stat-item">
                <div className="stat-num">{stats?.totalScore?.toLocaleString() ?? '—'}</div>
                <div className="stat-lbl">Total Score</div>
              </div>
              <div className="stat-item">
                <div className="stat-num">{fmt(stats?.bestTimeMs ?? null)}</div>
                <div className="stat-lbl">Best Time</div>
              </div>
              <div className="stat-item">
                <div className="stat-num">{stats?.recent?.filter(r => r.status === 'COMPLETED').length ?? '—'}</div>
                <div className="stat-lbl">Recent Wins</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Recent runs ────────────────────────────────────────────── */}
        {!noPlays && (
          <div className="card">
            <h2>Recent Runs</h2>
            {(stats?.recent ?? []).slice(0, 8).map((r) => (
              <div className="recent-run" key={r.id}>
                <span className={`run-status ${r.status === 'COMPLETED' ? 'completed' : 'progress'}`}>
                  {r.status === 'COMPLETED' ? 'Win' : 'Lost'}
                </span>
                <span className="muted" style={{ fontSize: '.78rem' }}>
                  {new Date(r.startedAt).toLocaleDateString()}
                </span>
                {r.score != null && <span className="run-score">{r.score.toLocaleString()}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Leaderboard ──────────────────────────────────────────────── */}
      <div className="card">
        <h2>Global Leaderboard</h2>
        {board.length === 0 ? (
          <div className="empty-state">
            <p>No scores yet — be the first!</p>
          </div>
        ) : (
          <table className="leaderboard-table" aria-label="Global leaderboard">
            <thead>
              <tr>
                <th style={{ width: '3rem' }}>Rank</th>
                <th>Adventurer</th>
                <th style={{ textAlign: 'right' }}>Score</th>
                <th style={{ textAlign: 'right' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r, i) => (
                <tr key={r.displayName + i} className={i < 3 ? `rank-${i + 1}` : ''}>
                  <td>
                    <span className="rank-medal">{RANK_MEDALS[i] ?? `#${i + 1}`}</span>
                  </td>
                  <td>{r.displayName}</td>
                  <td style={{ textAlign: 'right' }}>{r.score.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
