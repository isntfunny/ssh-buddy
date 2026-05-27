import { MosaicWithoutDragDropContext } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import './workspace.css';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Center, Stack, Text } from '@mantine/core';
import { isTauri } from '@tauri-apps/api/core';
import { useRef } from 'react';
import { createHtmlPortalNode, InPortal, OutPortal, type HtmlPortalNode } from 'react-reverse-portal';
import type { Profile } from '../profiles/types';
import { useWorkspace } from './WorkspaceProvider';
import { ConnectionView } from './ConnectionView';
import { ProxyWarning } from './ProxyWarning';
import { SessionTabTitle, StandaloneHeader } from './SessionTab';
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

/**
 * Each session's ConnectionView (SSH session + xterm) is rendered exactly once,
 * into a stable detached DOM node (react-reverse-portal InPortal). The mosaic tile
 * only renders an OutPortal that *moves* that live node into place. Because the
 * ConnectionView never unmounts while its session exists, tab switches, closing a
 * sibling tab (group->leaf collapse), splitting, and dragging between panes all
 * preserve the connection + scrollback — react-mosaic restructuring the tree no
 * longer touches the terminal's React subtree.
 */
export function Workspace({ profiles, onUpdateHistory }: Props) {
  const { tree, changeTree, sessions, activeSessionId, setActiveSession, createSession } =
    useWorkspace();
  const usesWebProxy = !isTauri();
  const multiple = collectLeaves(tree).length > 1;

  // Stable portal node per session, created lazily and dropped when the session ends.
  const portalNodes = useRef<Map<string, HtmlPortalNode>>(new Map());
  const sessionIds = Object.keys(sessions);
  for (const id of sessionIds) {
    if (!portalNodes.current.has(id)) {
      portalNodes.current.set(
        id,
        createHtmlPortalNode({ attributes: { style: 'width:100%;height:100%;' } }),
      );
    }
  }
  for (const id of [...portalNodes.current.keys()]) {
    if (!sessions[id]) portalNodes.current.delete(id);
  }

  const renderTile = (activeKey: string) => {
    const node = portalNodes.current.get(activeKey);
    if (!node) return <div style={{ height: '100%', background: 'var(--mantine-color-dark-7)' }} />;

    const standalone = !isInTabsNode(tree, activeKey);
    const isActiveTile = activeSessionId === activeKey;
    const outline =
      multiple && isActiveTile ? '2px solid var(--mantine-primary-color-filled)' : 'none';

    return (
      <div
        onMouseDownCapture={() => setActiveSession(activeKey)}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--mantine-color-dark-7)',
          borderRadius: standalone ? 8 : 0,
          border: standalone ? '1px solid var(--mantine-color-dark-4)' : 'none',
          overflow: 'hidden',
          outline,
          outlineOffset: -2,
        }}
      >
        {standalone && <StandaloneHeader sessionId={activeKey} profiles={profiles} />}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <OutPortal node={node} />
        </div>
      </div>
    );
  };

  return (
    <Stack gap="sm" h="100%">
      {/* Keep-alive pool: every live session rendered once into its detached node. */}
      {sessionIds.map((id) => {
        const node = portalNodes.current.get(id);
        const meta = sessions[id];
        const profile = meta ? profiles.find((p) => p.id === meta.profileId) : undefined;
        if (!node || !profile) return null;
        return (
          <InPortal key={id} node={node}>
            <ConnectionView
              sessionId={id}
              profile={profile}
              active={id === activeSessionId}
              onUpdateHistory={(patch) => onUpdateHistory(profile.id, patch)}
            />
          </InPortal>
        );
      })}

      {usesWebProxy && <ProxyWarning />}

      {tree ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <DndProvider backend={HTML5Backend}>
            <MosaicWithoutDragDropContext<string>
              className="ssh-mosaic"
              value={tree}
              onChange={changeTree}
              createNode={() => {
                // Split / add-tab duplicates the focused session's profile.
                const sourceId =
                  activeSessionId && sessions[activeSessionId] ? activeSessionId : sessionIds[0];
                const profileId = sourceId ? sessions[sourceId]?.profileId : profiles[0]?.id;
                if (!profileId) throw new Error('No profile available to open a session');
                return createSession(profileId);
              }}
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
