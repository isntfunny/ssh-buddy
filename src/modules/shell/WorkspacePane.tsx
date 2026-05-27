import { Tabs, ActionIcon } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useWorkspace } from './WorkspaceProvider';
import { ConnectionView } from './ConnectionView';
import type { Profile } from '../profiles/types';

type HistoryPatch = {
  lastConnectedAt?: string;
  lastHostKeyFingerprint?: string;
  lastErrorCategory?: string;
};

type Props = {
  paneId: string;
  profiles: Profile[];
  onUpdateHistory: (profileId: string, patch: HistoryPatch) => void;
};

export function WorkspacePane({ paneId, profiles, onUpdateHistory }: Props) {
  const { panes, setActiveSession, removeSession } = useWorkspace();
  const pane = panes[paneId];

  if (!pane || pane.sessions.length === 0) return null;

  return (
    <Tabs
      value={pane.activeSessionId}
      onChange={(val) => { if (val) setActiveSession(paneId, val); }}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      variant="pills"
      radius="xs"
    >
      <Tabs.List bg="dark.7">
        {pane.sessions.map((session) => {
          const profile = profiles.find((p) => p.id === session.profileId);
          return (
            <Tabs.Tab
              key={session.id}
              value={session.id}
              style={{ borderBottom: `2px solid ${profile?.color || 'transparent'}` }}
              rightSection={
                <ActionIcon size="xs" variant="transparent" c="dimmed" onClick={(e) => { e.stopPropagation(); removeSession(paneId, session.id); }}>
                  <IconX size={10} />
                </ActionIcon>
              }
            >
              {profile?.name || 'Unknown'}
            </Tabs.Tab>
          );
        })}
      </Tabs.List>

      {pane.sessions.map((session) => {
        const profile = profiles.find((p) => p.id === session.profileId);
        if (!profile) return null;
        return (
          <Tabs.Panel key={session.id} value={session.id} style={{ flex: 1, minHeight: 0, padding: 8 }}>
            <ConnectionView
              key={session.id}
              profile={profile}
              onUpdateHistory={(patch) => onUpdateHistory(profile.id, patch)}
            />
          </Tabs.Panel>
        );
      })}
    </Tabs>
  );
}
