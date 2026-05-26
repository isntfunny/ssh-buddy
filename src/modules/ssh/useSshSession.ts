import { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile } from '../profiles/types';
import {
  sshConnect,
  sshDisconnect,
  sshResize,
  sshSendInput,
  sshSubscribeClosed,
  sshSubscribeOutput,
} from './client';

export type SshState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

function friendlyError(error: unknown): string {
  const msg = String(error);
  if (msg.includes('Authentication failed')) {
    return 'Authentication failed - check the username, password, or key.';
  }
  if (msg.toLowerCase().includes('connection refused')) {
    return 'Connection refused - is the SSH server reachable on that host:port?';
  }
  if (msg.includes('Web SSH proxy is unreachable')) {
    return 'Web SSH proxy is unreachable - start backend/ws-ssh-proxy on port 8080 or set VITE_SSH_BUDDY_WS_PROXY_URL.';
  }
  return msg;
}

export function useSshSession(profile: Profile | null) {
  const [state, setState] = useState<SshState>('idle');
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const outputHandlerRef = useRef<((data: Uint8Array) => void) | null>(null);
  const unlistenRef = useRef<(() => void)[]>([]);

  const cleanupListeners = useCallback(() => {
    for (const unlisten of unlistenRef.current) {
      unlisten();
    }
    unlistenRef.current = [];
  }, []);

  const connect = useCallback(
    async (cols: number, rows: number) => {
      if (!profile || sessionIdRef.current) return;
      setState('connecting');
      setError(null);
      try {
        const id = await sshConnect({
          host: profile.host,
          port: profile.port,
          username: profile.username,
          auth: profile.auth,
          initialCols: cols,
          initialRows: rows,
        });
        sessionIdRef.current = id;

        const unlistenData = await sshSubscribeOutput(id, (data) => {
          outputHandlerRef.current?.(data);
        });
        const unlistenClosed = await sshSubscribeClosed(id, () => {
          setState('closed');
          cleanupListeners();
          sessionIdRef.current = null;
        });
        unlistenRef.current = [unlistenData, unlistenClosed];
        setState('connected');
      } catch (e) {
        setError(friendlyError(e));
        setState('error');
        sessionIdRef.current = null;
        cleanupListeners();
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
    await sshDisconnect(sessionId);
    setState('closed');
  }, [cleanupListeners]);

  const setOutputHandler = useCallback((handler: (data: Uint8Array) => void) => {
    outputHandlerRef.current = handler;
  }, []);

  useEffect(() => {
    return () => {
      cleanupListeners();
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        sshDisconnect(sessionId).catch(() => {});
      }
    };
  }, [cleanupListeners]);

  return { state, error, connect, send, resize, disconnect, setOutputHandler };
}
