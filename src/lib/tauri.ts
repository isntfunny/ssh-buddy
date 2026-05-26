import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error('This action requires the Tauri desktop runtime.');
  }
  return invoke<T>(name, args ?? {});
}

export async function subscribe<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    throw new Error('This action requires the Tauri desktop runtime.');
  }
  return listen<T>(event, (e) => handler(e.payload));
}
