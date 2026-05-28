import { useRef, useState } from 'react';
import { Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AppShell } from './modules/shell/AppShell';
import { ProfileForm } from './modules/profiles/ProfileForm';
import { ProfileSidebar } from './modules/profiles/ProfileSidebar';
import { WorkspaceProvider, useWorkspace } from './modules/shell/WorkspaceProvider';
import { Workspace } from './modules/shell/Workspace';
import { useProfiles } from './modules/profiles/useProfiles';
import { exportProfilesToJson, downloadJson, parseProfilesImport } from './modules/profiles/importExport';
import { useUpdater } from './modules/updater/useUpdater';
import { useAuth } from './modules/auth/useAuth';
import { useSync } from './modules/sync/useSync';
import { UnlockScreen } from './modules/auth/UnlockScreen';
import { SetupModal } from './modules/auth/SetupModal';
import { AccountModal } from './modules/auth/AccountModal';
import { AccountFooter, UpdateButton } from './modules/shell/AccountFooter';

function InnerApp() {
  const { addSession } = useWorkspace();
  const { profiles, loading, error, reload, create, update, remove } = useProfiles();
  const { state, key, user, biometricAvailable, signUp, signIn, unlock, unlockBiometric, rememberKey, signOut } = useAuth();
  const { status: syncStatus, lastSyncedAt } = useSync(key, reload);
  const updater = useUpdater();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [biometricPromptOpen, setBiometricPromptOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

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

  const handleFooterClick = () => {
    if (state === 'not-configured') setSetupOpen(true);
    else if (state === 'unlocked') setAccountOpen(true);
  };

  const handleRememberDevice = async () => {
    try {
      await rememberKey(true);
      notifications.show({ message: 'Gerät wurde gemerkt' });
      setBiometricPromptOpen(false);
    } catch (e) {
      notifications.show({ message: `Speichern fehlgeschlagen: ${String(e)}`, color: 'red' });
    }
  };

  const handleDuplicate = async (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = profile;
    await create({ ...rest, name: `${profile.name} (Copy)` });
    notifications.show({ message: 'Profile duplicated' });
  };

  const footer = (
    <Box pt={6} style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
      {updater.ready && (
        <Box px={8} pb={6}>
          <UpdateButton version={updater.version} onRestart={() => void updater.restart()} />
        </Box>
      )}
      {state === 'not-configured' && <AccountFooter state="not-configured" onClick={handleFooterClick} />}
      {state === 'locked' && user && <AccountFooter state="locked" user={user} onClick={handleFooterClick} />}
      {state === 'unlocked' && user && <AccountFooter state="unlocked" user={user} lastSyncedAt={lastSyncedAt} syncStatus={syncStatus} onClick={handleFooterClick} />}
    </Box>
  );

  return (
    <>
      {state === 'locked' && (
        <UnlockScreen biometricAvailable={biometricAvailable} onUnlockBiometric={unlockBiometric} onUnlockPassword={unlock} />
      )}

      <SetupModal opened={setupOpen} onClose={() => setSetupOpen(false)} onSignUp={async (email, pbPw, masterPw) => { await signUp(email, pbPw, masterPw); if (biometricAvailable) setBiometricPromptOpen(true); setSetupOpen(false); }} onSignIn={async (email, pbPw, masterPw) => { await signIn(email, pbPw, masterPw); if (biometricAvailable) setBiometricPromptOpen(true); setSetupOpen(false); }} />

      <Modal opened={biometricPromptOpen} onClose={() => setBiometricPromptOpen(false)} title="Gerät merken?" size="sm">
        <Stack gap="sm">
          <Text size="sm">Beim nächsten Start automatisch entsperren.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setBiometricPromptOpen(false)}>Später</Button>
            <Button onClick={handleRememberDevice}>Ja, merken</Button>
          </Group>
        </Stack>
      </Modal>

      {user && (
        <AccountModal opened={accountOpen} onClose={() => setAccountOpen(false)} user={user} syncStatus={syncStatus} lastSyncedAt={lastSyncedAt} biometricAvailable={state === 'unlocked' && biometricAvailable} onRememberDevice={handleRememberDevice} onSignOut={async () => { await signOut(); setAccountOpen(false); }} onExport={handleExport} onImport={() => importInputRef.current?.click()} />
      )}

      <input ref={importInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleImport(file); e.target.value = ''; }} />

      <AppShell
        footer={footer}
        navbar={
          loading ? (
            <Text c="dimmed">Loading…</Text>
          ) : error ? (
            <Text c="red">{error.message}</Text>
          ) : (
            <ProfileSidebar
              profiles={profiles}
              onConnect={addSession}
              onAdd={() => { setEditingId(null); setEditorOpen(true); }}
              onEdit={(id) => { setEditingId(id); setEditorOpen(true); }}
              onDelete={async (id) => { await remove(id); notifications.show({ message: 'Profile deleted' }); }}
              onDuplicate={handleDuplicate}
            />
          )
        }
      >
        <Workspace profiles={profiles} onUpdateHistory={update} />

        <Modal opened={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? 'Edit profile' : 'New profile'} size="lg">
          <ProfileForm
            initial={editing ?? undefined}
            onCancel={() => setEditorOpen(false)}
            onSubmit={async (values) => {
              if (editing) {
                await update(editing.id, values);
                notifications.show({ message: 'Profile updated' });
              } else {
                await create(values);
                notifications.show({ message: 'Profile created' });
              }
              setEditorOpen(false);
            }}
          />
        </Modal>
      </AppShell>
    </>
  );
}

function App() {
  return (
    <WorkspaceProvider>
      <InnerApp />
    </WorkspaceProvider>
  );
}

export default App;
