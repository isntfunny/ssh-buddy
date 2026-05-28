import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { isTauri } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef } from 'react';
import type { Profile } from '../profiles/types';
import { proxyUrl } from '../ssh/client';
import { useSshSession, type SshState } from '../ssh/useSshSession';
import { Terminal, type TerminalHandle } from '../terminal/Terminal';
import {
  logClosed,
  logConnected,
  logConnecting,
  logError,
  logHostKey,
} from '../terminal/connectionLog';
import { useWorkspace } from './WorkspaceProvider';
import { getDeviceId } from '../sync/syncEngine';
import { makeEvent } from '../profiles/connectionHistory';
import type { ConnectionEvent } from '../profiles/types';

type Props = {
  sessionId: string;
  profile: Profile;
  active: boolean;
  onAppendHistory?: (profileId: string, event: ConnectionEvent) => void;
};

const TERMINAL_BG = '#1a1b1e';

export function ConnectionView({ sessionId, profile, active, onAppendHistory }: Props) {
  const session = useSshSession(profile);
  const termRef = useRef<TerminalHandle>(null);
  const autoConnectedRef = useRef(false);
  const logStateRef = useRef<SshState | null>(null);
  const { reportStatus, registerControls, unregisterControls, closeSession } = useWorkspace();

  // Close the tab when the remote side ends the session (e.g. the user typed `exit`).
  // Manual disconnect does not trigger this, so disconnected tabs stay open to reconnect.
  useEffect(() => {
    session.setOnClosed(() => closeSession(sessionId));
  }, [session.setOnClosed, closeSession, sessionId]);

  useEffect(() => {
    session.setOutputHandler((bytes) => termRef.current?.write(bytes));
  }, [session.setOutputHandler]);

  useEffect(() => {
    session.setOnConnected((fingerprint) => {
      onAppendHistory?.(profile.id, makeEvent({ outcome: 'connected', hostKeyFingerprint: fingerprint, deviceId: getDeviceId() }));
      const term = termRef.current;
      if (term) logConnected(term, fingerprint);
    });
  }, [session.setOnConnected, onAppendHistory, profile.id]);

  // Connection protocol written into the terminal as the state changes.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const prev = logStateRef.current;
    if (session.state === prev) return;
    logStateRef.current = session.state;

    if (session.state === 'connecting') {
      logConnecting(term, {
        target: `${profile.username}@${profile.host}:${profile.port}`,
        auth: profile.auth.kind === 'privateKey' ? 'private key' : 'password',
        transport: isTauri() ? 'native (Tauri SSH)' : `WebSocket proxy ${proxyUrl()}`,
        jumpHost: profile.jumpHostId ?? undefined,
        retry: prev === 'error' || prev === 'closed',
      });
    } else if (session.state === 'error') {
      logError(term, session.error ?? 'unknown error');
    } else if (session.state === 'closed' && prev === 'connected') {
      logClosed(term);
    }
  }, [session.state, session.error, profile]);

  // First-connection host-key prompt is reflected in the log too.
  useEffect(() => {
    const term = termRef.current;
    if (term && session.tofu) logHostKey(term, session.tofu.fingerprint);
  }, [session.tofu]);

  useEffect(() => {
    session.setOnError((category) => {
      onAppendHistory?.(profile.id, makeEvent({ outcome: 'error', errorCategory: category, deviceId: getDeviceId() }));
    });
  }, [session.setOnError, onAppendHistory, profile.id]);

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

  // Auto-focus the terminal once the connection comes up (only the visible tab).
  useEffect(() => {
    if (session.state === 'connected' && active) {
      const t = setTimeout(() => termRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [session.state, active]);

  // Focus when this tab becomes the active one in its group.
  useEffect(() => {
    if (active) termRef.current?.focus();
  }, [active]);

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

      <div style={{ flex: 1, minHeight: 0, padding: '4px 6px', background: TERMINAL_BG }}>
        <Terminal ref={termRef} onData={session.send} onResize={session.resize} />
      </div>
    </Stack>
  );
}
