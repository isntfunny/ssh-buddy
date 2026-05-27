import { Mosaic } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import './workspace.css';
import { Center, Stack, Text } from '@mantine/core';
import { isTauri } from '@tauri-apps/api/core';
import type { Profile } from '../profiles/types';
import { useWorkspace } from './WorkspaceProvider';
import { ConnectionView } from './ConnectionView';
import { ProxyWarning } from './ProxyWarning';
import { SessionTabButton, StandaloneHeader } from './SessionTab';
import { collectLeaves, isInTabsNode } from './mosaicTree';

type HistoryPatch = {
  lastConnectedAt?: string;
  lastHostKeyFingerprint?: string;
  lastErrorCategory?: string;
};

type Props = {
  profiles: Profile[];
  onUpdateHistory: (profileId: string, patch: HistoryPatch) => void;
};

export function Workspace({ profiles, onUpdateHistory }: Props) {
  const { tree, changeTree, sessions, activeSessionId, setActiveSession } = useWorkspace();
  const usesWebProxy = !isTauri();
  const multiple = collectLeaves(tree).length > 1;

  const renderTile = (sessionId: string) => {
    const meta = sessions[sessionId];
    const profile = meta ? profiles.find((p) => p.id === meta.profileId) : undefined;
    if (!profile) {
      return (
        <Center h="100%">
          <Text c="dimmed" size="sm">
            Session unavailable.
          </Text>
        </Center>
      );
    }
    const standalone = !isInTabsNode(tree, sessionId);
    const isActiveTile = activeSessionId === sessionId;
    return (
      <div
        onMouseDownCapture={() => setActiveSession(sessionId)}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--mantine-color-dark-7)',
          borderRadius: standalone ? 8 : 0,
          border: standalone ? '1px solid var(--mantine-color-dark-4)' : 'none',
          overflow: 'hidden',
          outline:
            multiple && isActiveTile ? '2px solid var(--mantine-primary-color-filled)' : 'none',
          outlineOffset: -2,
        }}
      >
        {standalone && <StandaloneHeader sessionId={sessionId} profiles={profiles} />}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ConnectionView
            sessionId={sessionId}
            profile={profile}
            onUpdateHistory={(patch) => onUpdateHistory(profile.id, patch)}
          />
        </div>
      </div>
    );
  };

  return (
    <Stack gap="sm" h="100%">
      {usesWebProxy && <ProxyWarning />}
      {tree ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <Mosaic<string>
            className="ssh-mosaic"
            value={tree}
            onChange={changeTree}
            renderTile={renderTile}
            renderTabButton={(props) => <SessionTabButton {...props} profiles={profiles} />}
            canClose={() => 'canClose' as const}
            zeroStateView={<div />}
          />
        </div>
      ) : (
        <Center style={{ flex: 1 }}>
          <Text c="dimmed">Select a profile from the sidebar to open a connection.</Text>
        </Center>
      )}
    </Stack>
  );
}
