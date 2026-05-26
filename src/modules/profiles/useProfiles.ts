import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NewProfileInput, Profile } from './types';
import { createFileStorage } from './storage';

export function useProfiles() {
  const storage = useMemo(() => createFileStorage(), []);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setProfiles(await storage.list());
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(
    async (input: NewProfileInput) => {
      const p = await storage.create(input);
      await reload();
      return p;
    },
    [storage, reload],
  );

  const update = useCallback(
    async (id: string, patch: Partial<NewProfileInput>) => {
      const p = await storage.update(id, patch);
      await reload();
      return p;
    },
    [storage, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await storage.remove(id);
      await reload();
    },
    [storage, reload],
  );

  return { profiles, loading, error, reload, create, update, remove };
}
