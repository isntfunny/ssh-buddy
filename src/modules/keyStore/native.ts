import { invoke } from '@tauri-apps/api/core';

export async function storeKeyNative(key: Uint8Array): Promise<void> {
  await invoke('storage_store_key', { key: Array.from(key) });
}

export async function loadKeyNative(): Promise<Uint8Array | null> {
  const result = await invoke<number[] | null>('storage_load_key', {});
  return result ? new Uint8Array(result) : null;
}

export async function clearKeyNative(): Promise<void> {
  await invoke('storage_clear_key', {});
}
