import { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile } from '../profiles/types';
import { friendlyError, categorizeSshError } from './errors';
import type { TofuState } from './types';
import {
  sshConnect,
  sshDisconnect,
  sshResize,
  sshSendInput,
  sshStartOutput,
  sshSubscribeClosed,
  sshSubscribeOutput,
  sshTrustHostKey,
  sshRejectHostKey,
} from './client';

export type SshState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

export function useSshSession(profile: Profile | null) {
  const [state, setState] = useState<SshState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tofu, setTofu] = useState<TofuState | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const outputHandlerRef = useRef<((data: Uint8Array) => void) | null>(null);
  const unlistenRef = useRef<(() => void)[]>([]);
  const onConnectedRef = useRef<((fingerprint: string) => void) | null>(null);
  const onErrorRef = useRef<((category: string) => void) | null>(null);
  const onClosedRef = useRef<(() => void) | null>(null);

  const cleanupListeners = useCallback(() => {
    for (const unlisten of unlistenRef.current) unlisten();
    unlistenRef.current = [];
  }, []);

  const connect = useCallback(
    async (cols: number, rows: number) => {
      if (!profile || sessionIdRef.current) return;
      setState('connecting');
      setError(null);
      setTofu(null);
      try {
        const outcome = await sshConnect({
          host: profile.host,
          port: profile.port,
          username: profile.username,
          auth: profile.auth,
          initialCols: cols,
          initialRows: rows,
        });

        const { sessionId, fingerprint } = outcome;
        sessionIdRef.current = sessionId;

        const unlistenData = await sshSubscribeOutput(sessionId, (data) => {
          outputHandlerRef.current?.(data);
        });
        const unlistenClosed = await sshSubscribeClosed(sessionId, () => {
          setState('closed');
          setTofu(null);
          cleanupListeners();
          sessionIdRef.current = null;
          // The remote side closed the channel (e.g. the user typed `exit`).
          // Manual disconnect unlistens first, so this only fires on a real exit.
          onClosedRef.current?.();
        });
        unlistenRef.current = [unlistenData, unlistenClosed];
        // Both listeners are registered — now it's safe to start the output pump.
        // This prevents a race where Tauri events are emitted before listen() completes.
        await sshStartOutput(sessionId);

        if (outcome.type === 'newHostKey') {
          setTofu({
            fingerprint,
            host: profile.host,
            port: profile.port,
            trust: async () => {
              await sshTrustHostKey(profile.host, profile.port, fingerprint);
              setTofu(null);
              onConnectedRef.current?.(fingerprint);
            },
            reject: async () => {
              cleanupListeners();
              sessionIdRef.current = null;
              await sshRejectHostKey(sessionId);
              setState('idle');
              setTofu(null);
            },
          });
          setState('connected');
        } else {
          setState('connected');
          onConnectedRef.current?.(fingerprint);
        }
      } catch (e) {
        const msg = friendlyError(e);
        setError(msg);
        setState('error');
        sessionIdRef.current = null;
        cleanupListeners();
        onErrorRef.current?.(categorizeSshError(String(e)));
      }
    },
    [cleanupListeners, profile],
  );

  const send = useCallback(async (data: string) => {
    if (!sessionIdRef.current) return;
    await sshSendInput(sessionIdRef.current, new TextEncoder().encode(data));
  }, []);

  const resize = useCallback(async (cols: number, rows: number) => {
    if (!sessionIdRef.current) return;
    await sshResize(sessionIdRef.current, cols, rows);
  }, []);

  const disconnect = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    sessionIdRef.current = null;
    cleanupListeners();
    setTofu(null);
    await sshDisconnect(sessionId);
    setState('closed');
  }, [cleanupListeners]);

  const setOutputHandler = useCallback((handler: (data: Uint8Array) => void) => {
    outputHandlerRef.current = handler;
  }, []);

  const setOnConnected = useCallback((cb: (fingerprint: string) => void) => {
    onConnectedRef.current = cb;
  }, []);

  const setOnError = useCallback((cb: (category: string) => void) => {
    onErrorRef.current = cb;
  }, []);

  const setOnClosed = useCallback((cb: () => void) => {
    onClosedRef.current = cb;
  }, []);

  useEffect(() => {
    return () => {
      cleanupListeners();
      const sessionId = sessionIdRef.current;
      if (sessionId) sshDisconnect(sessionId).catch(() => {});
    };
  }, [cleanupListeners]);

  return {
    state,
    error,
    tofu,
    connect,
    send,
    resize,
    disconnect,
    setOutputHandler,
    setOnConnected,
    setOnError,
    setOnClosed,
  };
}

