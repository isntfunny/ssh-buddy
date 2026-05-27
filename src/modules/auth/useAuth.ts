import { useCallback, useEffect, useState } from 'react';
import { initCrypto, deriveKey, generateSalt } from '../crypto';
import { loadKey, storeKey, clearKey, isBiometricAvailable } from '../keyStore';
import { pb, type PbUser } from '../sync/pb';

export type AuthState = 'not-configured' | 'locked' | 'unlocked';

export function useAuth() {
  const [state, setState] = useState<AuthState>('not-configured');
  const [key, setKey] = useState<Uint8Array | null>(null);
  const [user, setUser] = useState<PbUser | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    void (async () => {
      await initCrypto();
      setBiometricAvailable(await isBiometricAvailable());

      if (pb.authStore.isValid && pb.authStore.record) {
        const stored = await loadKey();
        if (stored) {
          setKey(stored);
          setUser(pb.authStore.record as unknown as PbUser);
          setState('unlocked');
        } else {
          setUser(pb.authStore.record as unknown as PbUser);
          setState('locked');
        }
      } else {
        setState('not-configured');
      }
    })();
  }, []);

  const signUp = useCallback(
    async (email: string, pbPassword: string, masterPassword: string) => {
      const salt = generateSalt();
      const saltB64 = btoa(String.fromCharCode(...salt));
      await pb.collection('users').create({
        email,
        password: pbPassword,
        passwordConfirm: pbPassword,
        kdf_salt: saltB64,
      });
      await pb.collection('users').authWithPassword(email, pbPassword);
      const u = pb.authStore.record as unknown as PbUser;
      setUser(u);
      const derived = await deriveKey(masterPassword, salt);
      setKey(derived);
      setState('unlocked');
    },
    [],
  );

  const signIn = useCallback(
    async (email: string, pbPassword: string, masterPassword: string) => {
      await pb.collection('users').authWithPassword(email, pbPassword);
      const u = pb.authStore.record as unknown as PbUser;
      setUser(u);
      const saltBytes = Uint8Array.from(atob(u.kdf_salt), (c) => c.charCodeAt(0));
      const derived = await deriveKey(masterPassword, saltBytes);
      setKey(derived);
      setState('unlocked');
    },
    [],
  );

  const unlock = useCallback(
    async (masterPassword: string) => {
      if (!user) throw new Error('Not signed in');
      const saltBytes = Uint8Array.from(atob(user.kdf_salt), (c) => c.charCodeAt(0));
      const derived = await deriveKey(masterPassword, saltBytes);
      setKey(derived);
      setState('unlocked');
    },
    [user],
  );

  const unlockBiometric = useCallback(async () => {
    const stored = await loadKey();
    if (!stored) throw new Error('No stored key — set up biometric first');
    setKey(stored);
    setState('unlocked');
  }, []);

  const rememberKey = useCallback(
    async (remember: boolean) => {
      if (!key) return;
      if (remember) await storeKey(key);
    },
    [key],
  );

  const signOut = useCallback(async () => {
    await clearKey();
    pb.authStore.clear();
    setKey(null);
    setUser(null);
    setState('not-configured');
  }, []);

  return {
    state,
    key,
    user,
    biometricAvailable,
    signUp,
    signIn,
    unlock,
    unlockBiometric,
    rememberKey,
    signOut,
  };
}
