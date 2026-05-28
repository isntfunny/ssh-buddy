import { isTauri } from '@tauri-apps/api/core';
import { clearKeyNative, loadKeyNative, storeKeyNative } from './native';
import {
  clearKeyMobile,
  isBiometricAvailableMobile,
  loadKeyMobile,
  storeKeyMobile,
} from './mobile';
import { clearKeyWeb, isBiometricAvailableWeb, loadKeyWeb, storeKeyWeb } from './web';
import { isMobilePlatform } from './platform';

export async function storeKey(key: Uint8Array): Promise<void> {
  if (!isTauri()) return storeKeyWeb(key);
  if (await isMobilePlatform()) return storeKeyMobile(key);
  return storeKeyNative(key);
}

export async function loadKey(): Promise<Uint8Array | null> {
  if (!isTauri()) return loadKeyWeb();
  if (await isMobilePlatform()) return loadKeyMobile();
  return loadKeyNative();
}

export async function clearKey(): Promise<void> {
  if (!isTauri()) return clearKeyWeb();
  if (await isMobilePlatform()) return clearKeyMobile();
  return clearKeyNative();
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!isTauri()) return isBiometricAvailableWeb();
  if (await isMobilePlatform()) return isBiometricAvailableMobile();
  return true; // desktop OS keychain — always available, no prompt
}
