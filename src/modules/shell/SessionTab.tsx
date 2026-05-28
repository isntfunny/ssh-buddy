import { Box, Menu, Text } from '@mantine/core';
import { IconEraser, IconPlug, IconPlugX, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
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

/**
 * Browser-style tab rendered by dockview for each session. dockview owns the drag
 * source + tab activation on left-click; we render the label, a status dot, the
 * profile colour accent and a close button. The action menu opens only on
 * right-click or double-click — never on a plain left-click.
 */
export function SessionTab(props: IDockviewPanelHeaderProps<{ sessionId: string }>) {
  const sessionId = props.params.sessionId;
  const { sessions, statuses, getControls, closeSession } = useWorkspace();
  const profiles = useProfiles();
  const [menuOpened, setMenuOpened] = useState(false);
  const [active, setActive] = useState(props.api.isActive);

  useEffect(() => {
    const d = props.api.onDidActiveChange((e) => setActive(e.isActive));
    return () => d.dispose();
  }, [props.api]);

  const profile = profiles.find((p) => p.id === sessions[sessionId]?.profileId);
  const state = statuses[sessionId];
  const connected = state === 'connected' || state === 'connecting';

  const openMenu = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setMenuOpened(true);
  };

  return (
    <Menu
      opened={menuOpened}
      onChange={setMenuOpened}
      position="bottom-start"
      withinPortal
      shadow="md"
    >
      <Box
        className="ssh-tab"
        data-active={active || undefined}
        onContextMenu={openMenu}
        onDoubleClick={openMenu}
        style={
          {
            position: 'relative',
            '--ssh-tab-accent': profile?.color ?? 'transparent',
          } as React.CSSProperties
        }
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
        {/* Invisible anchor: positions the dropdown without capturing clicks, so a
            left-click on the tab only activates it (handled by dockview) and never
            opens the menu. The menu is opened explicitly via right/double-click. */}
        <Menu.Target>
          <span style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden />
        </Menu.Target>
      </Box>

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
