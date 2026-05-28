import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type IWatermarkPanelProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import './workspace.css';
import { InPortal, OutPortal } from 'react-reverse-portal';
import { Center, Text } from '@mantine/core';
import { isTauri } from '@tauri-apps/api/core';
import type { Profile } from '../profiles/types';
import { useWorkspace } from './WorkspaceProvider';
import { ProfilesContext } from './profilesContext';
import { ConnectionView } from './ConnectionView';
import { ProxyWarning } from './ProxyWarning';
import { SessionTab } from './SessionTab';

type HistoryPatch = {
  lastConnectedAt?: string;
  lastHostKeyFingerprint?: string;
  lastErrorCategory?: string;
};

type Props = {
  profiles: Profile[];
  onUpdateHistory: (profileId: string, patch: HistoryPatch) => void;
};

type SessionParams = { sessionId: string };

/**
 * The panel body just hoists the session's live, keep-alive node into place via
 * react-reverse-portal. The actual ConnectionView (SSH + xterm) is mounted once in
 * the pool below and never unmounts while the session exists, so dragging a tab to a
 * new pane, switching tabs, or closing a sibling never touches the terminal subtree.
 */
function SessionPanel(props: IDockviewPanelProps<SessionParams>) {
  const { getPortalNode } = useWorkspace();
  return <OutPortal node={getPortalNode(props.params.sessionId)} />;
}

function EmptyWatermark(_props: IWatermarkPanelProps) {
  return (
    <Center h="100%">
      <Text c="dimmed" size="sm">
        Select a profile from the sidebar to open a connection.
      </Text>
    </Center>
  );
}

const components = { session: SessionPanel };
const tabComponents = { session: SessionTab };

export function Workspace({ profiles, onUpdateHistory }: Props) {
  const { sessions, activeSessionId, setApi, getPortalNode } = useWorkspace();
  const usesWebProxy = !isTauri();
  const sessionIds = Object.keys(sessions);

  const onReady = (event: DockviewReadyEvent) => setApi(event.api);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Keep-alive pool: each session's ConnectionView is mounted exactly once into a
          detached node and stays alive for the session's whole lifetime. */}
      {sessionIds.map((id) => {
        const profile = profiles.find((p) => p.id === sessions[id]?.profileId);
        if (!profile) return null;
        return (
          <InPortal key={id} node={getPortalNode(id)}>
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

      <ProfilesContext.Provider value={profiles}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <DockviewReact
            className="ssh-dockview dockview-theme-dark"
            components={components}
            tabComponents={tabComponents}
            watermarkComponent={EmptyWatermark}
            onReady={onReady}
            singleTabMode="default"
            disableFloatingGroups
          />
        </div>
      </ProfilesContext.Provider>
    </div>
  );
}
