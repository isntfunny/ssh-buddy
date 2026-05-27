import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useRef } from 'react';
import type { Profile } from '../profiles/types';
import { useSshSession } from '../ssh/useSshSession';
import { Terminal, type TerminalHandle } from '../terminal/Terminal';
import { useWorkspace } from './WorkspaceProvider';

type Props = {
  sessionId: string;
  profile: Profile;
  onUpdateHistory?: (patch: {
    lastConnectedAt?: string;
    lastHostKeyFingerprint?: string;
    lastErrorCategory?: string;
  }) => void;
};

const TERMINAL_BG = '#1a1b1e';

export function ConnectionView({ sessionId, profile, onUpdateHistory }: Props) {
  const session = useSshSession(profile);
  const termRef = useRef<TerminalHandle>(null);
  const autoConnectedRef = useRef(false);
  const { reportStatus, registerControls, unregisterControls } = useWorkspace();

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
  }, [session]);

  const handleClear = useCallback(() => {
    termRef.current?.clear();
    termRef.current?.focus();
  }, []);

  // Auto-connect once when the session view first mounts.
  useEffect(() => {
    if (!autoConnectedRef.current && session.state === 'idle') {
      autoConnectedRef.current = true;
      handleConnect();
    }
  }, [session.state, handleConnect]);

  // Auto-focus the terminal once the connection comes up.
  useEffect(() => {
    if (session.state === 'connected') {
      const t = setTimeout(() => termRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [session.state]);

  // Surface state + controls to the workspace so the tab can show status and act on it.
  useEffect(() => {
    reportStatus(sessionId, session.state);
  }, [sessionId, session.state, reportStatus]);

  useEffect(() => {
    registerControls(sessionId, {
      connect: handleConnect,
      disconnect: session.disconnect,
      clear: handleClear,
    });
    return () => unregisterControls(sessionId);
  }, [
    sessionId,
    handleConnect,
    session.disconnect,
    handleClear,
    registerControls,
    unregisterControls,
  ]);

  return (
    <Stack gap={0} style={{ height: '100%', background: TERMINAL_BG }}>
      {session.error && (
        <Alert color="red" variant="filled" radius={0} py={4} px="sm">
          <Text size="xs">{session.error}</Text>
        </Alert>
      )}

      <Modal
        opened={session.tofu !== null}
        onClose={() => session.tofu?.reject()}
        title="Unknown host key"
        size="md"
      >
        {session.tofu && (
          <Stack gap="md">
            <Alert icon={<IconAlertTriangle size={16} />} color="yellow" title="First connection">
              Verify the fingerprint out-of-band before trusting it.
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

      <div style={{ flex: 1, minHeight: 0, padding: 8, background: TERMINAL_BG }}>
        <Terminal ref={termRef} onData={session.send} onResize={session.resize} />
      </div>
    </Stack>
  );
}
