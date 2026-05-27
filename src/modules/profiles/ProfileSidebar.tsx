import { ActionIcon, Group, NavLink, Stack, Text, Menu } from '@mantine/core';
import { IconPlus, IconServer, IconTrash, IconDotsVertical, IconFolder, IconHash, IconPlayerPlay, IconCopy, IconEdit } from '@tabler/icons-react';
import type { Profile } from './types';
import { useState } from 'react';

type Props = {
  profiles: Profile[];
  onConnect: (id: string) => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
};

export function ProfileSidebar({ profiles, onConnect, onAdd, onEdit, onDelete, onDuplicate }: Props) {
  // Collect all unique tags
  const tags = Array.from(new Set(profiles.flatMap((p) => p.tags || []))).sort();
  const untagged = profiles.filter((p) => !p.tags || p.tags.length === 0);

  return (
    <Stack gap={4}>
      <Group justify="space-between" px={4}>
        <Text fw={600} size="xs" c="dimmed" tt="uppercase" lts={1}>Profiles</Text>
        <ActionIcon variant="subtle" size="sm" onClick={onAdd} aria-label="New profile">
          <IconPlus size={14} />
        </ActionIcon>
      </Group>

      {profiles.length === 0 && (
        <Text c="dimmed" size="xs" px={4}>No profiles yet. Click + to create one.</Text>
      )}

      {tags.map((tag) => (
        <NavLink
          key={tag}
          label={tag}
          leftSection={<IconHash size={14} />}
          defaultOpened
          childrenOffset={12}
          styles={{
            root: { padding: '4px 8px', minHeight: 32 },
            label: { fontSize: 'var(--mantine-font-size-xs)', fontWeight: 500 },
          }}
        >
          {profiles
            .filter((p) => p.tags?.includes(tag))
            .map((p) => (
              <ProfileItem key={p.id} profile={p} onConnect={onConnect} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} />
            ))}
        </NavLink>
      ))}

      {untagged.length > 0 && (
        <NavLink
          label="Untagged"
          leftSection={<IconFolder size={14} />}
          defaultOpened
          childrenOffset={12}
          styles={{
            root: { padding: '4px 8px', minHeight: 32 },
            label: { fontSize: 'var(--mantine-font-size-xs)', fontWeight: 500 },
          }}
        >
          {untagged.map((p) => (
            <ProfileItem key={p.id} profile={p} onConnect={onConnect} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} />
          ))}
        </NavLink>
      )}
    </Stack>
  );
}

function ProfileItem({ profile, onConnect, onEdit, onDelete, onDuplicate }: Omit<Props, 'profiles' | 'onAdd'> & { profile: Profile }) {
  const [menuOpened, setMenuOpened] = useState(false);

  return (
    <NavLink
      onClick={() => onConnect(profile.id)}
      leftSection={<IconServer size={14} color={profile.color || 'var(--mantine-color-gray-5)'} />}
      label={<Text size="xs" truncate>{profile.name}</Text>}
      styles={{
        root: { padding: '4px 8px', minHeight: 32 },
      }}
      rightSection={
        <Menu opened={menuOpened} onChange={setMenuOpened} withinPortal position="right-start">
          <Menu.Target>
            <ActionIcon variant="subtle" size="sm" onClick={(e) => { e.stopPropagation(); setMenuOpened((o) => !o); }}>
              <IconDotsVertical size={12} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPlayerPlay size={14} />} onClick={(e) => { e.stopPropagation(); onConnect(profile.id); }}>Connect</Menu.Item>
            <Menu.Item leftSection={<IconEdit size={14} />} onClick={(e) => { e.stopPropagation(); onEdit(profile.id); }}>Edit</Menu.Item>
            <Menu.Item leftSection={<IconCopy size={14} />} onClick={(e) => { e.stopPropagation(); onDuplicate(profile.id); }}>Duplicate</Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={(e) => { e.stopPropagation(); onDelete(profile.id); }}>Delete</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      }
    />
  );
}
