/**
 * App.tsx — root component and routing.
 *
 * - AuthProvider exposes the player's virtual identity and the server status to every page.
 * - The 3D game route is lazy-loaded: three.js is only downloaded when someone opens the title screen or plays.
 * - During play there is NO page chrome: the game owns the whole viewport (see styles `.play`).
 */
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './services/api.service';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ServerOfflineBanner from './components/ServerOfflineBanner';
import { LoadingScreen } from './components/Feedback';
import { useReducedMotion } from './store/settings.store';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';

const Play = lazy(() => import('./pages/Play'));

/** Shown instead of protected content while the server is unreachable. */
function OfflineGate() {
  const { retryServer } = useAuth();
  return (
    <div className="loading error-screen" role="alert">
      <h2>Server offline</h2>
      <p>The game server cannot be reached right now. Check that it is running on <code>localhost:4000</code>.</p>
      <div className="row">
        <button type="button" id="offline-gate-retry-btn" onClick={retryServer}>Retry connection</button>
        <Link className="btn ghost" to="/">Home</Link>
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading, serverStatus } = useAuth();
  if (serverStatus === 'checking' || loading) return <LoadingScreen label="Connecting to the dungeon…" />;
  if (serverStatus === 'offline') return <OfflineGate />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function Nav() {
  const { user, setUser, serverStatus } = useAuth();
  return (
    <nav aria-label="Main navigation">
      <Link to="/" className="brand" aria-label="Dungeon Escape — Home">Dungeon Escape</Link>
      {serverStatus === 'offline' && <span className="offline-dot">● OFFLINE</span>}
      {user ? (
        <>
          <Link to="/play" id="nav-play" state={{ mode: 'continue' }}>Play</Link>
          <Link to="/dashboard" id="nav-dashboard">Records</Link>
          <button type="button" id="nav-logout" className="ghost sm" aria-label={`Log out ${user.displayName}`}
            onClick={async () => { await api.logout(); setUser(null); }}>
            {user.displayName} · Log out
          </button>
        </>
      ) : (
        <>
          <Link to="/login" id="nav-login">Log in</Link>
          <Link to="/register" id="nav-register">Register</Link>
        </>
      )}
    </nav>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', reduced); }, [reduced]);
  const playing = pathname === '/play';
  const full = playing || pathname === '/';
  return (
    <div className={`app ${playing ? 'route-play' : pathname === '/' ? 'route-home' : 'route-page'}`}>
      {!playing && <ServerOfflineBanner />}
      {!playing && <Nav />}
      <main className={full ? 'full' : 'page'}>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/register" element={<Auth mode="register" />} />
            <Route path="/play" element={<Protected><Play /></Protected>} />
            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
