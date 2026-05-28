import {
  setData,
  getData,
  hasData,
  removeData,
  checkStatus,
} from '@choochmeque/tauri-plugin-biometry-api';

// Stored in the hardware-backed Android Keystore / iOS Keychain; getData requires
// a biometric (fingerprint/face) prompt before the key is released.
const DOMAIN = 'dev.tecfriends.sshbuddy';
const NAME = 'master-key';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) ?? []);
}

export async function storeKeyMobile(key: Uint8Array): Promise<void> {
  await setData({ domain: DOMAIN, name: NAME, data: toHex(key) });
}

export async function loadKeyMobile(): Promise<Uint8Array | null> {
  try {
    if (!(await hasData({ domain: DOMAIN, name: NAME }))) return null;
    const res = await getData({ domain: DOMAIN, name: NAME, reason: 'ssh-buddy entsperren' });
    return fromHex(res.data);
  } catch {
    // Biometric cancelled/failed — fall back to master-password entry.
    return null;
  }
}

export async function clearKeyMobile(): Promise<void> {
  await removeData({ domain: DOMAIN, name: NAME });
}

export async function isBiometricAvailableMobile(): Promise<boolean> {
  try {
    return (await checkStatus()).isAvailable;
  } catch {
    return false;
  }
}
