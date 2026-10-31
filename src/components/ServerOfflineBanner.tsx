/**
 * ServerOfflineBanner — shown as a sticky top banner when server is unreachable.
 *
 * INTEROPERABILITY NOTE:
 * This is the UX face of the health-check polling loop. It does not block
 * navigation — the user can still browse cached pages. When the server
 * comes back online the banner disappears automatically (reactive to
 * serverStatus from AuthContext).
 */
import { useAuth } from '../contexts/AuthContext';

export default function ServerOfflineBanner() {
  const { serverStatus, retryServer } = useAuth();
  if (serverStatus !== 'offline') return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: 'linear-gradient(90deg,#7f1d1d,#991b1b)',
        color: '#fef2f2',
        padding: '.55rem 1.2rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
        fontSize: '.85rem', fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0,0,0,.5)',
      }}
    >
      <span aria-hidden="true">⚠️</span>
      <span style={{ flex: 1 }}>
        <strong>Server offline</strong> — the game server is unreachable. Scores won't be saved.
      </span>
      <button
        onClick={retryServer}
        style={{
          background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)',
          color: '#fef2f2', borderRadius: '6px', padding: '.25rem .75rem',
          cursor: 'pointer', fontSize: '.8rem',
        }}
        id="offline-retry-btn"
      >
        Retry
      </button>
    </div>
  );
}
