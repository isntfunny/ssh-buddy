import { Alert, Button, Group, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ssh_buddy_proxy_warning_dismissed';

export function ProxyWarning() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  return (
    <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light" mb="sm">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text size="sm">
          <strong>Security Notice:</strong> Browser SSH uses the configured WebSocket proxy. The proxy can observe credentials during handshake.
        </Text>
        <Button size="xs" variant="outline" color="yellow" onClick={handleDismiss} style={{ flex: '0 0 auto' }}>
          Understood
        </Button>
      </Group>
    </Alert>
  );
}
