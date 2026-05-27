import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../crypto', () => ({
  initCrypto: vi.fn().mockResolvedValue(undefined),
  deriveKey: vi.fn().mockResolvedValue(new Uint8Array(32).fill(1)),
  generateSalt: vi.fn().mockReturnValue(new Uint8Array(16).fill(2)),
}));
vi.mock('../keyStore', () => ({
  loadKey: vi.fn().mockResolvedValue(null),
  storeKey: vi.fn().mockResolvedValue(undefined),
  clearKey: vi.fn().mockResolvedValue(undefined),
  isBiometricAvailable: vi.fn().mockResolvedValue(false),
}));
vi.mock('../sync/pb', () => ({
  pb: {
    authStore: { isValid: false, record: null, clear: vi.fn() },
    collection: vi.fn().mockReturnValue({
      authWithPassword: vi.fn().mockResolvedValue({ record: { id: 'u1', kdf_salt: btoa('saltsaltsalt1234') } }),
      create: vi.fn().mockResolvedValue({ id: 'u1', kdf_salt: btoa('saltsaltsalt1234') }),
      update: vi.fn().mockResolvedValue({}),
    }),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';

beforeEach(() => vi.clearAllMocks());

describe('useAuth', () => {
  it('starts as not-configured when no stored key and not authenticated', async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.state).toBe('not-configured');
  });
});
