import { useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AppShell } from './modules/shell/AppShell';
import { ConnectionView } from './modules/shell/ConnectionView';
import { ProfileForm } from './modules/profiles/ProfileForm';
import { ProfileList } from './modules/profiles/ProfileList';
import { useProfiles } from './modules/profiles/useProfiles';

function App() {
  const { profiles, loading, error, create, update, remove } = useProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const editing = profiles.find((p) => p.id === editingId) ?? null;

  return (
    <AppShell
      navbar={
        loading ? (
          <Text c="dimmed">Loading…</Text>
        ) : error ? (
          <Text c="red">{error.message}</Text>
        ) : (
          <ProfileList
            profiles={profiles}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={() => {
              setEditingId(null);
              setEditorOpen(true);
            }}
            onDelete={async (id) => {
              await remove(id);
              if (selectedId === id) setSelectedId(null);
              notifications.show({ message: 'Profile deleted' });
            }}
          />
        )
      }
    >
      {selected ? (
        <Stack gap="sm" style={{ height: '100%', flex: 1 }}>
          <Group justify="flex-end">
            <Button
              onClick={() => {
                setEditingId(selected.id);
                setEditorOpen(true);
              }}
              variant="subtle"
              size="xs"
            >
              Edit profile
            </Button>
          </Group>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ConnectionView key={selected.id} profile={selected} />
          </div>
        </Stack>
      ) : (
        <Text c="dimmed">Select a profile, or create one with the + button.</Text>
      )}

      <Modal
        opened={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? 'Edit profile' : 'New profile'}
        size="lg"
      >
        <ProfileForm
          initial={editing ?? undefined}
          onCancel={() => setEditorOpen(false)}
          onSubmit={async (values) => {
            if (editing) {
              await update(editing.id, values);
              notifications.show({ message: 'Profile updated' });
            } else {
              const created = await create(values);
              setSelectedId(created.id);
              notifications.show({ message: 'Profile created' });
            }
            setEditorOpen(false);
          }}
        />
      </Modal>
    </AppShell>
  );
}

export default App;
