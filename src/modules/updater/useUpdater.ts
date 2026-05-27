import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { notifications } from '@mantine/notifications';

export function useUpdater() {
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

        notifications.show({
          id: 'ssh-buddy-update',
          title: `ssh-buddy ${update.version} bereit`,
          message: 'Wird beim nächsten Start installiert. Jetzt neu starten?',
          color: 'teal',
          autoClose: false,
          withCloseButton: true,
          onClick: async () => {
            notifications.hide('ssh-buddy-update');
            await update.install();
            const { relaunch } = await import('@tauri-apps/plugin-process');
            await relaunch();
          },
        });
      } catch {
        // Silent — update failures must not interrupt the user
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);
}
