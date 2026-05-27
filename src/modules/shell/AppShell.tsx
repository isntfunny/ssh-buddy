import { AppShell as MantineAppShell, Burger, Group, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactNode } from 'react';

type Props = {
  navbar: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function AppShell({ navbar, footer, children }: Props) {
  const [opened, { toggle }] = useDisclosure();

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" gap="sm">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Title order={4}>ssh-buddy</Title>
        </Group>
      </MantineAppShell.Header>
      <MantineAppShell.Navbar p="xs" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>{navbar}</div>
        {footer}
      </MantineAppShell.Navbar>
      <MantineAppShell.Main
        style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
