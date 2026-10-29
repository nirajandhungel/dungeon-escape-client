/**
 * App.tsx — Root component
 *
 * EVENT-DRIVEN ARCHITECTURE:
 * - AuthProvider wraps everything so server status & user identity are
 *   available to every component via context (reactive to events).
 * - ServerOfflineBanner is a passive consumer of server status — it appears
 *   and disappears automatically as the health-check poll fires.
 * - When server is offline, the app degrades gracefully: navigation still
 *   works, but protected routes show a clear "Server offline" state with retry.
 */
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { api } from './api';
import { AuthProvider, useAuth } from './auth';
import ServerOfflineBanner from './components/ServerOfflineBanner';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Play from './pages/Play';
import Dashboard from './pages/Dashboard';

/** Full-screen offline gate — shown instead of protected content when server is down */
function OfflineGate() {
  const { retryServer } = useAuth();
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: '1.5rem',
      color: 'var(--ink2)', textAlign: 'center', padding: '2rem',
    }}>
      <div style={{ fontSize: '4rem' }}>🔌</div>
      <h2 style={{ color: 'var(--fg)', margin: 0 }}>Server Offline</h2>
      <p style={{ maxWidth: 400, margin: 0, lineHeight: 1.7 }}>
        The game server cannot be reached right now. Your progress is safe —
        check your server is running at <code style={{ color: 'var(--amber)' }}>localhost:4000</code>.
      </p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button id="offline-gate-retry-btn" onClick={retryServer}>↻ Retry Connection</button>
        <Link className="btn ghost" to="/">Home</Link>
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading, serverStatus } = useAuth();

  if (serverStatus === 'checking' || loading) return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: 'var(--muted)' }}>
      <span>Connecting…</span>
    </div>
  );
  if (serverStatus === 'offline') return <OfflineGate />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function Nav() {
  const { user, setUser, serverStatus } = useAuth();
  return (
    <nav aria-label="Main navigation">
      <Link to="/" className="brand" aria-label="Dungeon Escape — Home">
        ⚔ Dungeon Escape
      </Link>
      {serverStatus === 'offline' && (
        <span style={{ color: '#f87171', fontSize: '.75rem', fontWeight: 600 }}>
          ● OFFLINE
        </span>
      )}
      {user ? (
        <>
          <Link to="/play" id="nav-play">Play</Link>
          <Link to="/dashboard" id="nav-dashboard">Dashboard</Link>
          <button
            id="nav-logout"
            className="ghost"
            onClick={async () => { await api.logout(); setUser(null); }}
            aria-label={`Logout ${user.displayName}`}
          >
            {user.displayName} · Logout
          </button>
        </>
      ) : (
        <>
          <Link to="/login" id="nav-login">Login</Link>
          <Link to="/register" id="nav-register">Register</Link>
        </>
      )}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ServerOfflineBanner />
        <Nav />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/register" element={<Auth mode="register" />} />
            <Route path="/play" element={<Protected><Play /></Protected>} />
            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
