import { useCallback, useEffect, useRef, useState } from 'react';
import { syncAll, subscribeRealtime } from './syncEngine';

type SyncStatus = 'idle' | 'syncing' | 'error';

export function useSync(key: Uint8Array | null, onUpdate: () => void) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const runSync = useCallback(async (k: Uint8Array) => {
    setStatus('syncing');
    setError(null);
    try {
      await syncAll(k);
      setLastSyncedAt(new Date());
      setStatus('idle');
      onUpdate();
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }, [onUpdate]);

  useEffect(() => {
    if (!key) return;

    runSync(key);
    unsubRef.current = subscribeRealtime(key, onUpdate);

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncNow = useCallback(() => {
    if (key) return runSync(key);
  }, [key, runSync]);

  return { status, lastSyncedAt, error, syncNow };
}
