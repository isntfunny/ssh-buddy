import { ActionIcon, Group, NavLink, Stack, Text } from '@mantine/core';
import { IconPlus, IconServer, IconTrash } from '@tabler/icons-react';
import type { Profile } from './types';

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
          description={`${p.username}@${p.host}:${p.port}`}
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
