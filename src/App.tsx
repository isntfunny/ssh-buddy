import { useRef, useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AppShell } from './modules/shell/AppShell';
import { ConnectionView } from './modules/shell/ConnectionView';
import { ProfileForm } from './modules/profiles/ProfileForm';
import { ProfileList } from './modules/profiles/ProfileList';
import { useProfiles } from './modules/profiles/useProfiles';
import { exportProfilesToJson, downloadJson, parseProfilesImport } from './modules/profiles/importExport';

function App() {
  const { profiles, loading, error, create, update, remove } = useProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const editing = profiles.find((p) => p.id === editingId) ?? null;

  const handleExport = () => {
    downloadJson('ssh-buddy-profiles.json', exportProfilesToJson(profiles));
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseProfilesImport(text);
      let importedCount = 0;
      for (const p of imported) {
        if (profiles.some((existing) => existing.id === p.id)) continue;
        await create({
          name: p.name,
          host: p.host,
          port: p.port,
          username: p.username,
          auth: p.auth,
          notes: p.notes,
          tags: p.tags,
          snippets: p.snippets,
          envVars: p.envVars,
        });
        importedCount++;
      }
      notifications.show({ message: `Imported ${importedCount} profile(s)` });
    } catch (e) {
      notifications.show({ message: `Import failed: ${String(e)}`, color: 'red' });
    }
  };

  return (
    <AppShell
      navbar={
        loading ? (
          <Text c="dimmed">Loading…</Text>
        ) : error ? (
          <Text c="red">{error.message}</Text>
        ) : (
          <>
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
            <Group mt="auto" pt="md" gap="xs">
              <Button size="xs" variant="subtle" onClick={handleExport} style={{ flex: 1 }}>
                Export
              </Button>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => importInputRef.current?.click()}
                style={{ flex: 1 }}
              >
                Import
              </Button>
            </Group>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file);
                e.target.value = '';
              }}
            />
          </>
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
            <ConnectionView
              key={selected.id}
              profile={selected}
              onUpdateHistory={(patch) => update(selected.id, patch)}
            />
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
