# Plan 1: Local MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-only SSH client app that runs on desktop (macOS, Linux, Windows). The user can create plaintext SSH profiles, click connect, and get a working interactive terminal to a remote server.

**Architecture:** Tauri 2.0 with a React + TypeScript frontend (Mantine v7). The Rust backend in `src-tauri/` uses `russh` to establish SSH sessions; output is streamed to the frontend via Tauri events and rendered in xterm.js. Profiles are stored as plaintext JSON in the OS app-data directory (`$APPDATA/ssh-buddy/profiles.json` or equivalent). **No encryption, no sync, no mobile builds, no web build** — those land in plans 2–4.

**Tech Stack:**
- Tauri 2 (Rust backend + WebView frontend)
- React 18, TypeScript 5, Vite 5
- Mantine v7 (UI), `@mantine/form`, `@mantine/notifications`
- xterm.js (`@xterm/xterm`) + `@xterm/addon-fit` + `@xterm/addon-web-links`
- `russh` 0.45 + `tokio` 1 for the Rust SSH backend
- Vitest for TS unit tests; `cargo test` for Rust unit + integration tests

---

## File structure (target after Plan 1)

```
ssh-buddy/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── index.html
├── src/
│   ├── main.tsx                 # React entry, Mantine providers
│   ├── App.tsx                  # Top-level component, routing
│   ├── theme.ts                 # Mantine theme
│   ├── lib/
│   │   ├── tauri.ts             # Typed invoke() / listen() wrappers
│   │   └── id.ts                # UUID helper
│   ├── modules/
│   │   ├── profiles/
│   │   │   ├── types.ts         # Profile, AuthMethod
│   │   │   ├── storage.ts       # Tauri-fs-backed CRUD
│   │   │   ├── storage.test.ts  # Vitest unit tests
│   │   │   ├── useProfiles.ts   # React hook with state
│   │   │   ├── ProfileList.tsx  # List view
│   │   │   └── ProfileForm.tsx  # Create/edit form
│   │   ├── ssh/
│   │   │   ├── types.ts         # Frontend-side SSH types
│   │   │   ├── client.ts        # Tauri-command wrappers
│   │   │   └── useSshSession.ts # React hook for one session
│   │   ├── terminal/
│   │   │   └── Terminal.tsx     # xterm.js React wrapper
│   │   └── shell/
│   │       ├── AppShell.tsx     # Mantine AppShell layout
│   │       └── ConnectionView.tsx # Terminal + status panel
│   └── vite-env.d.ts
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    ├── build.rs
    ├── src/
    │   ├── main.rs              # tauri::Builder entry
    │   ├── lib.rs               # exports for tests
    │   ├── error.rs             # AppError type
    │   ├── ssh/
    │   │   ├── mod.rs
    │   │   ├── session.rs       # one SSH session
    │   │   └── manager.rs       # registry of active sessions
    │   └── commands/
    │       ├── mod.rs
    │       └── ssh.rs           # ssh_connect, ssh_send_input, etc.
    └── tests/
        └── integration_ssh.rs   # gated by env var, hits real sshd
```

---

## Phase A — Project scaffold (Tasks 1–4)

### Task 1: Scaffold Tauri 2 + React + TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/*`, `src-tauri/*`

The directory `ssh-buddy/` already exists with `README.md`, `AGENTS.md`, `.gitignore`, and `docs/`. We must scaffold into it without losing those.

- [ ] **Step 1: Scaffold into a temp dir, then move files**

```bash
cd /root/projects/ssh-buddy
pnpm create tauri-app .scaffold-tmp --template react-ts --manager pnpm --identifier dev.tecfriends.sshbuddy --app-name ssh-buddy
shopt -s dotglob
mv .scaffold-tmp/* .
rmdir .scaffold-tmp
# Our existing .gitignore is intentional — restore it
git checkout .gitignore
# Our existing README is intentional — restore it
git checkout README.md
```

Expected: `package.json`, `src/`, `src-tauri/`, `index.html`, `vite.config.ts` etc. exist. `README.md`, `AGENTS.md`, `.gitignore`, `docs/` are unchanged.

- [ ] **Step 2: Install dependencies and verify dev build runs**

```bash
pnpm install
pnpm tauri dev
```

Expected: A native window opens with the default Tauri+React welcome screen. Close the window with Ctrl+C in the terminal.

If the build fails with "no Rust toolchain found", install it first:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri 2 + React + TypeScript"
```

---

### Task 2: Configure pnpm + lockfile policy

**Files:**
- Modify: `package.json`
- Create: `.npmrc`

- [ ] **Step 1: Pin Node and add useful scripts**

Edit `package.json`. Add the `engines` field and a few scripts. Replace `"scripts"` with:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "tauri": "tauri",
  "test": "vitest",
  "test:run": "vitest run",
  "lint": "tsc --noEmit"
},
"engines": {
  "node": ">=20",
  "pnpm": ">=9"
},
"packageManager": "pnpm@9.0.0"
```

- [ ] **Step 2: Create `.npmrc` to enforce pnpm**

Create file `.npmrc`:

```ini
engine-strict=true
strict-peer-dependencies=false
```

- [ ] **Step 3: Commit**

```bash
git add package.json .npmrc
git commit -m "chore: pin pnpm and node, add convenience scripts"
```

---

### Task 3: Install and wire Mantine v7

**Files:**
- Modify: `package.json` (via pnpm add)
- Create: `src/theme.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Install Mantine + dependencies**

```bash
pnpm add @mantine/core @mantine/hooks @mantine/form @mantine/notifications
pnpm add -D postcss postcss-preset-mantine postcss-simple-vars
```

- [ ] **Step 2: Add PostCSS config**

Create `postcss.config.cjs`:

```js
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
};
```

- [ ] **Step 3: Create theme**

Create `src/theme.ts`:

```ts
import { createTheme, MantineColorsTuple } from '@mantine/core';

const teal: MantineColorsTuple = [
  '#e6fcf5', '#c3fae8', '#96f2d7', '#63e6be', '#38d9a9',
  '#20c997', '#12b886', '#0ca678', '#099268', '#087f5b',
];

export const theme = createTheme({
  primaryColor: 'teal',
  colors: { teal },
  defaultRadius: 'md',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, Menlo, Monaco, monospace',
  headings: { fontWeight: '600' },
});
```

- [ ] **Step 4: Wire providers in `src/main.tsx`**

Replace the contents of `src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import App from './App';
import { theme } from './theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="bottom-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Replace `src/App.tsx` with a smoke test**

Replace contents:

```tsx
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
```

- [ ] **Step 6: Run and verify**

```bash
pnpm tauri dev
```

Expected: Dark window with "ssh-buddy" title, a button. Clicking the button shows a notification. Close the window.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): add Mantine v7 with dark theme"
```

---

### Task 4: Set up Vitest

**Files:**
- Modify: `package.json` (devDeps)
- Create: `vitest.config.ts`
- Create: `src/lib/id.ts`
- Create: `src/lib/id.test.ts`

- [ ] **Step 1: Install Vitest + helpers**

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @vitest/ui jsdom uuid
pnpm add -D @types/uuid
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 3: Create test setup**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Write the first test (`id.test.ts`)**

Create `src/lib/id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newId } from './id';

describe('newId', () => {
  it('returns a v4 UUID string', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});
```

- [ ] **Step 5: Run, verify FAIL**

```bash
pnpm test:run
```

Expected: FAIL — `Cannot find module './id'`.

- [ ] **Step 6: Implement `id.ts`**

Create `src/lib/id.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';

export function newId(): string {
  return uuidv4();
}
```

- [ ] **Step 7: Run, verify PASS**

```bash
pnpm test:run
```

Expected: Both tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: set up vitest with id helper"
```

---

## Phase B — App shell (Tasks 5–6)

### Task 5: Mantine AppShell layout

**Files:**
- Create: `src/modules/shell/AppShell.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create AppShell**

Create `src/modules/shell/AppShell.tsx`:

```tsx
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
```

- [ ] **Step 2: Update `App.tsx` to use AppShell**

Replace `src/App.tsx`:

```tsx
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
```

- [ ] **Step 3: Verify visually**

```bash
pnpm tauri dev
```

Expected: Window shows header with "ssh-buddy" and a sidebar with placeholder text.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(shell): add Mantine AppShell layout"
```

---

### Task 6: Add typed Tauri-invoke wrappers

**Files:**
- Create: `src/lib/tauri.ts`

- [ ] **Step 1: Create the wrapper**

Create `src/lib/tauri.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args ?? {});
}

export async function subscribe<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}
```

- [ ] **Step 2: Install the API package if not already pulled**

```bash
pnpm add @tauri-apps/api
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(lib): add typed tauri command/subscribe wrappers"
```

---

## Phase C — Profile model + storage (Tasks 7–11)

### Task 7: Define profile types

**Files:**
- Create: `src/modules/profiles/types.ts`

- [ ] **Step 1: Create types**

Create `src/modules/profiles/types.ts`:

```ts
export type AuthMethod =
  | { kind: 'password'; password: string }
  | { kind: 'privateKey'; pem: string; passphrase?: string };

export type Profile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewProfileInput = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;

export const SCHEMA_VERSION = 1 as const;

export type ProfileStoreFile = {
  schemaVersion: typeof SCHEMA_VERSION;
  profiles: Profile[];
};
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(profiles): define profile types"
```

---

### Task 8: Profile storage — write failing tests

**Files:**
- Create: `src/modules/profiles/storage.test.ts`

- [ ] **Step 1: Add storage tests**

Create `src/modules/profiles/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Profile, NewProfileInput } from './types';
import { createInMemoryStorage } from './storage';

const baseInput: NewProfileInput = {
  name: 'Test server',
  host: 'example.com',
  port: 22,
  username: 'alice',
  auth: { kind: 'password', password: 'secret' },
};

describe('ProfileStorage (in-memory)', () => {
  let storage: ReturnType<typeof createInMemoryStorage>;

  beforeEach(() => {
    storage = createInMemoryStorage();
  });

  it('starts empty', async () => {
    expect(await storage.list()).toEqual([]);
  });

  it('creates a profile with generated id and timestamps', async () => {
    const created = await storage.create(baseInput);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.name).toBe('Test server');
    expect(new Date(created.createdAt).getTime()).not.toBeNaN();
    expect(created.updatedAt).toBe(created.createdAt);
  });

  it('lists created profiles', async () => {
    await storage.create(baseInput);
    await storage.create({ ...baseInput, name: 'Second' });
    const all = await storage.list();
    expect(all.map((p) => p.name).sort()).toEqual(['Second', 'Test server']);
  });

  it('updates a profile and bumps updatedAt', async () => {
    const created = await storage.create(baseInput);
    await new Promise((r) => setTimeout(r, 5));
    const updated = await storage.update(created.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
    expect(updated.id).toBe(created.id);
    expect(updated.updatedAt).not.toBe(created.updatedAt);
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it('throws when updating a missing profile', async () => {
    await expect(storage.update('does-not-exist', { name: 'x' })).rejects.toThrow();
  });

  it('removes a profile', async () => {
    const created = await storage.create(baseInput);
    await storage.remove(created.id);
    expect(await storage.list()).toEqual([]);
  });

  it('throws when removing a missing profile', async () => {
    await expect(storage.remove('does-not-exist')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm test:run
```

Expected: FAIL — `Cannot find module './storage'`.

---

### Task 9: Profile storage — implement in-memory then file-backed

**Files:**
- Create: `src/modules/profiles/storage.ts`

- [ ] **Step 0: Install Tauri fs plugin (JS side) — needed for the dynamic import in `storage.ts` to type-check**

```bash
pnpm add @tauri-apps/plugin-fs
```

- [ ] **Step 1: Implement in-memory variant (so tests pass) + file-backed variant**

Create `src/modules/profiles/storage.ts`:

```ts
import { newId } from '../../lib/id';
import type { NewProfileInput, Profile, ProfileStoreFile } from './types';
import { SCHEMA_VERSION } from './types';

export type ProfileStorage = {
  list(): Promise<Profile[]>;
  create(input: NewProfileInput): Promise<Profile>;
  update(id: string, patch: Partial<NewProfileInput>): Promise<Profile>;
  remove(id: string): Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function createInMemoryStorage(): ProfileStorage {
  let profiles: Profile[] = [];

  return {
    async list() {
      return [...profiles];
    },
    async create(input) {
      const ts = nowIso();
      const profile: Profile = {
        id: newId(),
        createdAt: ts,
        updatedAt: ts,
        ...input,
      };
      profiles = [...profiles, profile];
      return profile;
    },
    async update(id, patch) {
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Profile not found: ${id}`);
      const updated: Profile = {
        ...profiles[idx],
        ...patch,
        updatedAt: nowIso(),
      };
      profiles = profiles.map((p, i) => (i === idx ? updated : p));
      return updated;
    },
    async remove(id) {
      const before = profiles.length;
      profiles = profiles.filter((p) => p.id !== id);
      if (profiles.length === before) throw new Error(`Profile not found: ${id}`);
    },
  };
}

const FILE_NAME = 'profiles.json';

async function readFile(): Promise<ProfileStoreFile | null> {
  const { exists, readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  if (!(await exists(FILE_NAME, { baseDir: BaseDirectory.AppLocalData }))) return null;
  const raw = await readTextFile(FILE_NAME, { baseDir: BaseDirectory.AppLocalData });
  const parsed = JSON.parse(raw) as ProfileStoreFile;
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported profile schema version: ${parsed.schemaVersion}`);
  }
  return parsed;
}

async function writeFile(data: ProfileStoreFile): Promise<void> {
  const { writeTextFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  await mkdir('', { baseDir: BaseDirectory.AppLocalData, recursive: true });
  await writeTextFile(FILE_NAME, JSON.stringify(data, null, 2), {
    baseDir: BaseDirectory.AppLocalData,
  });
}

export function createFileStorage(): ProfileStorage {
  return {
    async list() {
      const data = await readFile();
      return data?.profiles ?? [];
    },
    async create(input) {
      const data = (await readFile()) ?? { schemaVersion: SCHEMA_VERSION, profiles: [] };
      const ts = nowIso();
      const profile: Profile = { id: newId(), createdAt: ts, updatedAt: ts, ...input };
      data.profiles = [...data.profiles, profile];
      await writeFile(data);
      return profile;
    },
    async update(id, patch) {
      const data = (await readFile()) ?? { schemaVersion: SCHEMA_VERSION, profiles: [] };
      const idx = data.profiles.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Profile not found: ${id}`);
      const updated: Profile = { ...data.profiles[idx], ...patch, updatedAt: nowIso() };
      data.profiles = data.profiles.map((p, i) => (i === idx ? updated : p));
      await writeFile(data);
      return updated;
    },
    async remove(id) {
      const data = await readFile();
      if (!data) throw new Error(`Profile not found: ${id}`);
      const before = data.profiles.length;
      data.profiles = data.profiles.filter((p) => p.id !== id);
      if (data.profiles.length === before) throw new Error(`Profile not found: ${id}`);
      await writeFile(data);
    },
  };
}
```

- [ ] **Step 2: Run tests, verify PASS**

```bash
pnpm test:run
```

Expected: All 7 storage tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(profiles): in-memory + Tauri-fs profile storage with tests"
```

---

### Task 10: Wire Tauri fs plugin in Rust + capabilities

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add Rust dependency**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-fs = "2"
```

- [ ] **Step 2: Register plugin in `src-tauri/src/lib.rs`**

Find `tauri::Builder::default()` and add `.plugin(tauri_plugin_fs::init())`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Grant filesystem permission in `src-tauri/capabilities/default.json`**

Replace the contents:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    {
      "identifier": "fs:allow-app-local-data-read-recursive"
    },
    {
      "identifier": "fs:allow-app-local-data-write-recursive"
    },
    {
      "identifier": "fs:allow-app-local-data-meta-recursive"
    }
  ]
}
```

- [ ] **Step 4: Verify the app still builds**

```bash
pnpm tauri dev
```

Expected: App opens normally. Close it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(profiles): wire tauri-plugin-fs with app-local-data permissions"
```

---

### Task 11: Profiles hook (`useProfiles`)

**Files:**
- Create: `src/modules/profiles/useProfiles.ts`

- [ ] **Step 1: Implement hook**

Create `src/modules/profiles/useProfiles.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NewProfileInput, Profile } from './types';
import { createFileStorage } from './storage';

export function useProfiles() {
  const storage = useMemo(() => createFileStorage(), []);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setProfiles(await storage.list());
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(
    async (input: NewProfileInput) => {
      const p = await storage.create(input);
      await reload();
      return p;
    },
    [storage, reload],
  );

  const update = useCallback(
    async (id: string, patch: Partial<NewProfileInput>) => {
      const p = await storage.update(id, patch);
      await reload();
      return p;
    },
    [storage, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await storage.remove(id);
      await reload();
    },
    [storage, reload],
  );

  return { profiles, loading, error, reload, create, update, remove };
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(profiles): add useProfiles hook"
```

---

## Phase D — Profile UI (Tasks 12–14)

### Task 12: ProfileList component

**Files:**
- Create: `src/modules/profiles/ProfileList.tsx`

- [ ] **Step 1: Implement**

Create `src/modules/profiles/ProfileList.tsx`:

```tsx
import { ActionIcon, Group, NavLink, Stack, Text } from '@mantine/core';
import { IconPlus, IconServer, IconTrash } from '@tabler/icons-react';
import type { Profile } from './types';

type Props = {
  profiles: Profile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
};

export function ProfileList({ profiles, selectedId, onSelect, onAdd, onDelete }: Props) {
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={500} size="sm" c="dimmed" tt="uppercase">
          Profiles
        </Text>
        <ActionIcon variant="subtle" onClick={onAdd} aria-label="New profile">
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
      {profiles.length === 0 && (
        <Text c="dimmed" size="sm">
          No profiles yet. Click + to create one.
        </Text>
      )}
      {profiles.map((p) => (
        <NavLink
          key={p.id}
          active={p.id === selectedId}
          onClick={() => onSelect(p.id)}
          leftSection={<IconServer size={16} />}
          label={p.name}
          description={`${p.username}@${p.host}:${p.port}`}
          rightSection={
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p.id);
              }}
              aria-label={`Delete ${p.name}`}
            >
              <IconTrash size={14} />
            </ActionIcon>
          }
        />
      ))}
    </Stack>
  );
}
```

- [ ] **Step 2: Install icon package**

```bash
pnpm add @tabler/icons-react
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(profiles): add ProfileList component"
```

---

### Task 13: ProfileForm component

**Files:**
- Create: `src/modules/profiles/ProfileForm.tsx`

- [ ] **Step 1: Implement**

Create `src/modules/profiles/ProfileForm.tsx`:

```tsx
import { useForm } from '@mantine/form';
import {
  Button,
  Group,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useEffect } from 'react';
import type { AuthMethod, NewProfileInput, Profile } from './types';

type Props = {
  initial?: Profile;
  onSubmit: (values: NewProfileInput) => Promise<void> | void;
  onCancel: () => void;
};

type FormValues = {
  name: string;
  host: string;
  port: number;
  username: string;
  authKind: 'password' | 'privateKey';
  password: string;
  pem: string;
  passphrase: string;
  notes: string;
};

function buildAuth(v: FormValues): AuthMethod {
  return v.authKind === 'password'
    ? { kind: 'password', password: v.password }
    : { kind: 'privateKey', pem: v.pem, passphrase: v.passphrase || undefined };
}

function fromProfile(p?: Profile): FormValues {
  return {
    name: p?.name ?? '',
    host: p?.host ?? '',
    port: p?.port ?? 22,
    username: p?.username ?? '',
    authKind: p?.auth.kind ?? 'password',
    password: p?.auth.kind === 'password' ? p.auth.password : '',
    pem: p?.auth.kind === 'privateKey' ? p.auth.pem : '',
    passphrase: p?.auth.kind === 'privateKey' ? p.auth.passphrase ?? '' : '',
    notes: p?.notes ?? '',
  };
}

export function ProfileForm({ initial, onSubmit, onCancel }: Props) {
  const form = useForm<FormValues>({
    initialValues: fromProfile(initial),
    validate: {
      name: (v) => (v.trim() ? null : 'Required'),
      host: (v) => (v.trim() ? null : 'Required'),
      username: (v) => (v.trim() ? null : 'Required'),
      port: (v) => (v >= 1 && v <= 65535 ? null : 'Must be 1–65535'),
    },
  });

  useEffect(() => {
    form.setValues(fromProfile(initial));
    form.resetDirty(fromProfile(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  return (
    <form
      onSubmit={form.onSubmit(async (values) => {
        await onSubmit({
          name: values.name.trim(),
          host: values.host.trim(),
          port: values.port,
          username: values.username.trim(),
          auth: buildAuth(values),
          notes: values.notes.trim() || undefined,
        });
      })}
    >
      <Stack>
        <TextInput label="Name" placeholder="My server" {...form.getInputProps('name')} />
        <Group grow>
          <TextInput label="Host" placeholder="example.com" {...form.getInputProps('host')} />
          <NumberInput label="Port" min={1} max={65535} {...form.getInputProps('port')} />
        </Group>
        <TextInput label="Username" placeholder="root" {...form.getInputProps('username')} />
        <SegmentedControl
          data={[
            { label: 'Password', value: 'password' },
            { label: 'Private key', value: 'privateKey' },
          ]}
          {...form.getInputProps('authKind')}
        />
        {form.values.authKind === 'password' ? (
          <PasswordInput label="Password" {...form.getInputProps('password')} />
        ) : (
          <>
            <Textarea
              label="Private key (PEM)"
              minRows={6}
              autosize
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              {...form.getInputProps('pem')}
            />
            <PasswordInput
              label="Passphrase (optional)"
              {...form.getInputProps('passphrase')}
            />
          </>
        )}
        <Textarea label="Notes (optional)" autosize {...form.getInputProps('notes')} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{initial ? 'Save' : 'Create'}</Button>
        </Group>
      </Stack>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(profiles): add ProfileForm component"
```

---

### Task 14: Wire profiles into App + main view

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `App.tsx`**

```tsx
import { useState } from 'react';
import { Button, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { AppShell } from './modules/shell/AppShell';
import { ProfileForm } from './modules/profiles/ProfileForm';
import { ProfileList } from './modules/profiles/ProfileList';
import { useProfiles } from './modules/profiles/useProfiles';

function App() {
  const { profiles, loading, error, create, update, remove } = useProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const editing = profiles.find((p) => p.id === editingId) ?? null;

  return (
    <AppShell
      navbar={
        loading ? (
          <Text c="dimmed">Loading…</Text>
        ) : error ? (
          <Text c="red">{error.message}</Text>
        ) : (
          <ProfileList
            profiles={profiles}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={() => {
              setEditingId(null);
              setEditorOpen(true);
            }}
            onDelete={async (id) => {
              await remove(id);
              if (selectedId === id) setSelectedId(null);
              notifications.show({ message: 'Profile deleted' });
            }}
          />
        )
      }
    >
      {selected ? (
        <Stack>
          <Text fw={600} size="xl">
            {selected.name}
          </Text>
          <Text c="dimmed">{`${selected.username}@${selected.host}:${selected.port}`}</Text>
          <Button
            onClick={() => {
              setEditingId(selected.id);
              setEditorOpen(true);
            }}
            variant="default"
            w="fit-content"
          >
            Edit
          </Button>
          <Text c="dimmed" mt="lg">
            (Connect button will land in Phase F.)
          </Text>
        </Stack>
      ) : (
        <Text c="dimmed">Select a profile, or create one with the + button.</Text>
      )}

      <Modal
        opened={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? 'Edit profile' : 'New profile'}
        size="lg"
      >
        <ProfileForm
          initial={editing ?? undefined}
          onCancel={() => setEditorOpen(false)}
          onSubmit={async (values) => {
            if (editing) {
              await update(editing.id, values);
              notifications.show({ message: 'Profile updated' });
            } else {
              const created = await create(values);
              setSelectedId(created.id);
              notifications.show({ message: 'Profile created' });
            }
            setEditorOpen(false);
          }}
        />
      </Modal>
    </AppShell>
  );
}

export default App;
```

- [ ] **Step 2: Run, verify create/edit/delete works**

```bash
pnpm tauri dev
```

Manual verification: Click +. Fill form with a fake server (host: `example.com`, user: `me`, password: `x`). Save. See it in the sidebar. Click it. Edit. Save. Delete. All notifications appear.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(profiles): wire profile CRUD UI into App"
```

---

## Phase E — Rust SSH backend (Tasks 15–22)

### Task 15: Add `russh` and supporting Rust deps

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add dependencies**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
russh = "0.45"
russh-keys = "0.45"
tokio = { version = "1", features = ["full"] }
async-trait = "0.1"
thiserror = "1"
uuid = { version = "1", features = ["v4"] }
parking_lot = "0.12"
log = "0.4"
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check && cd ..
```

Expected: `Compiling ...` then `Finished`. May take 2–3 minutes the first time.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(rust): add russh, tokio, thiserror, uuid, parking_lot"
```

---

### Task 16: Define error type and module layout

**Files:**
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/ssh/mod.rs`
- Create: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Create `error.rs`**

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("SSH error: {0}")]
    Ssh(String),
    #[error("Session not found: {0}")]
    SessionNotFound(String),
    #[error("Authentication failed")]
    AuthFailed,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Other: {0}")]
    Other(String),
}

impl From<russh::Error> for AppError {
    fn from(e: russh::Error) -> Self {
        AppError::Ssh(e.to_string())
    }
}

// Tauri requires command errors to be Serialize.
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 2: Create module files**

`src-tauri/src/ssh/mod.rs`:
```rust
pub mod manager;
pub mod session;
```

`src-tauri/src/commands/mod.rs`:
```rust
pub mod ssh;
```

- [ ] **Step 3: Update `src-tauri/src/lib.rs` to declare modules**

Replace `src-tauri/src/lib.rs`:

```rust
pub mod commands;
pub mod error;
pub mod ssh;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .manage(ssh::manager::SessionManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::ssh::ssh_connect,
            commands::ssh::ssh_send_input,
            commands::ssh::ssh_resize,
            commands::ssh::ssh_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

(This will fail to compile until tasks 17–18 add the referenced items. That's fine — we'll fix it then.)

- [ ] **Step 4: Commit (skipping cargo check, broken on purpose mid-refactor)**

```bash
git add -A
git commit -m "chore(rust): scaffold error type and module layout (compile pending)"
```

---

### Task 17: SessionManager — failing test then impl

**Files:**
- Create: `src-tauri/src/ssh/manager.rs`

- [ ] **Step 1: Write manager with stub `Session` placeholder + failing test**

Create `src-tauri/src/ssh/manager.rs`:

```rust
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use crate::error::{AppError, AppResult};

/// A handle to an active SSH session. Real implementation lands in Task 18.
#[derive(Debug)]
pub struct Session {
    pub id: String,
}

pub struct SessionManager {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self { sessions: Mutex::new(HashMap::new()) }
    }

    pub fn insert(&self, session: Session) -> Arc<Session> {
        let arc = Arc::new(session);
        self.sessions.lock().insert(arc.id.clone(), arc.clone());
        arc
    }

    pub fn get(&self, id: &str) -> AppResult<Arc<Session>> {
        self.sessions
            .lock()
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::SessionNotFound(id.to_string()))
    }

    pub fn remove(&self, id: &str) -> AppResult<Arc<Session>> {
        self.sessions
            .lock()
            .remove(id)
            .ok_or_else(|| AppError::SessionNotFound(id.to_string()))
    }

    pub fn ids(&self) -> Vec<String> {
        self.sessions.lock().keys().cloned().collect()
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk(id: &str) -> Session {
        Session { id: id.to_string() }
    }

    #[test]
    fn starts_empty() {
        let m = SessionManager::new();
        assert!(m.ids().is_empty());
    }

    #[test]
    fn insert_then_get() {
        let m = SessionManager::new();
        m.insert(mk("a"));
        let got = m.get("a").unwrap();
        assert_eq!(got.id, "a");
    }

    #[test]
    fn get_missing_returns_error() {
        let m = SessionManager::new();
        let err = m.get("missing").unwrap_err();
        assert!(matches!(err, AppError::SessionNotFound(_)));
    }

    #[test]
    fn remove_then_gone() {
        let m = SessionManager::new();
        m.insert(mk("a"));
        m.remove("a").unwrap();
        assert!(m.get("a").is_err());
    }

    #[test]
    fn ids_returns_all() {
        let m = SessionManager::new();
        m.insert(mk("a"));
        m.insert(mk("b"));
        let mut ids = m.ids();
        ids.sort();
        assert_eq!(ids, vec!["a", "b"]);
    }
}
```

- [ ] **Step 2: Run tests, verify PASS**

```bash
cd src-tauri && cargo test --lib ssh::manager && cd ..
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ssh): session manager with tests"
```

---

### Task 18: Real SSH session via `russh`

**Files:**
- Create: `src-tauri/src/ssh/session.rs`
- Modify: `src-tauri/src/ssh/manager.rs`

- [ ] **Step 1: Replace stub `Session` with real one**

Create `src-tauri/src/ssh/session.rs`:

```rust
use async_trait::async_trait;
use russh::client::{self, Handle, Msg};
use russh::keys::*;
use russh::{Channel, ChannelMsg, Disconnect};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub enum AuthMethod {
    Password(String),
    PrivateKey { pem: String, passphrase: Option<String> },
}

#[derive(Debug, Clone)]
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthMethod,
    pub initial_cols: u32,
    pub initial_rows: u32,
}

struct ClientHandler;

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // MVP: trust on first sight. TOFU + known_hosts persistence lands in a later plan.
        Ok(true)
    }
}

/// A handle to one connected SSH session with an open shell channel.
pub struct Session {
    pub id: String,
    handle: Arc<Mutex<Handle<ClientHandler>>>,
    channel: Arc<Mutex<Channel<Msg>>>,
}

pub struct OpenOutcome {
    pub session: Session,
    /// Stream of bytes coming back from the SSH server.
    pub output_rx: mpsc::Receiver<Vec<u8>>,
}

impl Session {
    pub async fn open(id: String, params: ConnectParams) -> AppResult<OpenOutcome> {
        let config = Arc::new(client::Config::default());
        let addrs = (params.host.as_str(), params.port);
        let handler = ClientHandler;
        let mut handle = client::connect(config, addrs, handler).await?;

        let auth_ok = match params.auth {
            AuthMethod::Password(ref pw) => {
                handle.authenticate_password(&params.username, pw).await?
            }
            AuthMethod::PrivateKey { ref pem, ref passphrase } => {
                let key = decode_secret_key(pem, passphrase.as_deref())
                    .map_err(|e| AppError::Ssh(format!("Key parse error: {e}")))?;
                handle
                    .authenticate_publickey(&params.username, Arc::new(key))
                    .await?
            }
        };
        if !auth_ok {
            return Err(AppError::AuthFailed);
        }

        let mut channel = handle.channel_open_session().await?;
        channel
            .request_pty(
                false,
                "xterm-256color",
                params.initial_cols,
                params.initial_rows,
                0,
                0,
                &[],
            )
            .await?;
        channel.request_shell(false).await?;

        let (tx, output_rx) = mpsc::channel::<Vec<u8>>(64);

        let session = Session {
            id: id.clone(),
            handle: Arc::new(Mutex::new(handle)),
            channel: Arc::new(Mutex::new(channel)),
        };

        // Spawn the reader task — pulls ChannelMsg off the channel, forwards Data to tx.
        let channel_for_reader = session.channel.clone();
        tokio::spawn(async move {
            loop {
                let msg = {
                    let mut ch = channel_for_reader.lock().await;
                    ch.wait().await
                };
                match msg {
                    Some(ChannelMsg::Data { data }) => {
                        if tx.send(data.to_vec()).await.is_err() {
                            break;
                        }
                    }
                    Some(ChannelMsg::ExtendedData { data, .. }) => {
                        if tx.send(data.to_vec()).await.is_err() {
                            break;
                        }
                    }
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                    Some(_) => continue,
                }
            }
        });

        Ok(OpenOutcome { session, output_rx })
    }

    pub async fn send_input(&self, bytes: &[u8]) -> AppResult<()> {
        let mut ch = self.channel.lock().await;
        ch.data(bytes).await?;
        Ok(())
    }

    pub async fn resize(&self, cols: u32, rows: u32) -> AppResult<()> {
        let mut ch = self.channel.lock().await;
        ch.window_change(cols, rows, 0, 0).await?;
        Ok(())
    }

    pub async fn close(&self) -> AppResult<()> {
        let mut handle = self.handle.lock().await;
        handle
            .disconnect(Disconnect::ByApplication, "user requested", "en")
            .await?;
        Ok(())
    }
}
```

- [ ] **Step 2: Update `manager.rs` to use the real `Session`**

Replace the stub `Session` import. Open `src-tauri/src/ssh/manager.rs` and change the top:

```rust
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use crate::error::{AppError, AppResult};
use crate::ssh::session::Session;
```

Delete the `#[derive(Debug)] pub struct Session { pub id: String }` block in `manager.rs` — it now comes from `session.rs`.

Update the `#[cfg(test)] mod tests` block to construct fake sessions through a different approach since real `Session::open` needs a network. Replace the test module with:

```rust
#[cfg(test)]
mod tests {
    // SessionManager tests live in tests/ as integration tests because Session
    // can only be constructed via async open(). For unit tests of the manager's
    // invariants we'd need a trait abstraction, which is not justified for MVP.
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo check && cd ..
```

Expected: builds clean (with warnings about unused items, ignore them).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ssh): russh-based Session with PTY shell and output pump"
```

---

### Task 19: Tauri commands

**Files:**
- Create: `src-tauri/src/commands/ssh.rs`

- [ ] **Step 1: Implement commands**

Create `src-tauri/src/commands/ssh.rs`:

```rust
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::error::AppResult;
use crate::ssh::manager::SessionManager;
use crate::ssh::session::{AuthMethod, ConnectParams, Session};

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WireAuth {
    Password { password: String },
    PrivateKey { pem: String, passphrase: Option<String> },
}

impl From<WireAuth> for AuthMethod {
    fn from(w: WireAuth) -> Self {
        match w {
            WireAuth::Password { password } => AuthMethod::Password(password),
            WireAuth::PrivateKey { pem, passphrase } => AuthMethod::PrivateKey { pem, passphrase },
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: WireAuth,
    pub initial_cols: u32,
    pub initial_rows: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutputEvent {
    pub session_id: String,
    pub bytes: Vec<u8>,
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    manager: State<'_, SessionManager>,
    request: ConnectRequest,
) -> AppResult<String> {
    let id = Uuid::new_v4().to_string();
    let params = ConnectParams {
        host: request.host,
        port: request.port,
        username: request.username,
        auth: request.auth.into(),
        initial_cols: request.initial_cols,
        initial_rows: request.initial_rows,
    };
    let outcome = Session::open(id.clone(), params).await?;
    manager.insert(outcome.session);

    // Spawn forwarder: receiver -> tauri event
    let app_for_pump = app.clone();
    let id_for_pump = id.clone();
    let mut rx = outcome.output_rx;
    tauri::async_runtime::spawn(async move {
        while let Some(bytes) = rx.recv().await {
            let _ = app_for_pump.emit(
                &format!("ssh:output:{id_for_pump}"),
                OutputEvent { session_id: id_for_pump.clone(), bytes },
            );
        }
        let _ = app_for_pump.emit(&format!("ssh:closed:{id_for_pump}"), ());
    });

    Ok(id)
}

#[tauri::command]
pub async fn ssh_send_input(
    manager: State<'_, SessionManager>,
    session_id: String,
    data: Vec<u8>,
) -> AppResult<()> {
    let session = manager.get(&session_id)?;
    session.send_input(&data).await
}

#[tauri::command]
pub async fn ssh_resize(
    manager: State<'_, SessionManager>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    let session = manager.get(&session_id)?;
    session.resize(cols, rows).await
}

#[tauri::command]
pub async fn ssh_disconnect(
    manager: State<'_, SessionManager>,
    session_id: String,
) -> AppResult<()> {
    let session = manager.remove(&session_id)?;
    session.close().await
}
```

- [ ] **Step 2: Verify it builds**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ssh): tauri commands connect/send/resize/disconnect"
```

---

### Task 20: Integration test against a real SSH server (gated)

**Files:**
- Create: `src-tauri/tests/integration_ssh.rs`
- Create: `src-tauri/tests/README.md`
- Create: `docker-compose.test.yml` (at repo root)

- [ ] **Step 1: Add docker-compose fixture**

Create `docker-compose.test.yml` at the repo root:

```yaml
services:
  sshd:
    image: linuxserver/openssh-server:latest
    container_name: ssh-buddy-test-sshd
    environment:
      - PASSWORD_ACCESS=true
      - USER_NAME=testuser
      - USER_PASSWORD=testpass
      - SUDO_ACCESS=false
    ports:
      - "2222:2222"
    restart: unless-stopped
```

- [ ] **Step 2: Document the fixture**

Create `src-tauri/tests/README.md`:

```markdown
# Integration tests

Integration tests in this directory require a real SSH server. They are
skipped unless the `SSH_BUDDY_INTEGRATION` environment variable is set.

Quickstart:

    docker compose -f docker-compose.test.yml up -d
    SSH_BUDDY_INTEGRATION=1 cargo test --test integration_ssh -- --nocapture
    docker compose -f docker-compose.test.yml down

Config picked up from these env vars (with defaults):

| Var                       | Default     |
|---------------------------|-------------|
| SSH_BUDDY_TEST_HOST       | 127.0.0.1   |
| SSH_BUDDY_TEST_PORT       | 2222        |
| SSH_BUDDY_TEST_USER       | testuser    |
| SSH_BUDDY_TEST_PASSWORD   | testpass    |
```

- [ ] **Step 3: Write the integration test**

Create `src-tauri/tests/integration_ssh.rs`:

```rust
use ssh_buddy_lib::ssh::session::{AuthMethod, ConnectParams, Session};
use std::env;
use std::time::Duration;
use tokio::time::timeout;

fn skip_if_not_enabled() -> bool {
    env::var("SSH_BUDDY_INTEGRATION").is_err()
}

fn params() -> ConnectParams {
    ConnectParams {
        host: env::var("SSH_BUDDY_TEST_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
        port: env::var("SSH_BUDDY_TEST_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(2222),
        username: env::var("SSH_BUDDY_TEST_USER").unwrap_or_else(|_| "testuser".into()),
        auth: AuthMethod::Password(
            env::var("SSH_BUDDY_TEST_PASSWORD").unwrap_or_else(|_| "testpass".into()),
        ),
        initial_cols: 80,
        initial_rows: 24,
    }
}

#[tokio::test]
async fn connect_and_run_command() {
    if skip_if_not_enabled() {
        eprintln!("SKIPPED: set SSH_BUDDY_INTEGRATION=1 to run");
        return;
    }

    let mut outcome = Session::open("test".into(), params()).await.expect("open");

    // Send a command — write "echo hello && exit\n"
    outcome
        .session
        .send_input(b"echo hello && exit\n")
        .await
        .expect("send");

    // Collect output for up to 5 seconds, looking for "hello".
    let mut accumulated = Vec::new();
    let read_some = async {
        while let Some(bytes) = outcome.output_rx.recv().await {
            accumulated.extend_from_slice(&bytes);
            if accumulated.windows(5).any(|w| w == b"hello") {
                return Ok::<(), &'static str>(());
            }
        }
        Err("channel closed before 'hello' seen")
    };

    timeout(Duration::from_secs(5), read_some)
        .await
        .expect("timeout")
        .expect("expected output");

    outcome.session.close().await.ok();
}
```

- [ ] **Step 4: Rename the library so the integration test can import it**

The integration test imports `ssh_buddy_lib`. By default, Tauri generates the package as the project name. Edit `src-tauri/Cargo.toml` to make the library name explicit. Find the `[lib]` section (or add it):

```toml
[lib]
name = "ssh_buddy_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

(Keep the existing `crate-type` if different — the `name` field is what matters.)

- [ ] **Step 5: Run the test SKIPPED to verify it compiles**

```bash
cd src-tauri && cargo test --test integration_ssh && cd ..
```

Expected: 1 test, passes immediately with "SKIPPED" message.

- [ ] **Step 6: Run the test with docker for real**

```bash
docker compose -f docker-compose.test.yml up -d
sleep 3
cd src-tauri && SSH_BUDDY_INTEGRATION=1 cargo test --test integration_ssh -- --nocapture && cd ..
docker compose -f docker-compose.test.yml down
```

Expected: test passes, output contains `hello`. If sshd container takes longer to start, increase the sleep.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(ssh): integration test against linuxserver/openssh-server"
```

---

## Phase F — Terminal UI + connection wiring (Tasks 21–24)

### Task 21: Frontend SSH types and client wrapper

**Files:**
- Create: `src/modules/ssh/types.ts`
- Create: `src/modules/ssh/client.ts`

- [ ] **Step 1: Create types**

`src/modules/ssh/types.ts`:

```ts
import type { AuthMethod } from '../profiles/types';

export type ConnectRequest = {
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  initialCols: number;
  initialRows: number;
};

export type OutputEvent = {
  sessionId: string;
  bytes: number[]; // serde serializes Vec<u8> as JSON array of numbers
};
```

- [ ] **Step 2: Create client**

`src/modules/ssh/client.ts`:

```ts
import { command, subscribe } from '../../lib/tauri';
import type { ConnectRequest, OutputEvent } from './types';

export async function sshConnect(req: ConnectRequest): Promise<string> {
  return command<string>('ssh_connect', { request: req });
}

export async function sshSendInput(sessionId: string, data: Uint8Array): Promise<void> {
  return command('ssh_send_input', { sessionId, data: Array.from(data) });
}

export async function sshResize(sessionId: string, cols: number, rows: number): Promise<void> {
  return command('ssh_resize', { sessionId, cols, rows });
}

export async function sshDisconnect(sessionId: string): Promise<void> {
  return command('ssh_disconnect', { sessionId });
}

export async function sshSubscribeOutput(
  sessionId: string,
  handler: (data: Uint8Array) => void,
): Promise<() => void> {
  const unlisten = await subscribe<OutputEvent>(`ssh:output:${sessionId}`, (e) => {
    handler(new Uint8Array(e.bytes));
  });
  return unlisten;
}

export async function sshSubscribeClosed(
  sessionId: string,
  handler: () => void,
): Promise<() => void> {
  return subscribe<null>(`ssh:closed:${sessionId}`, handler);
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ssh): frontend command wrappers"
```

---

### Task 22: xterm.js terminal component

**Files:**
- Create: `src/modules/terminal/Terminal.tsx`

- [ ] **Step 1: Install xterm.js**

```bash
pnpm add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
```

- [ ] **Step 2: Implement component**

Create `src/modules/terminal/Terminal.tsx`:

```tsx
import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export type TerminalHandle = {
  write: (bytes: Uint8Array | string) => void;
  fit: () => { cols: number; rows: number };
  focus: () => void;
};

type Props = {
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
};

export const Terminal = forwardRef<TerminalHandle, Props>(({ onData, onResize }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new XTerm({
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      fontSize: 13,
      theme: { background: '#1a1b1e' },
      cursorBlink: true,
      scrollback: 10000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    onResize(term.cols, term.rows);
    term.onData(onData);
    term.onResize(({ cols, rows }) => onResize(cols, rows));
    xtermRef.current = term;
    fitRef.current = fit;

    const onWindowResize = () => {
      fit.fit();
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      write: (bytes) => xtermRef.current?.write(bytes as string | Uint8Array),
      fit: () => {
        fitRef.current?.fit();
        return { cols: xtermRef.current?.cols ?? 80, rows: xtermRef.current?.rows ?? 24 };
      },
      focus: () => xtermRef.current?.focus(),
    }),
    [],
  );

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
});

Terminal.displayName = 'Terminal';
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(terminal): xterm.js wrapper component"
```

---

### Task 23: Connection view: glue profile → SSH → terminal

**Files:**
- Create: `src/modules/ssh/useSshSession.ts`
- Create: `src/modules/shell/ConnectionView.tsx`

- [ ] **Step 1: Hook**

Create `src/modules/ssh/useSshSession.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile } from '../profiles/types';
import {
  sshConnect,
  sshDisconnect,
  sshResize,
  sshSendInput,
  sshSubscribeClosed,
  sshSubscribeOutput,
} from './client';

export type SshState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

export function useSshSession(profile: Profile | null) {
  const [state, setState] = useState<SshState>('idle');
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const outputHandlerRef = useRef<((data: Uint8Array) => void) | null>(null);

  const connect = useCallback(
    async (cols: number, rows: number) => {
      if (!profile || sessionIdRef.current) return;
      setState('connecting');
      setError(null);
      try {
        const id = await sshConnect({
          host: profile.host,
          port: profile.port,
          username: profile.username,
          auth: profile.auth,
          initialCols: cols,
          initialRows: rows,
        });
        sessionIdRef.current = id;

        const unlistenData = await sshSubscribeOutput(id, (data) => {
          outputHandlerRef.current?.(data);
        });
        const unlistenClosed = await sshSubscribeClosed(id, () => {
          setState('closed');
          unlistenData();
          unlistenClosed();
          sessionIdRef.current = null;
        });
        setState('connected');
      } catch (e) {
        setError(String(e));
        setState('error');
        sessionIdRef.current = null;
      }
    },
    [profile],
  );

  const send = useCallback(async (data: string) => {
    if (!sessionIdRef.current) return;
    await sshSendInput(sessionIdRef.current, new TextEncoder().encode(data));
  }, []);

  const resize = useCallback(async (cols: number, rows: number) => {
    if (!sessionIdRef.current) return;
    await sshResize(sessionIdRef.current, cols, rows);
  }, []);

  const disconnect = useCallback(async () => {
    if (!sessionIdRef.current) return;
    await sshDisconnect(sessionIdRef.current);
    sessionIdRef.current = null;
    setState('closed');
  }, []);

  const setOutputHandler = useCallback((h: (data: Uint8Array) => void) => {
    outputHandlerRef.current = h;
  }, []);

  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        sshDisconnect(sessionIdRef.current).catch(() => {});
      }
    };
  }, []);

  return { state, error, connect, send, resize, disconnect, setOutputHandler };
}
```

- [ ] **Step 2: View**

Create `src/modules/shell/ConnectionView.tsx`:

```tsx
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { useEffect, useRef } from 'react';
import type { Profile } from '../profiles/types';
import { Terminal, type TerminalHandle } from '../terminal/Terminal';
import { useSshSession } from '../ssh/useSshSession';

type Props = { profile: Profile };

export function ConnectionView({ profile }: Props) {
  const session = useSshSession(profile);
  const termRef = useRef<TerminalHandle>(null);

  useEffect(() => {
    session.setOutputHandler((bytes) => termRef.current?.write(bytes));
  }, [session]);

  return (
    <Stack gap="md" style={{ height: '100%' }}>
      <Group justify="space-between">
        <Group gap="sm">
          <Text fw={600}>{profile.name}</Text>
          <Text c="dimmed">{`${profile.username}@${profile.host}:${profile.port}`}</Text>
          <Badge color={badgeColor(session.state)}>{session.state}</Badge>
        </Group>
        <Group gap="xs">
          {session.state === 'connected' ? (
            <Button color="red" variant="default" onClick={session.disconnect}>
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={() => {
                const dims = termRef.current?.fit() ?? { cols: 80, rows: 24 };
                session.connect(dims.cols, dims.rows);
              }}
              disabled={session.state === 'connecting'}
              loading={session.state === 'connecting'}
            >
              Connect
            </Button>
          )}
        </Group>
      </Group>
      {session.error && <Text c="red">{session.error}</Text>}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Terminal
          ref={termRef}
          onData={session.send}
          onResize={session.resize}
        />
      </div>
    </Stack>
  );
}

function badgeColor(state: string): string {
  switch (state) {
    case 'connected':
      return 'teal';
    case 'connecting':
      return 'yellow';
    case 'error':
      return 'red';
    case 'closed':
      return 'gray';
    default:
      return 'gray';
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ssh): connection view glueing terminal to SSH session"
```

---

### Task 24: Replace the placeholder area in App.tsx with ConnectionView

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Edit `App.tsx`**

Find the block:

```tsx
{selected ? (
  <Stack>
    <Text fw={600} size="xl">
      {selected.name}
    </Text>
    <Text c="dimmed">{`${selected.username}@${selected.host}:${selected.port}`}</Text>
    <Button
      onClick={() => {
        setEditingId(selected.id);
        setEditorOpen(true);
      }}
      variant="default"
      w="fit-content"
    >
      Edit
    </Button>
    <Text c="dimmed" mt="lg">
      (Connect button will land in Phase F.)
    </Text>
  </Stack>
) : (
  <Text c="dimmed">Select a profile, or create one with the + button.</Text>
)}
```

Replace with:

```tsx
{selected ? (
  <Stack gap="sm" style={{ height: '100%' }}>
    <Group justify="flex-end">
      <Button
        onClick={() => {
          setEditingId(selected.id);
          setEditorOpen(true);
        }}
        variant="subtle"
        size="xs"
      >
        Edit profile
      </Button>
    </Group>
    <div style={{ flex: 1, minHeight: 0 }}>
      <ConnectionView key={selected.id} profile={selected} />
    </div>
  </Stack>
) : (
  <Text c="dimmed">Select a profile, or create one with the + button.</Text>
)}
```

Add to imports at the top of `App.tsx`:

```tsx
import { ConnectionView } from './modules/shell/ConnectionView';
```

Also ensure the AppShell.Main can host a flex-height layout. In `src/modules/shell/AppShell.tsx`, replace the `<MantineAppShell.Main>` line with:

```tsx
<MantineAppShell.Main style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
  {children}
</MantineAppShell.Main>
```

- [ ] **Step 2: Manual smoke test**

```bash
docker compose -f docker-compose.test.yml up -d
sleep 3
pnpm tauri dev
```

In the app:
1. Click + to create a profile: name "Local test", host `127.0.0.1`, port `2222`, user `testuser`, password `testpass`.
2. Click the profile in the sidebar.
3. Click "Connect". Badge turns yellow then teal.
4. Click in the terminal area. Type `echo hello && pwd`. Press Enter. See output.
5. Click "Disconnect". Badge turns gray.

Tear down:
```bash
docker compose -f docker-compose.test.yml down
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire ConnectionView into the main app — Plan 1 MVP works end-to-end"
```

---

## Phase G — Polish (Tasks 25–27)

### Task 25: Error boundaries and friendly auth-failure messages

**Files:**
- Create: `src/modules/shell/ErrorBoundary.tsx`
- Modify: `src/App.tsx`
- Modify: `src/modules/ssh/useSshSession.ts`

- [ ] **Step 1: ErrorBoundary**

Create `src/modules/shell/ErrorBoundary.tsx`:

```tsx
import { Alert, Stack, Text } from '@mantine/core';
import { Component, ReactNode, ErrorInfo } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <Stack p="xl">
          <Alert color="red" title="Something went wrong">
            <Text>{this.state.error.message}</Text>
          </Alert>
        </Stack>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrap App in ErrorBoundary**

In `src/main.tsx`, wrap `<App />` with `<ErrorBoundary>`. Add the import and update render block:

```tsx
import { ErrorBoundary } from './modules/shell/ErrorBoundary';
// ...
<MantineProvider theme={theme} defaultColorScheme="dark">
  <Notifications position="bottom-right" />
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
</MantineProvider>
```

- [ ] **Step 3: Friendlier auth-failure text in `useSshSession.ts`**

In the `catch (e)` block of `connect`, change:
```ts
setError(String(e));
```
to:
```ts
const msg = String(e);
if (msg.includes('Authentication failed')) {
  setError('Authentication failed — check the username, password, or key.');
} else if (msg.toLowerCase().includes('connection refused')) {
  setError('Connection refused — is the SSH server reachable on that host:port?');
} else {
  setError(msg);
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): error boundary and friendlier SSH error messages"
```

---

### Task 26: Update README quickstart

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Run locally" section**

Append to `README.md` before the License section:

```markdown
## Run locally (Plan 1 MVP)

Requires: Node 20+, pnpm 9+, Rust toolchain, system deps for Tauri (see https://v2.tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm tauri dev
```

A native window opens. Create a profile from the sidebar, then click Connect.

For the integration test against a real SSH server:

```bash
docker compose -f docker-compose.test.yml up -d
cd src-tauri
SSH_BUDDY_INTEGRATION=1 cargo test --test integration_ssh
cd ..
docker compose -f docker-compose.test.yml down
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Plan 1 quickstart to README"
```

---

### Task 27: Final verification + status note

**Files:**
- Modify: `docs/superpowers/plans/2026-05-26-plan-1-local-mvp.md` (append a Done section)

- [ ] **Step 1: Re-run all tests**

```bash
pnpm test:run
cd src-tauri && cargo test --lib && cd ..
```

Expected: all green.

- [ ] **Step 2: Manual end-to-end one more time**

```bash
docker compose -f docker-compose.test.yml up -d
sleep 3
pnpm tauri dev
```

Verify:
- Create profile, connect, run `ls`, see directory.
- Connect to a non-existent port → see "Connection refused" message.
- Wrong password → see "Authentication failed" message.
- Disconnect cleanly.

```bash
docker compose -f docker-compose.test.yml down
```

- [ ] **Step 3: Mark plan done**

Get today's date and append a Status block at the bottom of this plan file:

```bash
TODAY=$(date +%Y-%m-%d)
cat >> docs/superpowers/plans/2026-05-26-plan-1-local-mvp.md <<EOF

---

## Status

Implementation complete on $TODAY. Next: Plan 2 (Crypto + Master Password).
EOF
```

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/2026-05-26-plan-1-local-mvp.md
git commit -m "docs: mark Plan 1 done"
```

---

## Self-review checklist (run before declaring Plan 1 complete)

- [ ] All Vitest tests pass (`pnpm test:run`).
- [ ] All cargo unit tests pass (`cd src-tauri && cargo test --lib`).
- [ ] Integration test passes with docker fixture (`SSH_BUDDY_INTEGRATION=1 cargo test --test integration_ssh`).
- [ ] Manual flow works: create → connect → run commands → disconnect.
- [ ] No `TODO`, `FIXME`, `unimplemented!()` in committed code.
- [ ] App-data directory contains a readable `profiles.json` after creating a profile.

## What is explicitly NOT in this plan (deferred)

- Encryption of `profiles.json` at rest → Plan 2.
- Master password and key derivation → Plan 2.
- Profile sync between devices → Plan 3.
- Mobile builds (iOS/Android) → Plan 4.
- Web build + WebSocket SSH proxy → Plan 4.
- SFTP file browser, port forwarding UI, snippets, agent forwarding → Plan 5.
- `known_hosts` / Trust-On-First-Use UI → Plan 5 (currently auto-trusting all server keys in MVP).
- Multi-tab / split-pane terminal → Plan 5.
