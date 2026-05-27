import { isTauri } from '@tauri-apps/api/core';
import { clearKeyNative, loadKeyNative, storeKeyNative } from './native';
import { clearKeyWeb, isBiometricAvailableWeb, loadKeyWeb, storeKeyWeb } from './web';

export async function storeKey(key: Uint8Array): Promise<void> {
  if (isTauri()) return storeKeyNative(key);
  return storeKeyWeb(key);
}

export async function loadKey(): Promise<Uint8Array | null> {
  if (isTauri()) return loadKeyNative();
  return loadKeyWeb();
}

export async function clearKey(): Promise<void> {
  if (isTauri()) return clearKeyNative();
  return clearKeyWeb();
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (isTauri()) return true; // OS credential store always available on native
  return isBiometricAvailableWeb();
}
