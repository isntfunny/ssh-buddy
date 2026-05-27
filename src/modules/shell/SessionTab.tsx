import { ActionIcon, Box, Group, Menu, Text } from '@mantine/core';
import { IconEraser, IconPlug, IconPlugX, IconX } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import type { Profile } from '../profiles/types';
import type { SshState } from '../ssh/useSshSession';
import { useWorkspace } from './WorkspaceProvider';

export function statusColor(state: SshState | undefined): string {
  switch (state) {
    case 'connected':
      return 'var(--mantine-color-teal-5)';
    case 'connecting':
      return 'var(--mantine-color-yellow-5)';
    case 'error':
      return 'var(--mantine-color-red-6)';
    default:
      return 'var(--mantine-color-gray-6)';
  }
}

function StatusDot({ state }: { state: SshState | undefined }) {
  return (
    <Box
      component="span"
      w={8}
      h={8}
      style={{
        display: 'inline-block',
        borderRadius: '50%',
        background: statusColor(state),
        flex: '0 0 auto',
      }}
    />
  );
}

/** Shared right-click action menu for a session (tab title or standalone header). */
function SessionMenu({
  sessionId,
  opened,
  onOpenChange,
  children,
}: {
  sessionId: string;
  opened: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
}) {
  const { statuses, getControls, closeSession } = useWorkspace();
  const state = statuses[sessionId];
  const connected = state === 'connected' || state === 'connecting';

  return (
    <Menu opened={opened} onChange={onOpenChange} position="bottom-start" withinPortal shadow="md">
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown onContextMenu={(e) => e.preventDefault()}>
        {connected ? (
          <Menu.Item
            leftSection={<IconPlugX size={14} />}
            onClick={() => getControls(sessionId)?.disconnect()}
          >
            Disconnect
          </Menu.Item>
        ) : (
          <Menu.Item
            leftSection={<IconPlug size={14} />}
            onClick={() => getControls(sessionId)?.connect()}
          >
            Reconnect
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<IconEraser size={14} />}
          onClick={() => getControls(sessionId)?.clear()}
        >
          Clear terminal
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<IconX size={14} />}
          onClick={() => closeSession(sessionId)}
        >
          Close session
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Tab title content rendered inside react-mosaic's default (draggable) tab button.
 * Using renderTabTitle — not renderTabButton — keeps the native drag source + close X.
 */
export function SessionTabTitle({
  sessionId,
  isActive,
  profiles,
}: {
  sessionId: string;
  isActive: boolean;
  profiles: Profile[];
}) {
  const { sessions, statuses, setActiveSession } = useWorkspace();
  const [menuOpened, setMenuOpened] = useState(false);
  const profile = profiles.find((p) => p.id === sessions[sessionId]?.profileId);
  const state = statuses[sessionId];

  return (
    <SessionMenu sessionId={sessionId} opened={menuOpened} onOpenChange={setMenuOpened}>
      <Box
        component="span"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 6,
          borderLeft: `3px solid ${profile?.color ?? 'transparent'}`,
        }}
        onClick={() => setActiveSession(sessionId)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpened(true);
        }}
      >
        <StatusDot state={state} />
        <Text component="span" size="xs" fw={isActive ? 600 : 400} truncate style={{ maxWidth: 160 }}>
          {profile?.name ?? 'Unknown'}
        </Text>
      </Box>
    </SessionMenu>
  );
}

/** Header bar for a standalone session (one not inside a tabs group). */
export function StandaloneHeader({
  sessionId,
  profiles,
}: {
  sessionId: string;
  profiles: Profile[];
}) {
  const { sessions, statuses, closeSession } = useWorkspace();
  const [menuOpened, setMenuOpened] = useState(false);
  const profile = profiles.find((p) => p.id === sessions[sessionId]?.profileId);
  const state = statuses[sessionId];

  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="xs"
      style={{
        height: 36,
        background: 'var(--mantine-color-dark-8)',
        borderBottom: '1px solid var(--mantine-color-dark-4)',
        flex: '0 0 auto',
      }}
    >
      <SessionMenu sessionId={sessionId} opened={menuOpened} onOpenChange={setMenuOpened}>
        <Group
          gap={6}
          wrap="nowrap"
          style={{
            cursor: 'context-menu',
            paddingLeft: 6,
            borderLeft: `3px solid ${profile?.color ?? 'transparent'}`,
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuOpened(true);
          }}
        >
          <StatusDot state={state} />
          <Text size="xs" fw={600} c="gray.2" truncate style={{ maxWidth: 220 }}>
            {profile?.name ?? 'Unknown'}
          </Text>
        </Group>
      </SessionMenu>
      <ActionIcon
        size="xs"
        variant="subtle"
        color="gray"
        aria-label="Close session"
        onClick={() => closeSession(sessionId)}
      >
        <IconX size={12} />
      </ActionIcon>
    </Group>
  );
}
