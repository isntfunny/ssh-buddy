import { AppShell as MantineAppShell, ActionIcon, Group, Stack, Text, Title, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { ReactNode } from 'react';

type Props = {
  navbar: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function AppShell({ navbar, footer, children }: Props) {
  const [collapsed, { toggle }] = useDisclosure(false);

  return (
    <MantineAppShell
      navbar={{ width: 260, breakpoint: 'xs', collapsed: { desktop: collapsed, mobile: collapsed } }}
      padding={0}
    >
      <MantineAppShell.Navbar style={{ display: 'flex', flexDirection: 'column' }}>
        <Group
          justify="space-between"
          wrap="nowrap"
          px="sm"
          style={{
            height: 44,
            flex: '0 0 auto',
            borderBottom: '1px solid var(--mantine-color-dark-4)',
          }}
        >
          <Group gap={9} wrap="nowrap">
            <img src="/logo.svg" alt="" width={26} height={26} style={{ display: 'block', borderRadius: 6 }} />
            <Stack gap={0}>
              <Title order={5} lh={1.05}>ssh-buddy</Title>
              <Text size="10px" c="dimmed" lh={1}>v{__APP_VERSION__}</Text>
            </Stack>
          </Group>
          <Tooltip label="Collapse sidebar" openDelay={400}>
            <ActionIcon variant="subtle" color="gray" onClick={toggle} aria-label="Collapse sidebar">
              <IconLayoutSidebarLeftCollapse size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>{navbar}</div>
        {footer}
      </MantineAppShell.Navbar>

      <MantineAppShell.Main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {collapsed && (
          <Tooltip label="Show sidebar" openDelay={400}>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={toggle}
              aria-label="Show sidebar"
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                zIndex: 200,
                background: 'var(--mantine-color-dark-8)',
              }}
            >
              <IconLayoutSidebarLeftExpand size={18} />
            </ActionIcon>
          </Tooltip>
        )}
        {children}
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
