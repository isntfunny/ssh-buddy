import { MosaicWithoutDragDropContext } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import './workspace.css';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Center, Stack, Text } from '@mantine/core';
import { isTauri } from '@tauri-apps/api/core';
import type { ReactNode } from 'react';
import type { Profile } from '../profiles/types';
import { useWorkspace } from './WorkspaceProvider';
import { ConnectionView } from './ConnectionView';
import { ProxyWarning } from './ProxyWarning';
import { SessionTabTitle, StandaloneHeader } from './SessionTab';
import { collectLeaves, getGroupTabs, isInTabsNode } from './mosaicTree';

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

  const renderSessionBody = (sessionId: string, active: boolean): ReactNode => {
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
    return (
      <ConnectionView
        sessionId={sessionId}
        profile={profile}
        active={active}
        onUpdateHistory={(patch) => onUpdateHistory(profile.id, patch)}
      />
    );
  };

  // `activeKey` is the active tab of the group (or the standalone leaf). We render
  // every session of the group and toggle visibility so background tabs keep their
  // live SSH connection + scrollback (mosaic only asks us to render the active tab).
  const renderTile = (activeKey: string) => {
    const standalone = !isInTabsNode(tree, activeKey);

    if (standalone) {
      const isActiveTile = activeSessionId === activeKey;
      return (
        <div
          onMouseDownCapture={() => setActiveSession(activeKey)}
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: 'var(--mantine-color-dark-7)',
            borderRadius: 8,
            border: '1px solid var(--mantine-color-dark-4)',
            overflow: 'hidden',
            outline:
              multiple && isActiveTile ? '2px solid var(--mantine-primary-color-filled)' : 'none',
            outlineOffset: -2,
          }}
        >
          <StandaloneHeader sessionId={activeKey} profiles={profiles} />
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {renderSessionBody(activeKey, true)}
          </div>
        </div>
      );
    }

    const group = getGroupTabs(tree, activeKey) ?? [activeKey];
    const isActiveTile = activeSessionId != null && group.includes(activeSessionId);
    return (
      <div
        onMouseDownCapture={() => setActiveSession(activeKey)}
        style={{
          height: '100%',
          minHeight: 0,
          position: 'relative',
          background: 'var(--mantine-color-dark-7)',
          outline:
            multiple && isActiveTile ? '2px solid var(--mantine-primary-color-filled)' : 'none',
          outlineOffset: -2,
        }}
      >
        {group.map((sid) => (
          <div
            key={sid}
            style={{
              position: 'absolute',
              inset: 0,
              visibility: sid === activeKey ? 'visible' : 'hidden',
              zIndex: sid === activeKey ? 1 : 0,
            }}
          >
            {renderSessionBody(sid, sid === activeKey)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Stack gap="sm" h="100%">
      {usesWebProxy && <ProxyWarning />}
      {tree ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <DndProvider backend={HTML5Backend}>
            <MosaicWithoutDragDropContext<string>
              className="ssh-mosaic"
              value={tree}
              onChange={changeTree}
              renderTile={renderTile}
              renderTabTitle={({ tabKey, isActive }) => (
                <SessionTabTitle sessionId={tabKey} isActive={isActive} profiles={profiles} />
              )}
              canClose={() => 'canClose' as const}
              zeroStateView={<div />}
            />
          </DndProvider>
        </div>
      ) : (
        <Center style={{ flex: 1 }}>
          <Text c="dimmed">Select a profile from the sidebar to open a connection.</Text>
        </Center>
      )}
    </Stack>
  );
}
