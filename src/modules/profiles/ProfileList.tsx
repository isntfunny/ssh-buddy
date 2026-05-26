import { ActionIcon, Group, NavLink, Stack, Text } from '@mantine/core';
import { IconPlus, IconServer, IconTrash } from '@tabler/icons-react';
import type { Profile } from './types';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type Props = {
  profiles: Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
};

export function ProfileList({ profiles, selectedId, onSelect, onAdd, onDelete }: Props) {
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={500} size="sm" c="dimmed" tt="uppercase">
          Profiles
        </Text>
        <ActionIcon variant="subtle" onClick={onAdd} aria-label="New profile">
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
      {profiles.length === 0 && (
        <Text c="dimmed" size="sm">
          No profiles yet. Click + to create one.
        </Text>
      )}
      {profiles.map((p) => (
        <NavLink
          key={p.id}
          active={p.id === selectedId}
          onClick={() => onSelect(p.id)}
          leftSection={<IconServer size={16} />}
          label={p.name}
          description={
            p.lastConnectedAt
              ? `${p.username}@${p.host}:${p.port} · ${relativeTime(p.lastConnectedAt)}`
              : `${p.username}@${p.host}:${p.port}`
          }
          rightSection={
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p.id);
              }}
              aria-label={`Delete ${p.name}`}
            >
              <IconTrash size={14} />
            </ActionIcon>
          }
        />
      ))}
    </Stack>
  );
}
