import { Text } from '@mantine/core';
import { AppShell } from './modules/shell/AppShell';

function App() {
  return (
    <AppShell navbar={<Text c="dimmed">Profiles will go here.</Text>}>
      <Text>Welcome to ssh-buddy.</Text>
    </AppShell>
  );
}

export default App;
