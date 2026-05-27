import { useState } from 'react';
import { Button, Modal, PasswordInput, Stack, Tabs, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';

type Props = {
  opened: boolean;
  onClose: () => void;
  onSignUp: (email: string, pbPassword: string, masterPassword: string) => Promise<void>;
  onSignIn: (email: string, pbPassword: string, masterPassword: string) => Promise<void>;
};

function AuthForm({
  label,
  onSubmit,
}: {
  label: string;
  onSubmit: (email: string, pbPw: string, masterPw: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [pbPw, setPbPw] = useState('');
  const [masterPw, setMasterPw] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      await onSubmit(email, pbPw, masterPw);
    } catch (e) {
      notifications.show({ message: String(e), color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="xs">
      <TextInput label="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      <PasswordInput label="Passwort (Account)" value={pbPw} onChange={(e) => setPbPw(e.target.value)} />
      <PasswordInput
        label="Master-Passwort (Verschlüsselung)"
        description="Wird nie zum Server gesendet. Bei Verlust sind deine Daten unwiederbringlich weg."
        value={masterPw}
        onChange={(e) => setMasterPw(e.target.value)}
      />
      <Button loading={loading} onClick={handle} mt="xs">
        {label}
      </Button>
    </Stack>
  );
}

export function SetupModal({ opened, onClose, onSignUp, onSignIn }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Sync einrichten" size="sm">
      <Tabs defaultValue="signin">
        <Tabs.List>
          <Tabs.Tab value="signin">Anmelden</Tabs.Tab>
          <Tabs.Tab value="signup">Registrieren</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="signin" pt="md">
          <AuthForm label="Anmelden" onSubmit={onSignIn} />
        </Tabs.Panel>
        <Tabs.Panel value="signup" pt="md">
          <Text size="xs" c="dimmed" mb="xs">
            Erstellt einen kostenlosen Account. Deine Profile werden Ende-zu-Ende verschlüsselt — nur du kannst sie lesen.
          </Text>
          <AuthForm label="Account erstellen" onSubmit={onSignUp} />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
