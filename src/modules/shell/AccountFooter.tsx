import { Box, Button, NavLink, Text } from '@mantine/core';
import { IconCloudPlus, IconLock, IconRefresh } from '@tabler/icons-react';
import type { PbUser } from '../sync/pb';

type SyncStatus = 'idle' | 'syncing' | 'error';

type Props =
  | { state: 'not-configured'; onClick: () => void }
  | { state: 'locked'; user: PbUser; onClick: () => void }
  | {
      state: 'unlocked';
      user: PbUser;
      lastSyncedAt: Date | null;
      syncStatus: SyncStatus;
      onClick: () => void;
    };

function SyncDot({ status }: { status: SyncStatus }) {
  const color =
    status === 'error' ? 'red-6' : status === 'syncing' ? 'yellow-5' : 'teal-5';
  return (
    <Box
      w={9}
      h={9}
      style={{ borderRadius: '50%', background: `var(--mantine-color-${color})` }}
    />
  );
}

/** Account / sync status row, styled as a sidebar NavLink so it matches the rest. */
export function AccountFooter(props: Props) {
  if (props.state === 'not-configured') {
    return (
      <NavLink
        label="Sync einrichten"
        leftSection={<IconCloudPlus size={16} />}
        onClick={props.onClick}
        c="dimmed"
      />
    );
  }

  if (props.state === 'locked') {
    return (
      <NavLink
        label={
          <Text size="sm" truncate>
            {props.user.email}
          </Text>
        }
        leftSection={<IconLock size={16} />}
        onClick={props.onClick}
      />
    );
  }

  const timeLabel = props.lastSyncedAt
    ? `Synced ${Math.round((Date.now() - props.lastSyncedAt.getTime()) / 1000)}s ago`
    : 'Sync pending';

  return (
    <NavLink
      label={
        <Text size="sm" truncate>
          {props.user.email}
        </Text>
      }
      description={timeLabel}
      leftSection={<SyncDot status={props.syncStatus} />}
      onClick={props.onClick}
    />
  );
}

/** Restart-to-update call to action, shown only when an update is downloaded. */
export function UpdateButton({
  version,
  onRestart,
}: {
  version: string | null;
  onRestart: () => void;
}) {
  return (
    <Button
      fullWidth
      size="xs"
      variant="light"
      color="teal"
      leftSection={<IconRefresh size={14} />}
      onClick={onRestart}
    >
      Neustart für Update{version ? ` ${version}` : ''}
    </Button>
  );
}
