import sodiumModule from 'libsodium-wrappers-sumo';

let sodium: typeof sodiumModule;

export async function initCrypto(): Promise<void> {
  await sodiumModule.ready;
  sodium = sodiumModule;
}

function getSodium(): typeof sodiumModule {
  if (!sodium) throw new Error('Call initCrypto() before using crypto functions');
  return sodium;
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const na = getSodium();
  return na.crypto_pwhash(
    32,
    password,
    salt,
    3,
    65536 * 1024, // 64 MiB
    na.crypto_pwhash_ALG_ARGON2ID13,
  );
}

export function encryptBlob(
  key: Uint8Array,
  plaintext: string,
): { ciphertext: string; nonce: string } {
  const na = getSodium();
  const nonce = na.randombytes_buf(na.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = na.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    null,
    null,
    nonce,
    key,
  );
  return {
    ciphertext: na.to_base64(ciphertext, na.base64_variants.ORIGINAL),
    nonce: na.to_base64(nonce, na.base64_variants.ORIGINAL),
  };
}

export function decryptBlob(key: Uint8Array, ciphertext: string, nonce: string): string {
  const na = getSodium();
  const plain = na.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    na.from_base64(ciphertext, na.base64_variants.ORIGINAL),
    null,
    na.from_base64(nonce, na.base64_variants.ORIGINAL),
    key,
  );
  return na.to_string(plain);
}

export function generateSalt(): Uint8Array {
  return getSodium().randombytes_buf(16);
}

export function generateNonce(): Uint8Array {
  const na = getSodium();
  return na.randombytes_buf(na.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
}
