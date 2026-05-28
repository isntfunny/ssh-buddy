import { useCallback, useEffect, useRef, useState } from 'react';
import { syncAll, subscribeRealtime, pushProfile, type SyncConflict } from './syncEngine';
import { createProfileStorage } from '../profiles/storage';
import { loadMeta, saveMeta, clearAndSetToken } from './syncMeta';
import { fetchSettings } from '../settings/settings';
import type { PbProfileRecord } from './pb';
import { newId } from '../../lib/id';
import type { Profile } from '../profiles/types';

type SyncStatus = 'idle' | 'syncing' | 'error';
export type ConflictChoice = 'mine' | 'remote' | 'both';

export function useSync(key: Uint8Array | null, onUpdate: () => void) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);

  const runSync = useCallback(async (k: Uint8Array) => {
    setStatus('syncing');
    setError(null);
    try {
      const { conflicts: found } = await syncAll(k);
      setConflicts(found);
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

  const resolveConflict = useCallback(async (profileId: string, choice: ConflictChoice) => {
    const conflict = conflicts.find((c) => c.profileId === profileId);
    if (!conflict || !key) return;
    const storage = createProfileStorage();
    const recordByProfileId = new Map<string, PbProfileRecord>();
    const settings = await fetchSettings(key);

    if (choice === 'remote') {
      await storage.upsert(conflict.remote);
      await saveMeta(clearAndSetToken(await loadMeta(), profileId, conflict.token));
    } else if (choice === 'mine') {
      const toPush = settings.syncConnectionHistory ? conflict.local : { ...conflict.local, history: undefined };
      const token = await pushProfile(key, toPush, recordByProfileId);
      await storage.upsert(conflict.local);
      await saveMeta(clearAndSetToken(await loadMeta(), profileId, token));
    } else {
      // both: remote stays under existing id; local becomes a new duplicate profile
      await storage.upsert(conflict.remote);
      await saveMeta(clearAndSetToken(await loadMeta(), profileId, conflict.token));
      const dup: Profile = {
        ...conflict.local,
        id: newId(),
        name: `${conflict.local.name} (Konflikt-Kopie)`,
        deletedAt: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const dupPush = settings.syncConnectionHistory ? dup : { ...dup, history: undefined };
      const token = await pushProfile(key, dupPush, recordByProfileId);
      await storage.upsert(dup);
      await saveMeta(clearAndSetToken(await loadMeta(), dup.id, token));
    }

    setConflicts((cur) => cur.filter((c) => c.profileId !== profileId));
    onUpdate();
  }, [conflicts, key, onUpdate]);

  return { status, lastSyncedAt, error, syncNow, conflicts, resolveConflict };
}
