import { isTauri } from '@tauri-apps/api/core';
import { command, subscribe } from '../../lib/tauri';
import type { ConnectOutcome, ConnectRequest, OutputEvent } from './types';

type WebSession = {
  socket: WebSocket;
  outputHandlers: Set<(data: Uint8Array) => void>;
  closedHandlers: Set<() => void>;
};

const webSessions = new Map<string, WebSession>();

export async function sshConnect(req: ConnectRequest): Promise<ConnectOutcome> {
  if (!isTauri()) return webSshConnect(req);
  return command<ConnectOutcome>('ssh_connect', { request: req });
}

export async function sshSendInput(sessionId: string, data: Uint8Array): Promise<void> {
  if (!isTauri()) {
    const session = requireWebSession(sessionId);
    session.socket.send(data);
    return;
  }
  return command('ssh_send_input', { sessionId, data: Array.from(data) });
}

export async function sshResize(sessionId: string, cols: number, rows: number): Promise<void> {
  if (!isTauri()) {
    const session = requireWebSession(sessionId);
    session.socket.send(JSON.stringify({ type: 'resize', cols, rows }));
    return;
  }
  return command('ssh_resize', { sessionId, cols, rows });
}

export async function sshDisconnect(sessionId: string): Promise<void> {
  if (!isTauri()) {
    const session = webSessions.get(sessionId);
    if (!session) return;
    session.socket.send(JSON.stringify({ type: 'disconnect' }));
    session.socket.close();
    webSessions.delete(sessionId);
    return;
  }
  return command('ssh_disconnect', { sessionId });
}

export async function sshSubscribeOutput(
  sessionId: string,
  handler: (data: Uint8Array) => void,
): Promise<() => void> {
  if (!isTauri()) {
    const session = requireWebSession(sessionId);
    session.outputHandlers.add(handler);
    return () => session.outputHandlers.delete(handler);
  }
  const unlisten = await subscribe<OutputEvent>(`ssh:output:${sessionId}`, (event) => {
    handler(new Uint8Array(event.bytes));
  });
  return unlisten;
}

export async function sshSubscribeClosed(
  sessionId: string,
  handler: () => void,
): Promise<() => void> {
  if (!isTauri()) {
    const session = requireWebSession(sessionId);
    session.closedHandlers.add(handler);
    return () => session.closedHandlers.delete(handler);
  }
  return subscribe<null>(`ssh:closed:${sessionId}`, handler);
}

function requireWebSession(sessionId: string): WebSession {
  const session = webSessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  return session;
}

function webSshConnect(req: ConnectRequest): Promise<ConnectOutcome> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(proxyUrl());
    socket.binaryType = 'arraybuffer';

    let connected = false;
    let sessionId: string | null = null;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'connect', request: req }));
    };

    socket.onerror = () => {
      reject(new Error('Web SSH proxy is unreachable. Start backend/ws-ssh-proxy or set VITE_SSH_BUDDY_WS_PROXY_URL.'));
    };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data) as {
          type: 'connected' | 'closed' | 'error';
          sessionId?: string;
          message?: string;
        };

        if (message.type === 'connected' && message.sessionId) {
          connected = true;
          sessionId = message.sessionId;
          webSessions.set(sessionId, {
            socket,
            outputHandlers: new Set(),
            closedHandlers: new Set(),
          });
          resolve({ type: 'connected', sessionId, fingerprint: 'proxy-verified' });
          return;
        }

        if (message.type === 'error') {
          reject(new Error(message.message ?? 'Web SSH proxy returned an error.'));
          return;
        }

        if (message.type === 'closed' && sessionId) {
          const session = webSessions.get(sessionId);
          for (const handler of session?.closedHandlers ?? []) handler();
          webSessions.delete(sessionId);
        }
        return;
      }

      if (!sessionId) return;
      const session = webSessions.get(sessionId);
      if (!session) return;
      const data = new Uint8Array(event.data as ArrayBuffer);
      for (const handler of session.outputHandlers) handler(data);
    };

    socket.onclose = () => {
      if (!connected) {
        reject(new Error('Web SSH proxy connection closed before SSH was ready.'));
        return;
      }
      if (!sessionId) return;
      const session = webSessions.get(sessionId);
      for (const handler of session?.closedHandlers ?? []) handler();
      webSessions.delete(sessionId);
    };
  });
}

export function proxyUrl(): string {
  const configured = import.meta.env.VITE_SSH_BUDDY_WS_PROXY_URL as string | undefined;
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ssh`;
}

export async function sshStartOutput(sessionId: string): Promise<void> {
  if (!isTauri()) return; // web sessions: pump is wired via WebSocket onmessage already
  return command('ssh_start_output', { sessionId });
}

export async function sshTrustHostKey(
  host: string,
  port: number,
  fingerprint: string,
): Promise<void> {
  if (!isTauri()) return; // Browser: no-op — proxy handles host key verification
  return command('ssh_trust_host_key', { host, port, fingerprint });
}

export async function sshRejectHostKey(sessionId: string): Promise<void> {
  if (!isTauri()) {
    const session = webSessions.get(sessionId);
    if (session) {
      session.socket.send(JSON.stringify({ type: 'disconnect' }));
      session.socket.close();
      webSessions.delete(sessionId);
    }
    return;
  }
  return command('ssh_reject_host_key', { sessionId });
}
