import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { api } from './api';
import { AuthProvider, useAuth } from './auth';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Play from './pages/Play';
import Dashboard from './pages/Dashboard';
function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: 'var(--muted)' }}>
      <span>Loading…</span>
    </div>
  );
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function Nav() {
  const { user, setUser } = useAuth();
  return (
    <nav aria-label="Main navigation">
      <Link to="/" className="brand" aria-label="Dungeon Escape — Home">
        ⚔ Dungeon Escape
      </Link>
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
