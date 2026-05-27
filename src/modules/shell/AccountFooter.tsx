import { Text, UnstyledButton } from '@mantine/core';
import type { PbUser } from '../sync/pb';

type Props =
  | { state: 'not-configured'; onClick: () => void }
  | { state: 'locked'; user: PbUser; onClick: () => void }
  | { state: 'unlocked'; user: PbUser; lastSyncedAt: Date | null; syncStatus: 'idle' | 'syncing' | 'error'; onClick: () => void };

export function AccountFooter(props: Props) {
  const base = { borderTop: '1px solid var(--mantine-color-default-border)', paddingTop: 8, marginTop: 8 };

  if (props.state === 'not-configured') {
    return (
      <UnstyledButton style={base} onClick={props.onClick}>
        <Text size="xs" c="dimmed">→ Sync einrichten</Text>
      </UnstyledButton>
    );
  }

  if (props.state === 'locked') {
    return (
      <UnstyledButton style={base} onClick={props.onClick}>
        <Text size="xs" c="dimmed">🔒 {props.user.email}</Text>
      </UnstyledButton>
    );
  }

  const dot =
    props.syncStatus === 'error' ? '🔴'
    : props.syncStatus === 'syncing' ? '🟡'
    : '🟢';

  const timeLabel = props.lastSyncedAt
    ? `sync ${Math.round((Date.now() - props.lastSyncedAt.getTime()) / 1000)}s`
    : 'sync pending';

  return (
    <UnstyledButton style={base} onClick={props.onClick}>
      <Text size="xs" c="dimmed">{dot} {props.user.email} · {timeLabel}</Text>
    </UnstyledButton>
  );
}
