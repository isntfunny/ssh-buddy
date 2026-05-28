import { Button, Divider, Modal, Stack, Switch, Text } from '@mantine/core';
import type { PbUser } from '../sync/pb';

type Props = {
  opened: boolean;
  onClose: () => void;
  user: PbUser;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncedAt: Date | null;
  biometricAvailable: boolean;
  syncConnectionHistory: boolean;
  onToggleSyncHistory: (value: boolean) => void;
  onRememberDevice: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onExport: () => void;
  onImport: () => void;
};

export function AccountModal({
  opened,
  onClose,
  user,
  syncStatus,
  lastSyncedAt,
  biometricAvailable,
  syncConnectionHistory,
  onToggleSyncHistory,
  onRememberDevice,
  onSignOut,
  onExport,
  onImport,
}: Props) {
  const statusLabel =
    syncStatus === 'syncing' ? 'Wird synchronisiert…'
    : syncStatus === 'error' ? 'Sync-Fehler'
    : lastSyncedAt ? `Zuletzt sync: ${lastSyncedAt.toLocaleTimeString()}`
    : 'Noch nicht synchronisiert';

  return (
    <Modal opened={opened} onClose={onClose} title="Account" size="sm">
      <Stack gap="xs">
        <Text size="sm">{user.email}</Text>
        <Text size="xs" c={syncStatus === 'error' ? 'red' : 'dimmed'}>{statusLabel}</Text>
        <Divider label="Mehr" labelPosition="center" my="xs" />
        <Switch
          label="Verbindungs-Historie zwischen Geräten synchronisieren"
          checked={syncConnectionHistory}
          onChange={(e) => onToggleSyncHistory(e.currentTarget.checked)}
        />
        {biometricAvailable && (
          <Button variant="subtle" size="xs" onClick={onRememberDevice}>
            Dieses Gerät merken
          </Button>
        )}
        <Button variant="subtle" size="xs" onClick={onExport}>Profile exportieren</Button>
        <Button variant="subtle" size="xs" onClick={onImport}>Profile importieren</Button>
        <Divider my="xs" />
        <Button variant="subtle" color="red" size="xs" onClick={onSignOut}>
          Abmelden
        </Button>
      </Stack>
    </Modal>
  );
}
