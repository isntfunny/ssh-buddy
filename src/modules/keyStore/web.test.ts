import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { loadKeyWeb, storeKeyWeb } from './web';

function prfBytes(): Uint8Array {
  return new Uint8Array(32).fill(7);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('web key store', () => {
  it('passes WebAuthn PRF input as ArrayBuffer and round-trips the wrapped key', async () => {
    vi.mocked(startRegistration).mockResolvedValue({
      id: 'cred-id',
      rawId: 'cred-id',
      response: { attestationObject: '', clientDataJSON: '' },
      type: 'public-key',
      clientExtensionResults: { prf: { results: { first: prfBytes().buffer } } },
    } as Awaited<ReturnType<typeof startRegistration>>);
    vi.mocked(startAuthentication).mockResolvedValue({
      id: 'cred-id',
      rawId: 'cred-id',
      response: { authenticatorData: '', clientDataJSON: '', signature: '' },
      type: 'public-key',
      clientExtensionResults: { prf: { results: { first: prfBytes().buffer } } },
    } as Awaited<ReturnType<typeof startAuthentication>>);

    const key = new Uint8Array(32).fill(3);
    await storeKeyWeb(key);

    const registrationArgs = vi.mocked(startRegistration).mock.calls[0][0];
    const extensions = registrationArgs.optionsJSON.extensions as Record<string, unknown>;
    const prf = extensions.prf as { eval?: { first?: unknown } };
    expect(ArrayBuffer.isView(prf.eval?.first)).toBe(true);

    await expect(loadKeyWeb()).resolves.toEqual(key);
  });
});
