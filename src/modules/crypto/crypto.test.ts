import { describe, it, expect, beforeAll } from 'vitest';
import { initCrypto, deriveKey, encryptBlob, decryptBlob, generateSalt } from './index';

beforeAll(async () => {
  await initCrypto();
});

describe('deriveKey', () => {
  it('is deterministic given same password and salt', async () => {
    const salt = generateSalt();
    const k1 = await deriveKey('my-password', salt);
    const k2 = await deriveKey('my-password', salt);
    expect(k1).toEqual(k2);
  });

  it('produces different keys for different passwords', async () => {
    const salt = generateSalt();
    const k1 = await deriveKey('password-a', salt);
    const k2 = await deriveKey('password-b', salt);
    expect(k1).not.toEqual(k2);
  });

  it('produces different keys for different salts', async () => {
    const k1 = await deriveKey('same', generateSalt());
    const k2 = await deriveKey('same', generateSalt());
    expect(k1).not.toEqual(k2);
  });

  it('returns 32 bytes', async () => {
    const k = await deriveKey('pw', generateSalt());
    expect(k.length).toBe(32);
  });
});

describe('encryptBlob / decryptBlob', () => {
  it('round-trips correctly', async () => {
    const key = await deriveKey('test', generateSalt());
    const plain = JSON.stringify({ id: '123', name: 'my server' });
    const { ciphertext, nonce } = encryptBlob(key, plain);
    const decrypted = decryptBlob(key, ciphertext, nonce);
    expect(decrypted).toBe(plain);
  });

  it('throws with wrong key', async () => {
    const key = await deriveKey('correct', generateSalt());
    const wrongKey = await deriveKey('wrong', generateSalt());
    const { ciphertext, nonce } = encryptBlob(key, 'secret');
    expect(() => decryptBlob(wrongKey, ciphertext, nonce)).toThrow();
  });

  it('produces different ciphertexts for same plaintext (fresh nonce)', async () => {
    const key = await deriveKey('pw', generateSalt());
    const r1 = encryptBlob(key, 'same text');
    const r2 = encryptBlob(key, 'same text');
    expect(r1.ciphertext).not.toBe(r2.ciphertext);
  });
});

describe('generateSalt', () => {
  it('returns 16 bytes', () => {
    expect(generateSalt().length).toBe(16);
  });

  it('returns different values each call', () => {
    expect(generateSalt()).not.toEqual(generateSalt());
  });
});
