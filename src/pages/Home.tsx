import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

const FEATURES = [
  { icon: '🗝️', title: 'Find the Key', desc: 'Search the dungeon for the ancient iron key.' },
  { icon: '🧩', title: 'Solve the Puzzle', desc: 'A real Banana API puzzle seals the iron door.' },
  { icon: '🏆', title: 'Escape & Score', desc: 'Race against the clock. Your best run is recorded.' },
  { icon: '⚠️', title: 'Survive Hazards', desc: 'Traps and guards patrol the deeper levels.' },
];

export default function Home() {
  const { user } = useAuth();
  return (
    <section className="home">
      <div className="home-title">
        <h1>Dungeon Escape</h1>
        <p className="subtitle">A MERN Browser Adventure · University of Bedfordshire CIS046-3</p>
      </div>

      <p style={{ maxWidth: 560, color: 'var(--ink2)', lineHeight: 1.8 }}>
        Navigate treacherous stone corridors, collect the key, and solve a live puzzle
        served by the <strong style={{ color: 'var(--amber)' }}>Banana API</strong> to unlock
        the iron door — then reach the glowing exit.
      </p>

      <div className="home-features">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="home-cta">
        {user ? (
          <Link className="btn" to="/play" id="home-play-btn">Play Now</Link>
        ) : (
          <>
            <Link className="btn" to="/register" id="home-register-btn">Create Adventurer</Link>
            <Link className="btn ghost" to="/login" id="home-login-btn">Login</Link>
          </>
        )}
        <Link className="btn ghost" to="/dashboard" id="home-leaderboard-btn">Leaderboard</Link>
      </div>

      <p className="home-footer muted">
        Puzzle powered by the{' '}
        <a href="https://marcconrad.com/uob/banana/doc.php" target="_blank" rel="noopener noreferrer">
          Banana API
        </a>{' '}
        (University of Bedfordshire). Puzzles are fetched server-side and validated on the server —
        the solution is never sent to your browser.
      </p>
    </section>
  );
}
