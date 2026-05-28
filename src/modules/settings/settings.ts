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
