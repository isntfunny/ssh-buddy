import { Alert, Badge, Button, Group, Modal, Stack, Text, ActionIcon, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconPlug, IconPlugX, IconRefresh, IconEraser } from '@tabler/icons-react';
import { isTauri } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef } from 'react';
import type { Profile } from '../profiles/types';
import { useSshSession } from '../ssh/useSshSession';
import { Terminal, type TerminalHandle } from '../terminal/Terminal';
import { ProxyWarning } from './ProxyWarning';

type Props = {
  profile: Profile;
  onUpdateHistory?: (patch: {
    lastConnectedAt?: string;
    lastHostKeyFingerprint?: string;
    lastErrorCategory?: string;
  }) => void;
};

function badgeColor(state: string): string {
  switch (state) {
    case 'connected': return 'teal';
    case 'connecting': return 'yellow';
    case 'error': return 'red';
    case 'closed': return 'gray';
    default: return 'gray';
  }
}

export function ConnectionView({ profile, onUpdateHistory }: Props) {
  const session = useSshSession(profile);
  const termRef = useRef<TerminalHandle>(null);
  const usesWebProxy = !isTauri();

  useEffect(() => {
    session.setOutputHandler((bytes) => termRef.current?.write(bytes));
  }, [session.setOutputHandler]);

  useEffect(() => {
    session.setOnConnected((fingerprint) => {
      onUpdateHistory?.({
        lastConnectedAt: new Date().toISOString(),
        lastHostKeyFingerprint: fingerprint,
      });
    });
  }, [session.setOnConnected, onUpdateHistory]);

  useEffect(() => {
    session.setOnError((category) => {
      onUpdateHistory?.({ lastErrorCategory: category });
    });
  }, [session.setOnError, onUpdateHistory]);

  // Terminal Auto-focus upon connection
  useEffect(() => {
    if (session.state === 'connected') {
      setTimeout(() => termRef.current?.focus(), 50);
    }
  }, [session.state]);

  const handleConnect = useCallback(() => {
    const dims = termRef.current?.fit() ?? { cols: 80, rows: 24 };
    session.connect(dims.cols, dims.rows);
  }, [session]);

  const handleClear = useCallback(() => {
    termRef.current?.clear();
    termRef.current?.focus();
  }, []);

  return (
    <Stack gap="xs" style={{ height: '100%' }}>
      <Group justify="space-between" align="center" bg="dark.7" p="xs" style={{ borderRadius: '4px' }}>
        <Group gap="md">
          <Badge color={badgeColor(session.state)} variant="dot">{session.state}</Badge>
          <Text fw={600} size="sm">{profile.name}</Text>
          <Text c="dimmed" size="xs" ff="monospace">{`${profile.username}@${profile.host}:${profile.port}`}</Text>
        </Group>

        <Group gap="xs">
          <Tooltip label="Clear terminal">
            <ActionIcon variant="light" color="gray" onClick={handleClear} disabled={session.state !== 'connected'}>
              <IconEraser size={18} />
            </ActionIcon>
          </Tooltip>

          {session.state === 'connected' ? (
            <Button size="xs" color="red" variant="light" leftSection={<IconPlugX size={14} />} onClick={session.disconnect}>
              Disconnect
            </Button>
          ) : session.state === 'closed' || session.state === 'error' ? (
            <Button size="xs" leftSection={<IconRefresh size={14} />} onClick={handleConnect}>
              Reconnect
            </Button>
          ) : (
            <Button
              size="xs"
              leftSection={<IconPlug size={14} />}
              onClick={handleConnect}
              disabled={session.state === 'connecting'}
              loading={session.state === 'connecting'}
            >
              Connect
            </Button>
          )}
        </Group>
      </Group>

      {usesWebProxy && <ProxyWarning />}

      {session.error && <Alert color="red" title="Connection Error">{session.error}</Alert>}

      <Modal opened={session.tofu !== null} onClose={() => session.tofu?.reject()} title="Unknown host key" size="md">
        {session.tofu && (
          <Stack gap="md">
            <Alert icon={<IconAlertTriangle size={16} />} color="yellow" title="First connection">
              Verify the fingerprint out-of-band before trusting it.
            </Alert>
            <Text size="sm" ff="monospace">{session.tofu.fingerprint}</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={session.tofu.reject}>Reject</Button>
              <Button color="teal" onClick={session.tofu.trust}>Trust &amp; Connect</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <div style={{ flex: 1, minHeight: 0 }}>
        <Terminal ref={termRef} onData={session.send} onResize={session.resize} />
      </div>
    </Stack>
  );
}
