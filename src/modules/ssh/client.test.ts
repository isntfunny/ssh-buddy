import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock('../../lib/tauri', () => ({
  command: vi.fn(),
  subscribe: vi.fn(),
}));

import * as tauriCore from '@tauri-apps/api/core';
import * as tauriLib from '../../lib/tauri';
import { sshConnect, sshDisconnect, sshResize, sshSendInput, sshStartOutput } from './client';

const mockReq = {
  host: 'localhost',
  port: 22,
  username: 'user',
  auth: { kind: 'password' as const, password: 'pw' },
  initialCols: 80,
  initialRows: 24,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('sshConnect — transport selection', () => {
  it('calls Tauri command when isTauri() is true', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(true);
    // Returns the ConnectOutcome shape that will exist after Task 4-5 update the Rust command.
    vi.mocked(tauriLib.command).mockResolvedValue({ type: 'connected', sessionId: 'abc', fingerprint: 'fp' });

    const result = await sshConnect(mockReq);

    expect(tauriLib.command).toHaveBeenCalledWith('ssh_connect', { request: mockReq });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).sessionId).toBe('abc');
  });

  it('does NOT call Tauri command when isTauri() is false', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(false);

    // Stub WebSocket so sshConnect can be called without a real network connection.
    const mockWs = {
      binaryType: '' as BinaryType,
      send: vi.fn(),
      close: vi.fn(),
      onopen: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      onmessage: null as ((ev: MessageEvent) => void) | null,
      onclose: null as ((ev: CloseEvent) => void) | null,
    };
    vi.stubGlobal('WebSocket', vi.fn(() => mockWs));

    // Start the connection (won't resolve — waiting for WS messages).
    const connectPromise = sshConnect(mockReq);

    // Key assertion: isTauri() was false so the Tauri command path was not taken.
    expect(tauriLib.command).not.toHaveBeenCalled();

    // Trigger proxy error to clean up the dangling promise.
    mockWs.onerror?.(new Event('error'));
    await connectPromise.catch(() => {});
  });
});

describe('native SSH command args', () => {
  it('passes camelCase arg keys (Tauri maps them to the Rust snake_case params)', async () => {
    vi.mocked(tauriCore.isTauri).mockReturnValue(true);
    vi.mocked(tauriLib.command).mockResolvedValue(undefined);

    await sshStartOutput('abc');
    await sshSendInput('abc', new Uint8Array([1, 2]));
    await sshResize('abc', 120, 40);
    await sshDisconnect('abc');

    expect(tauriLib.command).toHaveBeenCalledWith('ssh_start_output', { sessionId: 'abc' });
    expect(tauriLib.command).toHaveBeenCalledWith('ssh_send_input', { sessionId: 'abc', data: [1, 2] });
    expect(tauriLib.command).toHaveBeenCalledWith('ssh_resize', { sessionId: 'abc', cols: 120, rows: 40 });
    expect(tauriLib.command).toHaveBeenCalledWith('ssh_disconnect', { sessionId: 'abc' });
  });
});
