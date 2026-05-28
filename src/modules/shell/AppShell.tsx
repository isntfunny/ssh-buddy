import { AppShell as MantineAppShell, ActionIcon, Group, Title, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconTerminal2,
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
          <Group gap={8} wrap="nowrap">
            <IconTerminal2 size={20} color="var(--mantine-color-teal-4)" />
            <Title order={5}>ssh-buddy</Title>
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
