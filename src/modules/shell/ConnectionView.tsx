import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { isTauri } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef } from 'react';
import type { Profile } from '../profiles/types';
import { useSshSession } from '../ssh/useSshSession';
import { Terminal, type TerminalHandle } from '../terminal/Terminal';

type Props = { profile: Profile };

export function ConnectionView({ profile }: Props) {
  const session = useSshSession(profile);
  const termRef = useRef<TerminalHandle>(null);
  const usesWebProxy = !isTauri();

  useEffect(() => {
    session.setOutputHandler((bytes) => termRef.current?.write(bytes));
  }, [session.setOutputHandler]);

  const handleConnect = useCallback(() => {
    const dims = termRef.current?.fit() ?? { cols: 80, rows: 24 };
    session.connect(dims.cols, dims.rows);
    termRef.current?.focus();
  }, [session]);

  return (
    <Stack gap="md" style={{ height: '100%' }}>
      <Group justify="space-between" align="flex-start">
        <Group gap="sm">
          <Text fw={600}>{profile.name}</Text>
          <Text c="dimmed">{`${profile.username}@${profile.host}:${profile.port}`}</Text>
          <Badge color={badgeColor(session.state)}>{session.state}</Badge>
        </Group>
        {session.state === 'connected' ? (
          <Button color="red" variant="default" onClick={session.disconnect}>
            Disconnect
          </Button>
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
      {usesWebProxy && (
        <Text c="yellow" size="sm">
          Browser SSH uses the configured WebSocket proxy. The proxy can observe SSH credentials
          during the handshake.
        </Text>
      )}
      {session.error && <Text c="red">{session.error}</Text>}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Terminal ref={termRef} onData={session.send} onResize={session.resize} />
      </div>
    </Stack>
  );
}

function badgeColor(state: string): string {
  switch (state) {
    case 'connected':
      return 'teal';
    case 'connecting':
      return 'yellow';
    case 'error':
      return 'red';
    case 'closed':
      return 'gray';
    default:
      return 'gray';
  }
}
