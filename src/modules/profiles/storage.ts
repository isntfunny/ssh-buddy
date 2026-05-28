import { isTauri } from '@tauri-apps/api/core';
import { newId } from '../../lib/id';
import { pruneHistory } from './connectionHistory';
import type { ConnectionEvent, NewProfileInput, Profile, ProfileStoreFile } from './types';
import { SCHEMA_VERSION } from './types';

export type ProfileStorage = {
  list(): Promise<Profile[]>;
  listAll(): Promise<Profile[]>;
  create(input: NewProfileInput): Promise<Profile>;
  update(id: string, patch: Partial<NewProfileInput>): Promise<Profile>;
  remove(id: string): Promise<void>;
  upsert(profile: Profile): Promise<void>;
  appendHistoryEvent(id: string, event: ConnectionEvent): Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function createInMemoryStorage(): ProfileStorage {
  let profiles: Profile[] = [];

  return {
    async list() {
      return profiles.filter((p) => !p.deletedAt);
    },
    async listAll() {
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
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Profile not found: ${id}`);
      const ts = nowIso();
      const tombstone: Profile = { ...profiles[idx], deletedAt: ts, updatedAt: ts };
      profiles = profiles.map((p, i) => (i === idx ? tombstone : p));
    },
    async upsert(profile) {
      const idx = profiles.findIndex((p) => p.id === profile.id);
      if (idx === -1) {
        profiles = [...profiles, profile];
      } else {
        profiles = profiles.map((p, i) => (i === idx ? profile : p));
      }
    },
    async appendHistoryEvent(id, event) {
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx === -1) return;
      const history = pruneHistory([event, ...(profiles[idx].history ?? [])]);
      profiles = profiles.map((p, i) => (i === idx ? { ...p, history } : p));
    },
  };
}

const FILE_NAME = 'profiles.json';
const BROWSER_STORAGE_KEY = 'ssh-buddy.profiles';

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
      return (data?.profiles ?? []).filter((p) => !p.deletedAt);
    },
    async listAll() {
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
      const idx = data.profiles.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Profile not found: ${id}`);
      const ts = nowIso();
      data.profiles = data.profiles.map((p, i) => (i === idx ? { ...p, deletedAt: ts, updatedAt: ts } : p));
      await writeFile(data);
    },
    async upsert(profile) {
      const data = (await readFile()) ?? { schemaVersion: SCHEMA_VERSION, profiles: [] };
      const idx = data.profiles.findIndex((p) => p.id === profile.id);
      if (idx === -1) {
        data.profiles = [...data.profiles, profile];
      } else {
        data.profiles = data.profiles.map((p, i) => (i === idx ? profile : p));
      }
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
  };
}

function readBrowserFile(): ProfileStoreFile {
  const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
  if (!raw) return { schemaVersion: SCHEMA_VERSION, profiles: [] };

  const parsed = JSON.parse(raw) as ProfileStoreFile;
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported profile schema version: ${parsed.schemaVersion}`);
  }
  return parsed;
}

function writeBrowserFile(data: ProfileStoreFile): void {
  localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(data));
}

export function createBrowserStorage(): ProfileStorage {
  return {
    async list() {
      return readBrowserFile().profiles.filter((p) => !p.deletedAt);
    },
    async listAll() {
      return readBrowserFile().profiles;
    },
    async create(input) {
      const data = readBrowserFile();
      const ts = nowIso();
      const profile: Profile = { id: newId(), createdAt: ts, updatedAt: ts, ...input };
      data.profiles = [...data.profiles, profile];
      writeBrowserFile(data);
      return profile;
    },
    async update(id, patch) {
      const data = readBrowserFile();
      const idx = data.profiles.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Profile not found: ${id}`);
      const updated: Profile = { ...data.profiles[idx], ...patch, updatedAt: nowIso() };
      data.profiles = data.profiles.map((p, i) => (i === idx ? updated : p));
      writeBrowserFile(data);
      return updated;
    },
    async remove(id) {
      const data = readBrowserFile();
      const idx = data.profiles.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Profile not found: ${id}`);
      const ts = nowIso();
      data.profiles = data.profiles.map((p, i) => (i === idx ? { ...p, deletedAt: ts, updatedAt: ts } : p));
      writeBrowserFile(data);
    },
    async upsert(profile) {
      const data = readBrowserFile();
      const idx = data.profiles.findIndex((p) => p.id === profile.id);
      if (idx === -1) {
        data.profiles = [...data.profiles, profile];
      } else {
        data.profiles = data.profiles.map((p, i) => (i === idx ? profile : p));
      }
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
  };
}

export function createProfileStorage(): ProfileStorage {
  return isTauri() ? createFileStorage() : createBrowserStorage();
}
