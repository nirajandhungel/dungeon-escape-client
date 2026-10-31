/**
 * useServerHealth — polls /api/v1/health every 8 s.
 *
 * EVENT-DRIVEN: The hook uses a polling interval (reactive timer event) and
 * exposes `online` state to any consumer. When the server comes back up after
 * being down, all consumers re-render automatically.
 *
 * INTEROPERABILITY NOTE:
 * The health endpoint is the only cross-process contract between client and
 * server that can be called without authentication. It returns { status:'ok' }.
 * If the fetch fails or the server returns non-2xx the client transitions to
 * offline mode — gracefully degrading instead of crashing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type ServerStatus = 'checking' | 'online' | 'offline';

const POLL_MS  = 8_000;
const TIMEOUT_MS = 5_000;

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/health', {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useServerHealth(): { status: ServerStatus; retry: () => void } {
  const [status, setStatus] = useState<ServerStatus>('checking');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    const ok = await checkHealth();
    setStatus(ok ? 'online' : 'offline');
  }, []);

  useEffect(() => {
    void check();
    timerRef.current = setInterval(check, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [check]);

  return { status, retry: check };
}
