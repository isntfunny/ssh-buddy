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
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={500} size="sm" c="dimmed" tt="uppercase">Profiles</Text>
        <ActionIcon variant="subtle" onClick={onAdd} aria-label="New profile">
          <IconPlus size={16} />
        </ActionIcon>
      </Group>

      {profiles.length === 0 && (
        <Text c="dimmed" size="sm">No profiles yet. Click + to create one.</Text>
      )}

      {tags.map((tag) => (
        <NavLink key={tag} label={tag} leftSection={<IconHash size={16} />} defaultOpened childrenOffset={28}>
          {profiles
            .filter((p) => p.tags?.includes(tag))
            .map((p) => (
              <ProfileItem key={p.id} profile={p} onConnect={onConnect} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} />
            ))}
        </NavLink>
      ))}

      {untagged.length > 0 && (
        <NavLink label="Untagged" leftSection={<IconFolder size={16} />} defaultOpened childrenOffset={28}>
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
      leftSection={<IconServer size={16} color={profile.color || 'var(--mantine-color-gray-5)'} />}
      label={<Text truncate>{profile.name}</Text>}
      rightSection={
        <Menu opened={menuOpened} onChange={setMenuOpened} withinPortal position="right-start">
          <Menu.Target>
            <ActionIcon variant="subtle" onClick={(e) => { e.stopPropagation(); setMenuOpened((o) => !o); }}>
              <IconDotsVertical size={14} />
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
