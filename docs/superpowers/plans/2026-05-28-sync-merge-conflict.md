# Sync Merge / Conflict / History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix multi-device sync so deletions propagate, connection-history no longer corrupts the merge, and genuine conflicts surface in a 3-button modal instead of silently overwriting.

**Architecture:** Conflict detection uses a local `dirty` flag plus PocketBase's built-in `updated` server-timestamp as an opaque version token (no revision counters). A pure `planMerge` function emits per-profile actions (take-remote / push / conflict). Deletions become tombstones (`deletedAt` in the encrypted blob). Connection history becomes an append-only event log, union-merged independently of content, gated by a synced settings singleton.

**Tech Stack:** TypeScript, React, Mantine, Vitest, Tauri (fs plugin), PocketBase (JS SDK), libsodium (XChaCha20-Poly1305).

**Verification note:** This project does NOT use browser/playwright tests. Verify logic with `npm run test:run` and integration/UI tasks with `npm run lint` (tsc --noEmit) and `npm run build`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/modules/profiles/types.ts` | Add `deletedAt`, `history`, `ConnectionEvent`; remove `lastConnectedAt`/`lastErrorCategory`/`lastHostKeyFingerprint` |
| `src/modules/profiles/connectionHistory.ts` (new) | Pure helpers: `makeEvent`, `unionHistory`, `pruneHistory` |
| `src/modules/profiles/storage.ts` | Soft-delete (tombstone), `list` excludes deleted, new `listAll`, `appendHistoryEvent` |
| `src/modules/sync/syncMeta.ts` (new) | Local dirty/token map (Tauri file + browser localStorage) |
| `src/modules/sync/planMerge.ts` (new) | Pure merge planner → `MergeAction[]` |
| `src/modules/sync/syncEngine.ts` | Wire planMerge, push, tombstone purge, echo filter, conflict collection, device-name lookup |
| `src/modules/sync/useSync.ts` | Expose `conflicts` + `resolveConflict` |
| `src/modules/sync/SyncConflictModal.tsx` (new) | Queue modal, field diff, 3 buttons |
| `src/modules/settings/settings.ts` (new) | `SyncSettings` type + encrypted singleton sync |
| `src/modules/shell/ConnectionView.tsx` | Append events instead of bumping the profile |
| `src/modules/shell/Workspace.tsx` | Pass an `appendHistory(profileId, event)` callback instead of `onUpdateHistory` |
| `src/modules/auth/AccountModal.tsx` | Settings toggle UI |
| `src/modules/profiles/ProfileForm.tsx` | History display section |
| `src/App.tsx` | Mount conflict modal, wire history append + settings |
| `backend/pocketbase/pb_migrations/20260528120000_sync_settings_and_optional_revision.js` (new) | `client_revision` optional, new `settings` collection |

---

## Task 1: Profile type — tombstone, history, ConnectionEvent

**Files:**
- Modify: `src/modules/profiles/types.ts`

- [ ] **Step 1: Edit the types**

In `src/modules/profiles/types.ts`, add the `ConnectionEvent` type and update `Profile`. Replace the `lastConnectedAt`/`lastHostKeyFingerprint`/`lastErrorCategory` block:

```ts
export type ConnectionEvent = {
  id: string;
  at: string; // ISO timestamp
  outcome: 'connected' | 'error';
  errorCategory?: string;
  hostKeyFingerprint?: string;
  deviceId: string;
};

export type Profile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  notes?: string;
  color?: string;
  tags?: string[];
  snippets?: Snippet[];
  envVars?: Record<string, string>;
  jumpHostId?: string | null;
  // Append-only connection log (union-merged, not part of conflict logic)
  history?: ConnectionEvent[];
  // Tombstone: when set, the profile is deleted but still syncs
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

`NewProfileInput`, `SCHEMA_VERSION`, and `ProfileStoreFile` stay unchanged (`history`/`deletedAt` are optional, so `Omit<Profile,'id'|'createdAt'|'updatedAt'>` still works).

- [ ] **Step 2: Verify it compiles (will reveal call sites to fix in later tasks)**

Run: `npm run lint`
Expected: Errors ONLY in `ConnectionView.tsx`, `Workspace.tsx`, and `App.tsx` (they reference the removed `last*` fields). No errors in `types.ts` itself. These call sites are fixed in Tasks 9–11.

- [ ] **Step 3: Commit**

```bash
git add src/modules/profiles/types.ts
git commit -m "feat(profiles): add connection history and tombstone fields to Profile"
```

---

## Task 2: Connection-history pure helpers

**Files:**
- Create: `src/modules/profiles/connectionHistory.ts`
- Test: `src/modules/profiles/connectionHistory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/modules/profiles/connectionHistory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeEvent, unionHistory, pruneHistory } from './connectionHistory';
import type { ConnectionEvent } from './types';

const ev = (id: string, at: string): ConnectionEvent => ({
  id, at, outcome: 'connected', deviceId: 'dev-1',
});

describe('unionHistory', () => {
  it('dedupes by id and sorts newest first', () => {
    const a = [ev('1', '2026-01-01T00:00:00.000Z'), ev('2', '2026-01-03T00:00:00.000Z')];
    const b = [ev('2', '2026-01-03T00:00:00.000Z'), ev('3', '2026-01-02T00:00:00.000Z')];
    const out = unionHistory(a, b);
    expect(out.map((e) => e.id)).toEqual(['2', '3', '1']);
  });

  it('handles undefined inputs', () => {
    expect(unionHistory(undefined, undefined)).toEqual([]);
    expect(unionHistory([ev('1', '2026-01-01T00:00:00.000Z')], undefined).map((e) => e.id)).toEqual(['1']);
  });
});

describe('pruneHistory', () => {
  it('drops events older than 90 days', () => {
    const now = new Date('2026-05-01T00:00:00.000Z').getTime();
    const recent = ev('r', '2026-04-15T00:00:00.000Z');
    const old = ev('o', '2026-01-01T00:00:00.000Z');
    const out = pruneHistory([recent, old], now);
    expect(out.map((e) => e.id)).toEqual(['r']);
  });
});

describe('makeEvent', () => {
  it('creates an event with a uuid id and given fields', () => {
    const e = makeEvent({ outcome: 'error', errorCategory: 'auth', deviceId: 'd' });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.outcome).toBe('error');
    expect(e.errorCategory).toBe('auth');
    expect(new Date(e.at).getTime()).not.toBeNaN();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- connectionHistory`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/modules/profiles/connectionHistory.ts`:

```ts
import { newId } from '../../lib/id';
import type { ConnectionEvent } from './types';

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function makeEvent(
  fields: Omit<ConnectionEvent, 'id' | 'at'> & { at?: string },
): ConnectionEvent {
  return { id: newId(), at: fields.at ?? new Date().toISOString(), ...fields };
}

export function unionHistory(
  a: ConnectionEvent[] | undefined,
  b: ConnectionEvent[] | undefined,
): ConnectionEvent[] {
  const byId = new Map<string, ConnectionEvent>();
  for (const e of a ?? []) byId.set(e.id, e);
  for (const e of b ?? []) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) => y.at.localeCompare(x.at));
}

export function pruneHistory(
  events: ConnectionEvent[],
  now: number = Date.now(),
  maxAgeMs: number = MAX_AGE_MS,
): ConnectionEvent[] {
  return events.filter((e) => now - new Date(e.at).getTime() <= maxAgeMs);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- connectionHistory`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/profiles/connectionHistory.ts src/modules/profiles/connectionHistory.test.ts
git commit -m "feat(profiles): connection-history union/prune helpers"
```

---

## Task 3: Storage — tombstone delete, listAll, appendHistoryEvent

**Files:**
- Modify: `src/modules/profiles/storage.ts`
- Test: `src/modules/profiles/storage.test.ts`

The `ProfileStorage` interface gains `listAll()` and `appendHistoryEvent()`; `remove` becomes a soft delete (tombstone). Apply identically to all three backends (in-memory, file, browser).

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/profiles/storage.test.ts`:

```ts
import { makeEvent } from './connectionHistory';

describe('ProfileStorage tombstones & history (in-memory)', () => {
  it('remove sets deletedAt and hides from list but keeps in listAll', async () => {
    const s = createInMemoryStorage();
    const p = await s.create(baseInput);
    await s.remove(p.id);
    expect(await s.list()).toEqual([]);
    const all = await s.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].deletedAt).toBeDefined();
  });

  it('appendHistoryEvent adds an event without bumping updatedAt', async () => {
    const s = createInMemoryStorage();
    const p = await s.create(baseInput);
    const before = p.updatedAt;
    await s.appendHistoryEvent(p.id, makeEvent({ outcome: 'connected', deviceId: 'd' }));
    const all = await s.listAll();
    expect(all[0].history).toHaveLength(1);
    expect(all[0].updatedAt).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- storage`
Expected: FAIL — `listAll` / `appendHistoryEvent` not on the type.

- [ ] **Step 3: Update the interface**

In `src/modules/profiles/storage.ts`, extend `ProfileStorage` and add the import:

```ts
import { pruneHistory } from './connectionHistory';
import type { ConnectionEvent, NewProfileInput, Profile, ProfileStoreFile } from './types';

export type ProfileStorage = {
  list(): Promise<Profile[]>;
  listAll(): Promise<Profile[]>;
  create(input: NewProfileInput): Promise<Profile>;
  update(id: string, patch: Partial<NewProfileInput>): Promise<Profile>;
  remove(id: string): Promise<void>;
  upsert(profile: Profile): Promise<void>;
  appendHistoryEvent(id: string, event: ConnectionEvent): Promise<void>;
};
```

- [ ] **Step 4: Implement in-memory backend**

Replace the in-memory `list`/`remove` and add `listAll`/`appendHistoryEvent` (in `createInMemoryStorage`):

```ts
    async list() {
      return profiles.filter((p) => !p.deletedAt);
    },
    async listAll() {
      return [...profiles];
    },
    // ...create/update unchanged...
    async remove(id) {
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Profile not found: ${id}`);
      const tombstone: Profile = { ...profiles[idx], deletedAt: nowIso(), updatedAt: nowIso() };
      profiles = profiles.map((p, i) => (i === idx ? tombstone : p));
    },
    // ...upsert unchanged...
    async appendHistoryEvent(id, event) {
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx === -1) return;
      const history = pruneHistory([event, ...(profiles[idx].history ?? [])]);
      profiles = profiles.map((p, i) => (i === idx ? { ...p, history } : p));
    },
```

Note: tombstones DO bump `updatedAt` (the deletion is a content change that must win on merge), but `appendHistoryEvent` does NOT.

- [ ] **Step 5: Implement file backend**

In `createFileStorage`, mirror the same logic against `data.profiles` with `await writeFile(data)`:

```ts
    async list() {
      const data = await readFile();
      return (data?.profiles ?? []).filter((p) => !p.deletedAt);
    },
    async listAll() {
      const data = await readFile();
      return data?.profiles ?? [];
    },
    async remove(id) {
      const data = await readFile();
      if (!data) throw new Error(`Profile not found: ${id}`);
      const idx = data.profiles.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Profile not found: ${id}`);
      const ts = nowIso();
      data.profiles = data.profiles.map((p, i) => (i === idx ? { ...p, deletedAt: ts, updatedAt: ts } : p));
      await writeFile(data);
    },
    async appendHistoryEvent(id, event) {
      const data = await readFile();
      if (!data) return;
      const idx = data.profiles.findIndex((p) => p.id === id);
      if (idx === -1) return;
      const history = pruneHistory([event, ...(data.profiles[idx].history ?? [])]);
      data.profiles = data.profiles.map((p, i) => (i === idx ? { ...p, history } : p));
      await writeFile(data);
    },
```

- [ ] **Step 6: Implement browser backend**

In `createBrowserStorage`, mirror the same against `readBrowserFile()` / `writeBrowserFile(data)`:

```ts
    async list() {
      return readBrowserFile().profiles.filter((p) => !p.deletedAt);
    },
    async listAll() {
      return readBrowserFile().profiles;
    },
    async remove(id) {
      const data = readBrowserFile();
      const idx = data.profiles.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Profile not found: ${id}`);
      const ts = nowIso();
      data.profiles = data.profiles.map((p, i) => (i === idx ? { ...p, deletedAt: ts, updatedAt: ts } : p));
      writeBrowserFile(data);
    },
    async appendHistoryEvent(id, event) {
      const data = readBrowserFile();
      const idx = data.profiles.findIndex((p) => p.id === id);
      if (idx === -1) return;
      const history = pruneHistory([event, ...(data.profiles[idx].history ?? [])]);
      data.profiles = data.profiles.map((p, i) => (i === idx ? { ...p, history } : p));
      writeBrowserFile(data);
    },
```

- [ ] **Step 7: Run to verify it passes**

Run: `npm run test:run -- storage`
Expected: PASS (existing tests + 2 new). Existing `remove`-throws-on-missing test still passes (we throw on missing id).

- [ ] **Step 8: Commit**

```bash
git add src/modules/profiles/storage.ts src/modules/profiles/storage.test.ts
git commit -m "feat(profiles): tombstone deletes, listAll, appendHistoryEvent"
```

---

## Task 4: Sync metadata store (dirty / token)

**Files:**
- Create: `src/modules/sync/syncMeta.ts`
- Test: `src/modules/sync/syncMeta.test.ts`

This is a small persisted map. For testability the core logic is pure functions over a plain object; persistence is a thin async wrapper (localStorage in browser, Tauri file on desktop).

- [ ] **Step 1: Write the failing tests**

Create `src/modules/sync/syncMeta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { markDirty, clearAndSetToken, isDirty, getToken } from './syncMeta';
import type { SyncMeta } from './syncMeta';

describe('syncMeta pure ops', () => {
  it('markDirty sets dirty true, preserving token', () => {
    const m: SyncMeta = { a: { dirty: false, lastSyncedToken: 't1' } };
    const out = markDirty(m, 'a');
    expect(out.a.dirty).toBe(true);
    expect(out.a.lastSyncedToken).toBe('t1');
  });

  it('markDirty creates entry for unknown id', () => {
    const out = markDirty({}, 'new');
    expect(out.new).toEqual({ dirty: true, lastSyncedToken: '' });
  });

  it('clearAndSetToken clears dirty and stores token', () => {
    const m: SyncMeta = { a: { dirty: true, lastSyncedToken: 'old' } };
    const out = clearAndSetToken(m, 'a', 'new');
    expect(out.a).toEqual({ dirty: false, lastSyncedToken: 'new' });
  });

  it('isDirty / getToken read helpers', () => {
    const m: SyncMeta = { a: { dirty: true, lastSyncedToken: 'tok' } };
    expect(isDirty(m, 'a')).toBe(true);
    expect(isDirty(m, 'missing')).toBe(false);
    expect(getToken(m, 'a')).toBe('tok');
    expect(getToken(m, 'missing')).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- syncMeta`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/modules/sync/syncMeta.ts`:

```ts
import { isTauri } from '@tauri-apps/api/core';

export type SyncMetaEntry = { dirty: boolean; lastSyncedToken: string };
export type SyncMeta = Record<string, SyncMetaEntry>;

const FILE_NAME = 'sync-meta.json';
const BROWSER_KEY = 'ssh-buddy.sync-meta';

// --- pure ops ---
export function markDirty(meta: SyncMeta, id: string): SyncMeta {
  const prev = meta[id] ?? { dirty: false, lastSyncedToken: '' };
  return { ...meta, [id]: { ...prev, dirty: true } };
}

export function clearAndSetToken(meta: SyncMeta, id: string, token: string): SyncMeta {
  return { ...meta, [id]: { dirty: false, lastSyncedToken: token } };
}

export function isDirty(meta: SyncMeta, id: string): boolean {
  return meta[id]?.dirty ?? false;
}

export function getToken(meta: SyncMeta, id: string): string {
  return meta[id]?.lastSyncedToken ?? '';
}

// --- persistence ---
export async function loadMeta(): Promise<SyncMeta> {
  if (isTauri()) {
    const { exists, readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    if (!(await exists(FILE_NAME, { baseDir: BaseDirectory.AppLocalData }))) return {};
    return JSON.parse(await readTextFile(FILE_NAME, { baseDir: BaseDirectory.AppLocalData })) as SyncMeta;
  }
  const raw = localStorage.getItem(BROWSER_KEY);
  return raw ? (JSON.parse(raw) as SyncMeta) : {};
}

export async function saveMeta(meta: SyncMeta): Promise<void> {
  if (isTauri()) {
    const { writeTextFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await mkdir('', { baseDir: BaseDirectory.AppLocalData, recursive: true });
    await writeTextFile(FILE_NAME, JSON.stringify(meta), { baseDir: BaseDirectory.AppLocalData });
    return;
  }
  localStorage.setItem(BROWSER_KEY, JSON.stringify(meta));
}

export async function markDirtyPersisted(id: string): Promise<void> {
  await saveMeta(markDirty(await loadMeta(), id));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- syncMeta`
Expected: PASS (5 tests). Persistence functions aren't unit-tested (they hit platform storage); they're exercised in integration.

- [ ] **Step 5: Commit**

```bash
git add src/modules/sync/syncMeta.ts src/modules/sync/syncMeta.test.ts
git commit -m "feat(sync): local dirty/token sync-metadata store"
```

---

## Task 5: planMerge — the conflict-aware merge planner

**Files:**
- Create: `src/modules/sync/planMerge.ts`
- Test: `src/modules/sync/planMerge.test.ts`

Pure function. Input: remote profiles (each with its PB `updated` token), local profiles, the sync-meta map, and whether history syncs. Output: an ordered list of actions.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/sync/planMerge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planMerge, type RemoteProfile } from './planMerge';
import type { SyncMeta } from './syncMeta';
import type { Profile } from '../profiles/types';

function prof(id: string, name = 'n', extra: Partial<Profile> = {}): Profile {
  return {
    id, name, host: 'h', port: 22, username: 'u',
    auth: { kind: 'password', password: 'p' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}
const remote = (p: Profile, token: string): RemoteProfile => ({ profile: p, token });

describe('planMerge', () => {
  it('remote-only → take-remote', () => {
    const out = planMerge([remote(prof('a'), 't1')], [], {}, { syncHistory: true });
    expect(out).toEqual([{ kind: 'take-remote', profile: prof('a'), token: 't1' }]);
  });

  it('local-only → push', () => {
    const out = planMerge([], [prof('b')], {}, { syncHistory: true });
    expect(out[0].kind).toBe('push');
  });

  it('not dirty → take-remote even if content differs', () => {
    const meta: SyncMeta = { c: { dirty: false, lastSyncedToken: 't1' } };
    const out = planMerge([remote(prof('c', 'remote'), 't2')], [prof('c', 'local')], meta, { syncHistory: true });
    expect(out[0]).toMatchObject({ kind: 'take-remote', token: 't2' });
    expect((out[0] as any).profile.name).toBe('remote');
  });

  it('dirty + token unchanged → push (fast-forward)', () => {
    const meta: SyncMeta = { d: { dirty: true, lastSyncedToken: 't1' } };
    const out = planMerge([remote(prof('d', 'remote'), 't1')], [prof('d', 'local')], meta, { syncHistory: true });
    expect(out[0]).toMatchObject({ kind: 'push' });
    expect((out[0] as any).profile.name).toBe('local');
  });

  it('dirty + token changed → conflict', () => {
    const meta: SyncMeta = { e: { dirty: true, lastSyncedToken: 't1' } };
    const out = planMerge([remote(prof('e', 'remote'), 't2')], [prof('e', 'local')], meta, { syncHistory: true });
    expect(out[0]).toMatchObject({ kind: 'conflict', token: 't2' });
  });

  it('unions history into take-remote result when syncHistory on', () => {
    const meta: SyncMeta = { f: { dirty: false, lastSyncedToken: 't1' } };
    const local = prof('f', 'x', { history: [{ id: 'l1', at: '2026-02-01T00:00:00.000Z', outcome: 'connected', deviceId: 'd' }] });
    const rem = prof('f', 'x', { history: [{ id: 'r1', at: '2026-03-01T00:00:00.000Z', outcome: 'connected', deviceId: 'd' }] });
    const out = planMerge([remote(rem, 't2')], [local], meta, { syncHistory: true });
    const merged = (out[0] as any).profile as Profile;
    expect(merged.history?.map((h) => h.id).sort()).toEqual(['l1', 'r1']);
  });

  it('keeps only local history when syncHistory off', () => {
    const meta: SyncMeta = { g: { dirty: false, lastSyncedToken: 't1' } };
    const local = prof('g', 'x', { history: [{ id: 'l1', at: '2026-02-01T00:00:00.000Z', outcome: 'connected', deviceId: 'd' }] });
    const rem = prof('g', 'x', { history: [{ id: 'r1', at: '2026-03-01T00:00:00.000Z', outcome: 'connected', deviceId: 'd' }] });
    const out = planMerge([remote(rem, 't2')], [local], meta, { syncHistory: false });
    const merged = (out[0] as any).profile as Profile;
    expect(merged.history?.map((h) => h.id)).toEqual(['l1']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- planMerge`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/modules/sync/planMerge.ts`:

```ts
import type { Profile } from '../profiles/types';
import { unionHistory } from '../profiles/connectionHistory';
import { isDirty, getToken, type SyncMeta } from './syncMeta';

export type RemoteProfile = { profile: Profile; token: string };

export type MergeAction =
  | { kind: 'take-remote'; profile: Profile; token: string }
  | { kind: 'push'; profile: Profile }
  | { kind: 'conflict'; local: Profile; remote: Profile; token: string };

function withHistory(base: Profile, local: Profile | undefined, remote: Profile | undefined, syncHistory: boolean): Profile {
  if (!syncHistory) return { ...base, history: local?.history ?? base.history };
  return { ...base, history: unionHistory(local?.history, remote?.history) };
}

export function planMerge(
  remote: RemoteProfile[],
  local: Profile[],
  meta: SyncMeta,
  opts: { syncHistory: boolean },
): MergeAction[] {
  const remoteById = new Map(remote.map((r) => [r.profile.id, r]));
  const localById = new Map(local.map((p) => [p.id, p]));
  const ids = new Set<string>([...remoteById.keys(), ...localById.keys()]);
  const actions: MergeAction[] = [];

  for (const id of ids) {
    const r = remoteById.get(id);
    const l = localById.get(id);

    if (r && !l) {
      actions.push({ kind: 'take-remote', profile: withHistory(r.profile, undefined, r.profile, opts.syncHistory), token: r.token });
    } else if (l && !r) {
      actions.push({ kind: 'push', profile: l });
    } else if (l && r) {
      if (!isDirty(meta, id)) {
        actions.push({ kind: 'take-remote', profile: withHistory(r.profile, l, r.profile, opts.syncHistory), token: r.token });
      } else if (r.token === getToken(meta, id)) {
        actions.push({ kind: 'push', profile: withHistory(l, l, r.profile, opts.syncHistory) });
      } else {
        actions.push({ kind: 'conflict', local: l, remote: r.profile, token: r.token });
      }
    }
  }

  return actions;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- planMerge`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/sync/planMerge.ts src/modules/sync/planMerge.test.ts
git commit -m "feat(sync): conflict-aware planMerge planner"
```

---

## Task 6: Settings module (encrypted singleton sync)

**Files:**
- Create: `src/modules/settings/settings.ts`
- Test: `src/modules/settings/settings.test.ts`

- [ ] **Step 1: Write the failing test (pure default-merge helper)**

Create `src/modules/settings/settings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withDefaults, DEFAULT_SETTINGS } from './settings';

describe('settings withDefaults', () => {
  it('fills missing fields with defaults', () => {
    expect(withDefaults({})).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps provided fields', () => {
    expect(withDefaults({ syncConnectionHistory: true })).toEqual({ syncConnectionHistory: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- settings`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/modules/settings/settings.ts`:

```ts
import { encryptBlob, decryptBlob } from '../crypto';
import { pb } from '../sync/pb';

export type SyncSettings = { syncConnectionHistory: boolean };
export const DEFAULT_SETTINGS: SyncSettings = { syncConnectionHistory: false };

type PbSettingsRecord = { id: string; user: string; blob: string; nonce: string; schema_version: number };

export function withDefaults(partial: Partial<SyncSettings>): SyncSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}

export async function fetchSettings(key: Uint8Array): Promise<SyncSettings> {
  const rec = await pb
    .collection('settings')
    .getFirstListItem<PbSettingsRecord>(`user = "${pb.authStore.record?.id}"`)
    .catch(() => null);
  if (!rec) return DEFAULT_SETTINGS;
  try {
    return withDefaults(JSON.parse(decryptBlob(key, rec.blob, rec.nonce)) as Partial<SyncSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function pushSettings(key: Uint8Array, settings: SyncSettings): Promise<void> {
  const { ciphertext, nonce } = encryptBlob(key, JSON.stringify(settings));
  const payload = { user: pb.authStore.record!.id, blob: ciphertext, nonce, schema_version: 1 };
  const existing = await pb
    .collection('settings')
    .getFirstListItem<PbSettingsRecord>(`user = "${pb.authStore.record?.id}"`)
    .catch(() => null);
  if (existing) await pb.collection('settings').update(existing.id, payload);
  else await pb.collection('settings').create(payload);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- settings`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/settings/settings.ts src/modules/settings/settings.test.ts
git commit -m "feat(settings): encrypted sync-settings singleton"
```

---

## Task 7: syncEngine — apply actions, push, purge, echo filter, conflicts

**Files:**
- Modify: `src/modules/sync/syncEngine.ts`
- Modify: `src/modules/sync/pb.ts` (add `deleted` view of token already present as `updated`)
- Test: existing `src/modules/sync/syncEngine.test.ts` (replace `unionMerge` tests — that function is removed)

`syncAll` now returns collected conflicts. It applies take-remote/push actions, sets sync-meta tokens, purges old tombstones, and resolves remote device names for conflicts.

- [ ] **Step 1: Update the existing test file to target the new API**

Replace the entire contents of `src/modules/sync/syncEngine.test.ts` with a thin re-export check (the heavy logic is covered by `planMerge.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import * as engine from './syncEngine';

describe('syncEngine exports', () => {
  it('exposes syncAll, subscribeRealtime, and pushProfile', () => {
    expect(typeof engine.syncAll).toBe('function');
    expect(typeof engine.subscribeRealtime).toBe('function');
    expect(typeof engine.pushProfile).toBe('function');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run -- syncEngine`
Expected: FAIL — `unionMerge` import removed / `pushProfile` not exported yet (compile error).

- [ ] **Step 3: Rewrite syncEngine.ts**

Replace `src/modules/sync/syncEngine.ts` with:

```ts
import { isTauri } from '@tauri-apps/api/core';
import { encryptBlob, decryptBlob } from '../crypto';
import type { Profile } from '../profiles/types';
import { createProfileStorage } from '../profiles/storage';
import { pb, type PbProfileRecord } from './pb';
import { planMerge, type RemoteProfile, type MergeAction } from './planMerge';
import { loadMeta, saveMeta, clearAndSetToken, type SyncMeta } from './syncMeta';
import { fetchSettings } from '../settings/settings';

const TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function getDeviceId(): string {
  const key = 'ssh-buddy.device-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export type SyncConflict = { profileId: string; local: Profile; remote: Profile; token: string; remoteDeviceName?: string };

async function fetchRemote(key: Uint8Array): Promise<{ profiles: RemoteProfile[]; recordByProfileId: Map<string, PbProfileRecord> }> {
  const records = await pb.collection('profiles').getFullList<PbProfileRecord>({
    filter: `user = "${pb.authStore.record?.id}"`,
  });
  const profiles: RemoteProfile[] = [];
  const recordByProfileId = new Map<string, PbProfileRecord>();
  for (const r of records) {
    recordByProfileId.set(r.profile_id, r);
    try {
      const profile = JSON.parse(decryptBlob(key, r.blob, r.nonce)) as Profile;
      profiles.push({ profile, token: r.updated });
    } catch {
      // skip corrupted
    }
  }
  return { profiles, recordByProfileId };
}

export async function pushProfile(
  key: Uint8Array,
  profile: Profile,
  recordByProfileId: Map<string, PbProfileRecord>,
): Promise<string> {
  const { ciphertext, nonce } = encryptBlob(key, JSON.stringify(profile));
  const payload = {
    user: pb.authStore.record!.id,
    profile_id: profile.id,
    blob: ciphertext,
    nonce,
    schema_version: 1,
    device_id: getDeviceId(),
  };
  const existing = recordByProfileId.get(profile.id)
    ?? (await pb.collection('profiles').getFirstListItem<PbProfileRecord>(`profile_id = "${profile.id}"`).catch(() => null));
  const saved = existing
    ? await pb.collection('profiles').update<PbProfileRecord>(existing.id, payload)
    : await pb.collection('profiles').create<PbProfileRecord>(payload);
  return saved.updated;
}

async function resolveDeviceName(deviceId: string): Promise<string | undefined> {
  const rec = await pb.collection('devices').getFirstListItem<{ name: string }>(`device_id = "${deviceId}"`).catch(() => null);
  return rec?.name;
}

export async function syncAll(key: Uint8Array): Promise<{ conflicts: SyncConflict[] }> {
  const storage = createProfileStorage();
  const settings = await fetchSettings(key);
  const [{ profiles: remoteProfiles, recordByProfileId }, localProfiles, metaInitial] = await Promise.all([
    fetchRemote(key),
    storage.listAll(),
    loadMeta(),
  ]);

  const actions = planMerge(remoteProfiles, localProfiles, metaInitial, { syncHistory: settings.syncConnectionHistory });
  let meta: SyncMeta = metaInitial;
  const conflicts: SyncConflict[] = [];

  for (const action of actions) {
    if (action.kind === 'take-remote') {
      await storage.upsert(action.profile);
      meta = clearAndSetToken(meta, action.profile.id, action.token);
    } else if (action.kind === 'push') {
      const profileToPush = settings.syncConnectionHistory ? action.profile : { ...action.profile, history: undefined };
      const token = await pushProfile(key, profileToPush, recordByProfileId);
      await storage.upsert(action.profile);
      meta = clearAndSetToken(meta, action.profile.id, token);
    } else {
      const record = recordByProfileId.get(action.profileId ?? action.remote.id);
      const remoteDeviceName = record ? await resolveDeviceName(record.device_id) : undefined;
      conflicts.push({ profileId: action.remote.id, local: action.local, remote: action.remote, token: action.token, remoteDeviceName });
    }
  }

  await saveMeta(meta);
  await purgeTombstones(storage, recordByProfileId);
  await updateDeviceRecord();

  return { conflicts };
}

async function purgeTombstones(
  storage: ReturnType<typeof createProfileStorage>,
  recordByProfileId: Map<string, PbProfileRecord>,
): Promise<void> {
  const now = Date.now();
  const all = await storage.listAll();
  for (const p of all) {
    if (p.deletedAt && now - new Date(p.deletedAt).getTime() > TOMBSTONE_MAX_AGE_MS) {
      const rec = recordByProfileId.get(p.id);
      if (rec) await pb.collection('profiles').delete(rec.id).catch(console.error);
    }
  }
}

async function updateDeviceRecord(): Promise<void> {
  const platform = isTauri() ? 'desktop' : 'web';
  const deviceId = getDeviceId();
  const existing = await pb.collection('devices').getFirstListItem(`device_id = "${deviceId}"`).catch(() => null);
  const payload = { user: pb.authStore.record!.id, name: navigator.userAgent.slice(0, 80), platform, last_seen_at: new Date().toISOString() };
  if (existing) await pb.collection('devices').update(existing.id, payload).catch(console.error);
  else await pb.collection('devices').create({ ...payload, device_id: deviceId }).catch(console.error);
}

export function subscribeRealtime(key: Uint8Array, onUpdate: () => void): () => void {
  const storage = createProfileStorage();
  const ownDeviceId = getDeviceId();

  pb.collection('profiles').subscribe<PbProfileRecord>('*', async (event) => {
    if (event.record.device_id === ownDeviceId) return; // echo filter
    if (event.action === 'delete') {
      await storage.remove(event.record.profile_id).catch(() => {});
    } else {
      try {
        const profile = JSON.parse(decryptBlob(key, event.record.blob, event.record.nonce)) as Profile;
        await storage.upsert(profile);
        await saveMeta(clearAndSetToken(await loadMeta(), profile.id, event.record.updated));
      } catch {
        return;
      }
    }
    onUpdate();
  }).catch(console.error);

  return () => {
    pb.collection('profiles').unsubscribe('*').catch(console.error);
  };
}
```

Note: the `conflict` action type uses `action.remote.id` for `profileId`; remove the stray `action.profileId` reference — the `conflict` action has no `profileId` field. Corrected line:

```ts
      const record = recordByProfileId.get(action.remote.id);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:run -- syncEngine planMerge syncMeta`
Expected: PASS. Then `npm run lint` — expected errors only in `useSync.ts` (Task 8) and UI tasks; `syncEngine.ts` itself must compile clean.

- [ ] **Step 5: Commit**

```bash
git add src/modules/sync/syncEngine.ts src/modules/sync/syncEngine.test.ts
git commit -m "feat(sync): action-based sync with conflicts, tombstone purge, echo filter"
```

---

## Task 8: useSync — expose conflicts and resolveConflict

**Files:**
- Modify: `src/modules/sync/useSync.ts`

- [ ] **Step 1: Rewrite useSync.ts**

Replace `src/modules/sync/useSync.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { syncAll, subscribeRealtime, pushProfile, getDeviceId, type SyncConflict } from './syncEngine';
import { createProfileStorage } from '../profiles/storage';
import { loadMeta, saveMeta, clearAndSetToken } from './syncMeta';
import { fetchSettings } from '../settings/settings';
import { pb, type PbProfileRecord } from './pb';
import { newId } from '../../lib/id';
import type { Profile } from '../profiles/types';

type SyncStatus = 'idle' | 'syncing' | 'error';
export type ConflictChoice = 'mine' | 'remote' | 'both';

export function useSync(key: Uint8Array | null, onUpdate: () => void) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);

  const runSync = useCallback(async (k: Uint8Array) => {
    setStatus('syncing');
    setError(null);
    try {
      const { conflicts: found } = await syncAll(k);
      setConflicts(found);
      setLastSyncedAt(new Date());
      setStatus('idle');
      onUpdate();
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }, [onUpdate]);

  useEffect(() => {
    if (!key) return;
    runSync(key);
    unsubRef.current = subscribeRealtime(key, onUpdate);
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncNow = useCallback(() => {
    if (key) return runSync(key);
  }, [key, runSync]);

  const resolveConflict = useCallback(async (profileId: string, choice: ConflictChoice) => {
    const conflict = conflicts.find((c) => c.profileId === profileId);
    if (!conflict || !key) return;
    const storage = createProfileStorage();
    const recordByProfileId = new Map<string, PbProfileRecord>();
    const settings = await fetchSettings(key);

    if (choice === 'remote') {
      await storage.upsert(conflict.remote);
      await saveMeta(clearAndSetToken(await loadMeta(), profileId, conflict.token));
    } else if (choice === 'mine') {
      const toPush = settings.syncConnectionHistory ? conflict.local : { ...conflict.local, history: undefined };
      const token = await pushProfile(key, toPush, recordByProfileId);
      await storage.upsert(conflict.local);
      await saveMeta(clearAndSetToken(await loadMeta(), profileId, token));
    } else {
      // both: remote stays under existing id; local becomes a new duplicate profile
      await storage.upsert(conflict.remote);
      await saveMeta(clearAndSetToken(await loadMeta(), profileId, conflict.token));
      const dup: Profile = {
        ...conflict.local,
        id: newId(),
        name: `${conflict.local.name} (Konflikt-Kopie)`,
        deletedAt: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const dupPush = settings.syncConnectionHistory ? dup : { ...dup, history: undefined };
      const token = await pushProfile(key, dupPush, recordByProfileId);
      await storage.upsert(dup);
      await saveMeta(clearAndSetToken(await loadMeta(), dup.id, token));
    }

    setConflicts((cur) => cur.filter((c) => c.profileId !== profileId));
    onUpdate();
  }, [conflicts, key, onUpdate]);

  return { status, lastSyncedAt, error, syncNow, conflicts, resolveConflict };
}
```

Note: `pb` import is required for the `PbProfileRecord` type only; if lint flags `pb` as unused, change the import to `import type { PbProfileRecord } from './pb';`.

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: errors only in `App.tsx` / `ConnectionView.tsx` / `Workspace.tsx` (Tasks 9–11). `useSync.ts` compiles clean.

- [ ] **Step 3: Commit**

```bash
git add src/modules/sync/useSync.ts
git commit -m "feat(sync): expose conflicts and resolveConflict from useSync"
```

---

## Task 9: SyncConflictModal component

**Files:**
- Create: `src/modules/sync/SyncConflictModal.tsx`

- [ ] **Step 1: Implement the component**

Create `src/modules/sync/SyncConflictModal.tsx`:

```tsx
import { Badge, Button, Group, Modal, Stack, Table, Text } from '@mantine/core';
import type { Profile } from '../profiles/types';
import type { SyncConflict } from './syncEngine';
import type { ConflictChoice } from './useSync';

function fieldValue(p: Profile, field: keyof Profile): string {
  const v = p[field];
  if (v == null) return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const COMPARED: (keyof Profile)[] = ['name', 'host', 'port', 'username', 'notes', 'tags', 'color', 'jumpHostId'];

export function SyncConflictModal({
  conflicts,
  onResolve,
}: {
  conflicts: SyncConflict[];
  onResolve: (profileId: string, choice: ConflictChoice) => void;
}) {
  const current = conflicts[0];
  if (!current) return null;

  const diffRows = COMPARED.filter((f) => fieldValue(current.local, f) !== fieldValue(current.remote, f));

  return (
    <Modal opened onClose={() => {}} withCloseButton={false} title={`Sync-Konflikt: ${current.remote.name}`} size="lg">
      <Stack gap="md">
        <Text size="sm">
          Beide Geräte haben dieses Profil geändert.
          {current.remoteDeviceName && (
            <> Remote zuletzt geändert auf <Badge variant="light">{current.remoteDeviceName}</Badge>.</>
          )}
        </Text>

        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Feld</Table.Th>
              <Table.Th>Deine Version</Table.Th>
              <Table.Th>Remote-Version</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {diffRows.map((f) => (
              <Table.Tr key={f}>
                <Table.Td>{f}</Table.Td>
                <Table.Td>{fieldValue(current.local, f)}</Table.Td>
                <Table.Td>{fieldValue(current.remote, f)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <Group justify="flex-end">
          <Button variant="default" onClick={() => onResolve(current.profileId, 'mine')}>Meine behalten</Button>
          <Button variant="default" onClick={() => onResolve(current.profileId, 'remote')}>Remote behalten</Button>
          <Button onClick={() => onResolve(current.profileId, 'both')}>Beide behalten (Duplikat)</Button>
        </Group>

        {conflicts.length > 1 && (
          <Text size="xs" c="dimmed">Noch {conflicts.length - 1} weitere(r) Konflikt(e)</Text>
        )}
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no new errors from this file (remaining errors are the App/ConnectionView/Workspace ones from Tasks 10–11).

- [ ] **Step 3: Commit**

```bash
git add src/modules/sync/SyncConflictModal.tsx
git commit -m "feat(sync): conflict resolution modal"
```

---

## Task 10: ConnectionView + Workspace — append events, drop the bump

**Files:**
- Modify: `src/modules/shell/ConnectionView.tsx`
- Modify: `src/modules/shell/Workspace.tsx`

- [ ] **Step 1: Update ConnectionView props and handlers**

In `src/modules/shell/ConnectionView.tsx`, replace the `Props` `onUpdateHistory` definition and the two handlers. New `Props` and imports:

```tsx
import { getDeviceId } from '../sync/syncEngine';
import { makeEvent } from '../profiles/connectionHistory';
import type { ConnectionEvent } from '../profiles/types';

type Props = {
  sessionId: string;
  profile: Profile;
  active: boolean;
  onAppendHistory?: (profileId: string, event: ConnectionEvent) => void;
};
```

Replace the destructure on the component signature:

```tsx
export function ConnectionView({ sessionId, profile, active, onAppendHistory }: Props) {
```

Replace the `setOnConnected` effect (lines ~48-57):

```tsx
  useEffect(() => {
    session.setOnConnected((fingerprint) => {
      onAppendHistory?.(profile.id, makeEvent({ outcome: 'connected', hostKeyFingerprint: fingerprint, deviceId: getDeviceId() }));
      const term = termRef.current;
      if (term) logConnected(term, fingerprint);
    });
  }, [session.setOnConnected, onAppendHistory, profile.id]);
```

Replace the `setOnError` effect (lines ~88-92):

```tsx
  useEffect(() => {
    session.setOnError((category) => {
      onAppendHistory?.(profile.id, makeEvent({ outcome: 'error', errorCategory: category, deviceId: getDeviceId() }));
    });
  }, [session.setOnError, onAppendHistory, profile.id]);
```

- [ ] **Step 2: Update Workspace to pass the new callback**

In `src/modules/shell/Workspace.tsx`, replace the `Props` type, the `HistoryPatch` usage, and the prop passthrough. Remove the local `HistoryPatch`/`lastConnectedAt` type block (lines ~20-27) and replace with:

```tsx
import type { ConnectionEvent } from '../profiles/types';

type Props = {
  profiles: Profile[];
  onAppendHistory: (profileId: string, event: ConnectionEvent) => void;
};
```

Update the component signature and the `ConnectionView` render:

```tsx
export function Workspace({ profiles, onAppendHistory }: Props) {
```
```tsx
              onAppendHistory={onAppendHistory}
```

(Remove the old `onUpdateHistory={(patch) => onUpdateHistory(profile.id, patch)}` line.)

- [ ] **Step 3: Verify it compiles (App.tsx still references old API)**

Run: `npm run lint`
Expected: errors only in `App.tsx` (fixed in Task 12). ConnectionView/Workspace compile clean.

- [ ] **Step 4: Commit**

```bash
git add src/modules/shell/ConnectionView.tsx src/modules/shell/Workspace.tsx
git commit -m "feat(shell): record connection events into append-only history"
```

---

## Task 11: History display in ProfileForm

**Files:**
- Modify: `src/modules/profiles/ProfileForm.tsx`

- [ ] **Step 1: Add a read-only history section**

In `src/modules/profiles/ProfileForm.tsx`, add near the end of the form (before the submit/cancel buttons). First ensure these are imported from `@mantine/core`: `Divider`, `Text`, `Table`, `ScrollArea`. Then render when editing an existing profile with history:

```tsx
{initial?.history && initial.history.length > 0 && (
  <>
    <Divider label="Verbindungs-Historie" labelPosition="center" my="sm" />
    <ScrollArea.Autosize mah={200}>
      <Table fz="xs" stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Zeit</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Gerät</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {initial.history.map((e) => (
            <Table.Tr key={e.id}>
              <Table.Td>{new Date(e.at).toLocaleString()}</Table.Td>
              <Table.Td>{e.outcome === 'connected' ? 'Verbunden' : `Fehler: ${e.errorCategory ?? 'unbekannt'}`}</Table.Td>
              <Table.Td>{e.deviceId.slice(0, 8)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
  </>
)}
```

(`initial` is the existing `ProfileForm` prop of type `Profile | undefined`. If the prop name differs, match the existing one.)

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: errors only in `App.tsx` (Task 12).

- [ ] **Step 3: Commit**

```bash
git add src/modules/profiles/ProfileForm.tsx
git commit -m "feat(profiles): show connection history in the profile editor"
```

---

## Task 12: Settings toggle in AccountModal

**Files:**
- Modify: `src/modules/auth/AccountModal.tsx`

- [ ] **Step 1: Add a controlled toggle prop and Switch**

In `src/modules/auth/AccountModal.tsx`, add to the component's props:

```tsx
  syncConnectionHistory: boolean;
  onToggleSyncHistory: (value: boolean) => void;
```

Add the `Switch` import from `@mantine/core` and render it in the modal body:

```tsx
<Switch
  label="Verbindungs-Historie zwischen Geräten synchronisieren"
  checked={syncConnectionHistory}
  onChange={(e) => onToggleSyncHistory(e.currentTarget.checked)}
/>
```

Destructure the two new props in the component signature.

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: errors only in `App.tsx` (it now must pass the new AccountModal props — Task 13).

- [ ] **Step 3: Commit**

```bash
git add src/modules/auth/AccountModal.tsx
git commit -m "feat(settings): sync-history toggle in account modal"
```

---

## Task 13: Wire it all in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add settings state + history append + mount modal**

In `src/App.tsx`:

1. Add imports:
```tsx
import { useEffect } from 'react';
import { SyncConflictModal } from './modules/sync/SyncConflictModal';
import { fetchSettings, pushSettings, DEFAULT_SETTINGS, type SyncSettings } from './modules/settings/settings';
import { createProfileStorage } from './modules/profiles/storage';
import { markDirtyPersisted } from './modules/sync/syncMeta';
import type { ConnectionEvent } from './modules/profiles/types';
```
(Merge the `useEffect` into the existing `react` import.)

2. Update the `useSync` destructure to capture conflicts:
```tsx
const { status: syncStatus, lastSyncedAt, conflicts, resolveConflict } = useSync(key, reload);
```

3. Add settings state and load it when unlocked:
```tsx
const [settings, setSettings] = useState<SyncSettings>(DEFAULT_SETTINGS);
useEffect(() => {
  if (state === 'unlocked' && key) void fetchSettings(key).then(setSettings);
}, [state, key]);

const handleToggleSyncHistory = async (value: boolean) => {
  const next = { ...settings, syncConnectionHistory: value };
  setSettings(next);
  if (key) await pushSettings(key, next);
};
```

4. Add the history-append handler (writes the event AND does not mark dirty):
```tsx
const appendHistory = async (profileId: string, event: ConnectionEvent) => {
  await createProfileStorage().appendHistoryEvent(profileId, event);
};
```

5. Mark profiles dirty on mutation. Wrap `create`/`update`/`remove` so each marks the profile dirty after the storage write. Replace the destructure and add wrappers:
```tsx
const { profiles, loading, error, reload, create: createRaw, update: updateRaw, remove: removeRaw } = useProfiles();

const create = async (input: Parameters<typeof createRaw>[0]) => {
  const p = await createRaw(input);
  await markDirtyPersisted(p.id);
  return p;
};
const update = async (id: string, patch: Parameters<typeof updateRaw>[1]) => {
  const p = await updateRaw(id, patch);
  await markDirtyPersisted(id);
  return p;
};
const remove = async (id: string) => {
  await removeRaw(id);
  await markDirtyPersisted(id);
};
```

6. Replace `<Workspace profiles={profiles} onUpdateHistory={update} />` with:
```tsx
<Workspace profiles={profiles} onAppendHistory={appendHistory} />
```

7. Pass the new props to `AccountModal` (add to the existing element):
```tsx
syncConnectionHistory={settings.syncConnectionHistory}
onToggleSyncHistory={handleToggleSyncHistory}
```

8. Mount the conflict modal (just inside the top-level fragment, e.g. after the `AccountModal` block):
```tsx
<SyncConflictModal conflicts={conflicts} onResolve={(id, choice) => void resolveConflict(id, choice)} />
```

- [ ] **Step 2: Full typecheck**

Run: `npm run lint`
Expected: PASS — zero errors across the whole project.

- [ ] **Step 3: Full test run**

Run: `npm run test:run`
Expected: PASS — all suites green.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: succeeds (tsc + vite build).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(sync): wire conflict modal, history append, dirty-marking, settings toggle"
```

---

## Task 14: PocketBase migration — optional revision + settings collection

**Files:**
- Create: `backend/pocketbase/pb_migrations/20260528120000_sync_settings_and_optional_revision.js`

- [ ] **Step 1: Write the migration**

Create the file, following the existing migration style (`backend/pocketbase/pb_migrations/20260527103000_initial_sync_schema.js`):

```js
migrate((app) => {
  const authRule = "user = @request.auth.id";
  const users = app.findCollectionByNameOrId("users");

  // Make client_revision optional (no longer used by the client).
  const profiles = app.findCollectionByNameOrId("profiles");
  const rev = profiles.fields.getByName("client_revision");
  if (rev) {
    rev.required = false;
    app.save(profiles);
  }

  // New settings collection: one encrypted singleton record per user.
  let settings;
  try {
    settings = app.findCollectionByNameOrId("settings");
  } catch {
    settings = new Collection({ type: "base", name: "settings" });
  }

  const addFieldIfMissing = (collection, field) => {
    if (!collection.fields.getByName(field.name)) collection.fields.add(field);
  };

  addFieldIfMissing(settings, new RelationField({
    name: "user", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true,
  }));
  addFieldIfMissing(settings, new TextField({ name: "blob", required: true }));
  addFieldIfMissing(settings, new TextField({ name: "nonce", required: true, max: 128 }));
  addFieldIfMissing(settings, new NumberField({ name: "schema_version", required: true }));

  settings.listRule = authRule;
  settings.viewRule = authRule;
  settings.createRule = authRule;
  settings.updateRule = authRule;
  settings.deleteRule = authRule;

  const hasIndex = settings.indexes.some((i) => i.includes(" idx_settings_user "));
  if (!hasIndex) settings.addIndex("idx_settings_user", true, "user", "");

  app.save(settings);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("settings"));
  } catch {
    // not present
  }
  const profiles = app.findCollectionByNameOrId("profiles");
  const rev = profiles.fields.getByName("client_revision");
  if (rev) {
    rev.required = true;
    app.save(profiles);
  }
});
```

- [ ] **Step 2: Verify migration syntax (lightweight)**

This runs inside PocketBase, not Node. Manually confirm it mirrors the existing migration's API usage (`TextField`, `NumberField`, `RelationField`, `addIndex`, `app.save`). No automated check here.

- [ ] **Step 3: Commit**

```bash
git add backend/pocketbase/pb_migrations/20260528120000_sync_settings_and_optional_revision.js
git commit -m "feat(backend): settings collection + optional client_revision migration"
```

---

## Final Verification

- [ ] `npm run test:run` — all green
- [ ] `npm run lint` — zero errors
- [ ] `npm run build` — succeeds
- [ ] Manual multi-device smoke test (after deploying the PB migration):
  1. Create profile on device A → appears on device B after sync.
  2. Delete on A → disappears on B (no resurrection on next sync).
  3. Edit same profile's host on A and B independently while offline, then both sync → conflict modal appears; "Beide behalten" yields a `(Konflikt-Kopie)`.
  4. Connect on A → history event appears; with the toggle on, it shows on B; with it off, it stays local.
  5. Reconnect repeatedly → no spurious conflict prompts (history doesn't bump content).
```
```

## Self-Review Notes

- **Spec coverage:** Tombstones (T1,T3,T7), dirty/token detection (T4,T5,T7), planMerge actions (T5), conflict modal + 3 resolutions incl. duplicate (T8,T9), connection history append-only + retention + union (T2,T3,T5,T10), history display (T11), settings singleton + toggle (T6,T12,T13), echo filter + purge (T7), migration (T14), tags as content field in diff (T9 `COMPARED` includes `tags`). All covered.
- **Type consistency:** `MergeAction`/`RemoteProfile` (T5) consumed in T7; `SyncConflict` (T7) consumed in T8/T9; `ConflictChoice` (T8) consumed in T9/T13; `appendHistoryEvent`/`listAll` (T3) consumed in T7/T13; `getDeviceId`/`pushProfile` exported (T7) consumed in T8/T10.
- **Known correction baked in:** T7 Step 3 notes the `action.profileId` typo fix → use `action.remote.id`.
