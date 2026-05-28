import { isTauri } from '@tauri-apps/api/core';
import { encryptBlob, decryptBlob } from '../crypto';
import type { Profile } from '../profiles/types';
import { createProfileStorage } from '../profiles/storage';
import { pb, type PbProfileRecord } from './pb';
import { planMerge, type RemoteProfile } from './planMerge';
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

export type SyncConflict = {
  profileId: string;
  local: Profile;
  remote: Profile;
  token: string;
  remoteDeviceName?: string;
};

async function fetchRemote(
  key: Uint8Array,
): Promise<{ profiles: RemoteProfile[]; recordByProfileId: Map<string, PbProfileRecord> }> {
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
  const existing =
    recordByProfileId.get(profile.id) ??
    (await pb
      .collection('profiles')
      .getFirstListItem<PbProfileRecord>(`profile_id = "${profile.id}"`)
      .catch(() => null));
  const saved = existing
    ? await pb.collection('profiles').update<PbProfileRecord>(existing.id, payload)
    : await pb.collection('profiles').create<PbProfileRecord>(payload);
  return saved.updated;
}

async function resolveDeviceName(deviceId: string): Promise<string | undefined> {
  const rec = await pb
    .collection('devices')
    .getFirstListItem<{ name: string }>(`device_id = "${deviceId}"`)
    .catch(() => null);
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

  const actions = planMerge(remoteProfiles, localProfiles, metaInitial, {
    syncHistory: settings.syncConnectionHistory,
  });
  let meta: SyncMeta = metaInitial;
  const conflicts: SyncConflict[] = [];

  for (const action of actions) {
    if (action.kind === 'take-remote') {
      await storage.upsert(action.profile);
      meta = clearAndSetToken(meta, action.profile.id, action.token);
    } else if (action.kind === 'push') {
      const profileToPush = settings.syncConnectionHistory
        ? action.profile
        : { ...action.profile, history: undefined };
      const token = await pushProfile(key, profileToPush, recordByProfileId);
      await storage.upsert(action.profile);
      meta = clearAndSetToken(meta, action.profile.id, token);
    } else {
      const record = recordByProfileId.get(action.remote.id);
      const remoteDeviceName = record ? await resolveDeviceName(record.device_id) : undefined;
      conflicts.push({
        profileId: action.remote.id,
        local: action.local,
        remote: action.remote,
        token: action.token,
        remoteDeviceName,
      });
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
  const existing = await pb
    .collection('devices')
    .getFirstListItem(`device_id = "${deviceId}"`)
    .catch(() => null);
  const payload = {
    user: pb.authStore.record!.id,
    name: navigator.userAgent.slice(0, 80),
    platform,
    last_seen_at: new Date().toISOString(),
  };
  if (existing) await pb.collection('devices').update(existing.id, payload).catch(console.error);
  else await pb.collection('devices').create({ ...payload, device_id: deviceId }).catch(console.error);
}

export function subscribeRealtime(key: Uint8Array, onUpdate: () => void): () => void {
  const storage = createProfileStorage();
  const ownDeviceId = getDeviceId();

  pb.collection('profiles')
    .subscribe<PbProfileRecord>('*', async (event) => {
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
    })
    .catch(console.error);

  return () => {
    pb.collection('profiles').unsubscribe('*').catch(console.error);
  };
}
