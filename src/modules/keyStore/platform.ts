import { invoke, isTauri } from '@tauri-apps/api/core';

let cached: string | null = null;

/** Target OS reported by the Rust backend ('android' | 'ios' | 'macos' | 'windows' | 'linux'), or 'web'. */
export async function appPlatform(): Promise<string> {
  if (!isTauri()) return 'web';
  if (cached === null) cached = await invoke<string>('app_platform');
  return cached;
}

export async function isMobilePlatform(): Promise<boolean> {
  const p = await appPlatform();
  return p === 'android' || p === 'ios';
}
