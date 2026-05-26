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
