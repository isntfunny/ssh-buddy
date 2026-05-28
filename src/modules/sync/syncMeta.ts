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
