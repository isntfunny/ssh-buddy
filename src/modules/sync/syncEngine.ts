import { isTauri } from '@tauri-apps/api/core';
import { encryptBlob, decryptBlob } from '../crypto';
import type { Profile } from '../profiles/types';
import { createProfileStorage } from '../profiles/storage';
import { pb, type PbProfileRecord } from './pb';

function getDeviceId(): string {
  const key = 'ssh-buddy.device-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function unionMerge(
  pbProfiles: Profile[],
  localProfiles: Profile[],
): { merged: Profile[]; dirtyIds: string[] } {
  const result = new Map<string, Profile>();
  const dirtyIds: string[] = [];

  for (const p of pbProfiles) result.set(p.id, p);

  for (const local of localProfiles) {
    const remote = result.get(local.id);
    if (!remote) {
      result.set(local.id, local);
      dirtyIds.push(local.id);
    } else {
      const remoteTs = new Date(remote.updatedAt).getTime();
      const localTs = new Date(local.updatedAt).getTime();
      if (localTs > remoteTs) {
        result.set(local.id, local);
        dirtyIds.push(local.id);
      }
    }
  }

  return { merged: [...result.values()], dirtyIds };
}

async function fetchAndDecryptAll(key: Uint8Array): Promise<Profile[]> {
  const records = await pb.collection('profiles').getFullList<PbProfileRecord>({
    filter: `user = "${pb.authStore.record?.id}"`,
  });
  const profiles: Profile[] = [];
  for (const r of records) {
    try {
      const json = decryptBlob(key, r.blob, r.nonce);
      profiles.push(JSON.parse(json) as Profile);
    } catch {
      // Skip corrupted records
    }
  }
  return profiles;
}

async function pushProfile(key: Uint8Array, profile: Profile, revision: number): Promise<void> {
  const json = JSON.stringify(profile);
  const { ciphertext, nonce } = encryptBlob(key, json);
  const payload = {
    user: pb.authStore.record!.id,
    profile_id: profile.id,
    blob: ciphertext,
    nonce,
    schema_version: 1,
    device_id: getDeviceId(),
    client_revision: revision,
  };

  const existing = await pb
    .collection('profiles')
    .getFirstListItem<PbProfileRecord>(`profile_id = "${profile.id}"`)
    .catch(() => null);

  if (existing) {
    await pb.collection('profiles').update(existing.id, payload);
  } else {
    await pb.collection('profiles').create(payload);
  }
}

export async function syncAll(key: Uint8Array): Promise<void> {
  const storage = createProfileStorage();
  const [pbProfiles, localProfiles] = await Promise.all([
    fetchAndDecryptAll(key),
    storage.list(),
  ]);

  const { merged, dirtyIds } = unionMerge(pbProfiles, localProfiles);

  await Promise.all(merged.map((p) => storage.upsert(p)));

  const dirtySet = new Set(dirtyIds);
  await Promise.all(
    merged
      .filter((p) => dirtySet.has(p.id))
      .map((p) => pushProfile(key, p, 1).catch(console.error)),
  );

  const platform = isTauri() ? 'desktop' : 'web';
  const deviceId = getDeviceId();
  const existingDevice = await pb
    .collection('devices')
    .getFirstListItem(`device_id = "${deviceId}"`)
    .catch(() => null);

  const devicePayload = {
    user: pb.authStore.record!.id,
    name: navigator.userAgent.slice(0, 80),
    platform,
    last_seen_at: new Date().toISOString(),
  };

  if (existingDevice) {
    await pb.collection('devices').update(existingDevice.id, devicePayload).catch(console.error);
  } else {
    await pb.collection('devices').create({ ...devicePayload, device_id: deviceId }).catch(console.error);
  }
}

export function subscribeRealtime(
  key: Uint8Array,
  onUpdate: () => void,
): () => void {
  const storage = createProfileStorage();

  pb.collection('profiles').subscribe<PbProfileRecord>('*', async (event) => {
    if (event.action === 'delete') {
      await storage.remove(event.record.profile_id).catch(console.error);
    } else {
      try {
        const json = decryptBlob(key, event.record.blob, event.record.nonce);
        const profile = JSON.parse(json) as Profile;
        await storage.upsert(profile);
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
