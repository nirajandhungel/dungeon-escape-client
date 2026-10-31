/**
 * AuthContext — virtual identity management
 *
 * EVENT-DRIVEN: On mount, fires one GET /auth/me to rehydrate session.
 * Exposes `serverStatus` so any component can react to the server going
 * offline without crashing the whole app.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type User } from '../services/api.service';
import { useServerHealth, type ServerStatus } from '../hooks/useServerHealth';

interface Ctx {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  serverStatus: ServerStatus;
  retryServer: () => void;
}

const AuthContext = createContext<Ctx>({
  user: null,
  loading: true,
  setUser: () => {},
  serverStatus: 'checking',
  retryServer: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { status: serverStatus, retry: retryServer } = useServerHealth();

  useEffect(() => {
    // Only attempt session rehydration once server is confirmed online
    if (serverStatus === 'checking') return;
    if (serverStatus === 'offline') { setLoading(false); return; }
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [serverStatus]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, serverStatus, retryServer }}>
      {children}
    </AuthContext.Provider>
  );
}
