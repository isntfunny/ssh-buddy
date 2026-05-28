import { Box, Menu, Text } from '@mantine/core';
import { IconEraser, IconPlug, IconPlugX, IconX } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import type { SshState } from '../ssh/useSshSession';
import { useWorkspace } from './WorkspaceProvider';
import { useProfiles } from './profilesContext';

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

/** Right-click action menu shared by every session tab. */
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
        <Menu.Item color="red" leftSection={<IconX size={14} />} onClick={() => closeSession(sessionId)}>
          Close session
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Browser-style tab rendered by dockview for each session. dockview owns the drag
 * source + active state; we render the label, a status dot, the profile colour
 * accent and a close button, and keep the right-click action menu.
 */
export function SessionTab(props: IDockviewPanelHeaderProps<{ sessionId: string }>) {
  const sessionId = props.params.sessionId;
  const { sessions, statuses } = useWorkspace();
  const profiles = useProfiles();
  const [menuOpened, setMenuOpened] = useState(false);
  const [active, setActive] = useState(props.api.isActive);

  useEffect(() => {
    const d = props.api.onDidActiveChange((e) => setActive(e.isActive));
    return () => d.dispose();
  }, [props.api]);

  const profile = profiles.find((p) => p.id === sessions[sessionId]?.profileId);
  const state = statuses[sessionId];

  return (
    <SessionMenu sessionId={sessionId} opened={menuOpened} onOpenChange={setMenuOpened}>
      <Box
        className="ssh-tab"
        data-active={active || undefined}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpened(true);
        }}
        style={{ '--ssh-tab-accent': profile?.color ?? 'transparent' } as React.CSSProperties}
      >
        <StatusDot state={state} />
        <Text component="span" className="ssh-tab__label" size="xs" fw={active ? 600 : 400}>
          {profile?.name ?? 'Unknown'}
        </Text>
        <Box
          component="span"
          className="ssh-tab__close"
          role="button"
          aria-label="Close session"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            props.api.close();
          }}
        >
          <IconX size={12} />
        </Box>
      </Box>
    </SessionMenu>
  );
}
