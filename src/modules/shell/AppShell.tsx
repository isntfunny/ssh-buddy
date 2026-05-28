import {
  AppShell as MantineAppShell,
  ActionIcon,
  Burger,
  Group,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { ReactNode } from 'react';

type Props = {
  navbar: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Mobile drawer open state (overlay below the `sm` breakpoint). */
  mobileOpened: boolean;
  /** Desktop sidebar shown/collapsed state (pushes content). */
  desktopOpened: boolean;
  onToggleMobile: () => void;
  onToggleDesktop: () => void;
};

// Android draws the app edge-to-edge behind the status/navigation bars; these
// insets keep content tappable and out from under the system bars. They resolve
// to 0 on desktop, so the layout is unchanged there.
const SAFE_TOP = 'env(safe-area-inset-top)';
const SAFE_BOTTOM = 'env(safe-area-inset-bottom)';

export function AppShell({
  navbar,
  footer,
  children,
  mobileOpened,
  desktopOpened,
  onToggleMobile,
  onToggleDesktop,
}: Props) {
  return (
    <MantineAppShell
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      padding={0}
    >
      <MantineAppShell.Navbar style={{ display: 'flex', flexDirection: 'column', paddingTop: SAFE_TOP }}>
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
          {/* Mobile: close the drawer. Desktop: collapse the sidebar. */}
          <ActionIcon hiddenFrom="sm" variant="subtle" color="gray" onClick={onToggleMobile} aria-label="Sidebar schließen">
            <IconLayoutSidebarLeftCollapse size={18} />
          </ActionIcon>
          <Tooltip label="Collapse sidebar" openDelay={400} visibleFrom="sm">
            <ActionIcon visibleFrom="sm" variant="subtle" color="gray" onClick={onToggleDesktop} aria-label="Collapse sidebar">
              <IconLayoutSidebarLeftCollapse size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>{navbar}</div>
        <div style={{ paddingBottom: SAFE_BOTTOM }}>{footer}</div>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          paddingTop: SAFE_TOP,
          paddingBottom: SAFE_BOTTOM,
        }}
      >
        {/* Mobile: open the sidebar drawer. */}
        <Burger
          hiddenFrom="sm"
          opened={mobileOpened}
          onClick={onToggleMobile}
          size="sm"
          aria-label="Sidebar öffnen"
          style={{ position: 'absolute', top: `calc(${SAFE_TOP} + 7px)`, left: 8, zIndex: 90 }}
        />
        {/* Desktop: reopen the collapsed sidebar. */}
        {!desktopOpened && (
          <Tooltip label="Show sidebar" openDelay={400}>
            <ActionIcon
              visibleFrom="sm"
              variant="subtle"
              color="gray"
              onClick={onToggleDesktop}
              aria-label="Show sidebar"
              style={{
                position: 'absolute',
                top: `calc(${SAFE_TOP} + 4px)`,
                left: 4,
                zIndex: 90,
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
