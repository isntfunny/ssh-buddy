import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdaterState = {
  /** A new version has been downloaded and is ready to install on restart. */
  ready: boolean;
  version: string | null;
  /** Install the downloaded update and relaunch the app. */
  restart: () => Promise<void>;
};

/**
 * Silently checks for an update on launch and downloads it in the background.
 * When it's ready, exposes `ready`/`version` so the UI can offer a restart
 * button — no toast, no interruption. Desktop only (the plugin is not built
 * for mobile).
 */
export function useUpdater(): UpdaterState {
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    const run = async () => {
      await new Promise<void>((r) => setTimeout(r, 3000));
      if (cancelled) return;
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (!update || cancelled) return;

        await update.download();
        if (cancelled) return;

        updateRef.current = update;
        setVersion(update.version);
        setReady(true);
      } catch {
        // Silent — update failures must not interrupt the user.
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const restart = async () => {
    const update = updateRef.current;
    if (!update) return;
    await update.install();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  };

  return { ready, version, restart };
}
