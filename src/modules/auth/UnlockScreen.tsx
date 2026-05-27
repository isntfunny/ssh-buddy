import { useState } from 'react';
import { Button, Center, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';

type Props = {
  biometricAvailable: boolean;
  onUnlockBiometric: () => Promise<void>;
  onUnlockPassword: (password: string) => Promise<void>;
};

export function UnlockScreen({ biometricAvailable, onUnlockBiometric, onUnlockPassword }: Props) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(!biometricAvailable);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBiometric = async () => {
    setLoading(true);
    setError(null);
    try {
      await onUnlockBiometric();
    } catch {
      setError('Biometrische Entsperrung fehlgeschlagen.');
      setShowPassword(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePassword = async () => {
    setLoading(true);
    setError(null);
    try {
      await onUnlockPassword(password);
    } catch {
      setError('Falsches Master-Passwort.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center style={{ position: 'fixed', inset: 0, background: 'var(--mantine-color-body)', zIndex: 9999 }}>
      <Stack align="center" gap="md" style={{ width: 320 }}>
        <IconLock size={40} />
        <Title order={3}>ssh-buddy ist gesperrt</Title>
        {error && <Text c="red" size="sm">{error}</Text>}
        {biometricAvailable && !showPassword && (
          <>
            <Button fullWidth loading={loading} onClick={handleBiometric} color="green">
              Biometrisch entsperren
            </Button>
            <Text
              size="xs"
              c="dimmed"
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setShowPassword(true)}
            >
              Master-Passwort eingeben
            </Text>
          </>
        )}
        {showPassword && (
          <Stack style={{ width: '100%' }} gap="xs">
            <PasswordInput
              placeholder="Master-Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handlePassword(); }}
            />
            <Button fullWidth loading={loading} onClick={handlePassword}>
              Entsperren
            </Button>
          </Stack>
        )}
      </Stack>
    </Center>
  );
}
