import { ActionIcon, Center, Group, Tabs, Text, Tooltip } from '@mantine/core';
import { IconColumns, IconLayoutGridRemove, IconX } from '@tabler/icons-react';
import { useWorkspace, MAX_PANES } from './WorkspaceProvider';
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
  const { panes, activePaneId, setActivePane, setActiveSession, removeSession, splitPane, closePane } =
    useWorkspace();
  const pane = panes[paneId];
  if (!pane) return null;

  const paneCount = Object.keys(panes).length;
  const isActive = activePaneId === paneId;
  const showActiveBorder = paneCount > 1 && isActive;

  const controls = (
    <Group gap={2} wrap="nowrap">
      <Tooltip label={paneCount >= MAX_PANES ? `Max ${MAX_PANES} panes` : 'Split pane'}>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          disabled={paneCount >= MAX_PANES}
          onClick={(e) => {
            e.stopPropagation();
            splitPane();
          }}
          aria-label="Split pane"
        >
          <IconColumns size={16} />
        </ActionIcon>
      </Tooltip>
      {paneCount > 1 && (
        <Tooltip label="Close pane">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={(e) => {
              e.stopPropagation();
              closePane(paneId);
            }}
            aria-label="Close pane"
          >
            <IconLayoutGridRemove size={16} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );

  const wrapperStyle: React.CSSProperties = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    border: `2px solid ${showActiveBorder ? 'var(--mantine-primary-color-filled)' : 'transparent'}`,
    borderRadius: 4,
    overflow: 'hidden',
  };

  if (pane.sessions.length === 0) {
    return (
      <div style={wrapperStyle} onMouseDownCapture={() => setActivePane(paneId)}>
        <Group justify="flex-end" bg="dark.7" px="xs" py={4}>
          {controls}
        </Group>
        <Center style={{ flex: 1 }}>
          <Text c="dimmed" size="sm">
            Select a profile to open it in this pane.
          </Text>
        </Center>
      </div>
    );
  }

  return (
    <div style={wrapperStyle} onMouseDownCapture={() => setActivePane(paneId)}>
      <Tabs
        value={pane.activeSessionId}
        onChange={(val) => {
          if (val) setActiveSession(paneId, val);
        }}
        style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
        variant="pills"
        radius="xs"
      >
        <Tabs.List bg="dark.7" style={{ flexWrap: 'nowrap' }}>
          <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
            {pane.sessions.map((session) => {
              const profile = profiles.find((p) => p.id === session.profileId);
              return (
                <Tabs.Tab
                  key={session.id}
                  value={session.id}
                  style={{ borderBottom: `2px solid ${profile?.color || 'transparent'}` }}
                  rightSection={
                    <ActionIcon
                      size="xs"
                      variant="transparent"
                      c="dimmed"
                      component="div"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSession(paneId, session.id);
                      }}
                      aria-label="Close tab"
                    >
                      <IconX size={10} />
                    </ActionIcon>
                  }
                >
                  {profile?.name || 'Unknown'}
                </Tabs.Tab>
              );
            })}
          </Group>
          {controls}
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
    </div>
  );
}
