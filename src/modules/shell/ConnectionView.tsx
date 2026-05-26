import { Alert, Badge, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { isTauri } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef } from 'react';
import type { Profile } from '../profiles/types';
import { useSshSession } from '../ssh/useSshSession';
import { Terminal, type TerminalHandle } from '../terminal/Terminal';

type Props = {
  profile: Profile;
  onUpdateHistory?: (patch: {
    lastConnectedAt?: string;
    lastHostKeyFingerprint?: string;
    lastErrorCategory?: string;
  }) => void;
};

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

  const handleConnect = useCallback(() => {
    const dims = termRef.current?.fit() ?? { cols: 80, rows: 24 };
    session.connect(dims.cols, dims.rows);
    termRef.current?.focus();
  }, [session]);

  const handleClear = useCallback(() => {
    termRef.current?.clear();
  }, []);

  return (
    <Stack gap="md" style={{ height: '100%' }}>
      <Group justify="space-between" align="flex-start">
        <Group gap="sm">
          <Text fw={600}>{profile.name}</Text>
          <Text c="dimmed">{`${profile.username}@${profile.host}:${profile.port}`}</Text>
          <Badge color={badgeColor(session.state)}>{session.state}</Badge>
        </Group>
        <Group gap="xs">
          {session.state === 'connected' && (
            <Button size="xs" variant="subtle" onClick={handleClear}>
              Clear
            </Button>
          )}
          {session.state === 'connected' ? (
            <Button color="red" variant="default" onClick={session.disconnect}>
              Disconnect
            </Button>
          ) : session.state === 'closed' || session.state === 'error' ? (
            <Button onClick={handleConnect}>Reconnect</Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={session.state === 'connecting'}
              loading={session.state === 'connecting'}
            >
              Connect
            </Button>
          )}
        </Group>
      </Group>

      {usesWebProxy && (
        <Text c="yellow" size="sm">
          Browser SSH uses the configured WebSocket proxy. The proxy can observe SSH credentials
          during the handshake.
        </Text>
      )}

      {session.error && <Text c="red">{session.error}</Text>}

      <Modal
        opened={session.tofu !== null}
        onClose={() => session.tofu?.reject()}
        title="Unknown host key"
        size="md"
      >
        {session.tofu && (
          <Stack gap="md">
            <Alert icon={<IconAlertTriangle size={16} />} color="yellow" title="First connection">
              This is the first time connecting to{' '}
              <strong>
                {session.tofu.host}:{session.tofu.port}
              </strong>
              . Verify the fingerprint out-of-band before trusting it.
            </Alert>
            <Text size="sm" ff="monospace">
              {session.tofu.fingerprint}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={session.tofu.reject}>
                Reject
              </Button>
              <Button color="teal" onClick={session.tofu.trust}>
                Trust &amp; Connect
              </Button>
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

function badgeColor(state: string): string {
  switch (state) {
    case 'connected': return 'teal';
    case 'connecting': return 'yellow';
    case 'error': return 'red';
    case 'closed': return 'gray';
    default: return 'gray';
  }
}
