import { AppShell as MantineAppShell, Burger, Group, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactNode } from 'react';

type Props = {
  navbar: ReactNode;
  children: ReactNode;
};

export function AppShell({ navbar, children }: Props) {
  const [opened, { toggle }] = useDisclosure();

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{ width: 280, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" gap="sm">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Title order={4}>ssh-buddy</Title>
        </Group>
      </MantineAppShell.Header>
      <MantineAppShell.Navbar p="md">{navbar}</MantineAppShell.Navbar>
      <MantineAppShell.Main>{children}</MantineAppShell.Main>
    </MantineAppShell>
  );
}
