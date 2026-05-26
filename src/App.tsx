import { Button, Stack, Title, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';

function App() {
  return (
    <Stack p="xl" gap="md">
      <Title order={1}>ssh-buddy</Title>
      <Text c="dimmed">Mantine is wired up.</Text>
      <Button
        onClick={() =>
          notifications.show({ title: 'Hello', message: 'Mantine works.' })
        }
      >
        Test notification
      </Button>
    </Stack>
  );
}

export default App;
