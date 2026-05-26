import { isTauri } from '@tauri-apps/api/core';
import { command, subscribe } from '../../lib/tauri';
import type { ConnectRequest, OutputEvent } from './types';

type WebSession = {
  socket: WebSocket;
  outputHandlers: Set<(data: Uint8Array) => void>;
  closedHandlers: Set<() => void>;
};

const webSessions = new Map<string, WebSession>();

export async function sshConnect(req: ConnectRequest): Promise<string> {
  if (!isTauri()) return webSshConnect(req);
  return command<string>('ssh_connect', { request: req });
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

function webSshConnect(req: ConnectRequest): Promise<string> {
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
          resolve(sessionId);
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

function proxyUrl(): string {
  const configured = import.meta.env.VITE_SSH_BUDDY_WS_PROXY_URL as string | undefined;
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:8080/ssh`;
}
