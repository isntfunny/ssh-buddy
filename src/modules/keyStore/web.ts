import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const IDB_WRAPPED_KEY = 'ssh-buddy.wrapped-key';
const IDB_CRED_ID = 'ssh-buddy.webauthn-cred-id';
const PRF_SALT = new TextEncoder().encode('ssh-buddy-prf-v1');

function toBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function fromBase64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new Uint8Array([...b].map((c) => c.charCodeAt(0)));
}

async function wrapWithPrf(masterKey: Uint8Array, prf: Uint8Array): Promise<ArrayBuffer> {
  const wrappingKey = await crypto.subtle.importKey('raw', prf, 'AES-KW', false, ['wrapKey']);
  const rawKey = await crypto.subtle.importKey('raw', masterKey, 'AES-GCM', true, ['encrypt']);
  return crypto.subtle.wrapKey('raw', rawKey, wrappingKey, 'AES-KW');
}

async function unwrapWithPrf(wrapped: ArrayBuffer, prf: Uint8Array): Promise<Uint8Array> {
  const wrappingKey = await crypto.subtle.importKey('raw', prf, 'AES-KW', false, ['unwrapKey']);
  const key = await crypto.subtle.unwrapKey(
    'raw', wrapped, wrappingKey, 'AES-KW',
    { name: 'AES-GCM', length: 256 }, true, ['encrypt'],
  );
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export async function isBiometricAvailableWeb(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

export async function storeKeyWeb(masterKey: Uint8Array): Promise<void> {
  const challenge = toBase64url(crypto.getRandomValues(new Uint8Array(32)));
  const userId = toBase64url(crypto.getRandomValues(new Uint8Array(16)));

  const reg = await startRegistration({
    optionsJSON: {
      challenge,
      rp: { name: 'ssh-buddy' },
      user: { id: userId, name: 'ssh-buddy-user', displayName: 'ssh-buddy' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60000,
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      extensions: { prf: { eval: { first: toBase64url(PRF_SALT) } } } as Record<string, unknown>,
    },
  });

  const prfFirst = (reg.clientExtensionResults as Record<string, unknown>)?.prf as Record<string, unknown>;
  const prfResultB64 = (prfFirst?.results as Record<string, string>)?.first;
  if (!prfResultB64) throw new Error('PRF not supported by this authenticator');

  const prf = fromBase64url(prfResultB64);
  const wrapped = await wrapWithPrf(masterKey, prf);

  await idbSet(IDB_CRED_ID, reg.id);
  await idbSet(IDB_WRAPPED_KEY, wrapped);
}

export async function loadKeyWeb(): Promise<Uint8Array | null> {
  const credId = await idbGet<string>(IDB_CRED_ID);
  const wrapped = await idbGet<ArrayBuffer>(IDB_WRAPPED_KEY);
  if (!credId || !wrapped) return null;

  const challenge = toBase64url(crypto.getRandomValues(new Uint8Array(32)));

  const auth = await startAuthentication({
    optionsJSON: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: credId }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: toBase64url(PRF_SALT) } } } as Record<string, unknown>,
    },
  });

  const prfFirst = (auth.clientExtensionResults as Record<string, unknown>)?.prf as Record<string, unknown>;
  const prfResultB64 = (prfFirst?.results as Record<string, string>)?.first;
  if (!prfResultB64) return null;

  const prf = fromBase64url(prfResultB64);
  return unwrapWithPrf(wrapped, prf);
}

export async function clearKeyWeb(): Promise<void> {
  await idbDel(IDB_WRAPPED_KEY);
  await idbDel(IDB_CRED_ID);
}
