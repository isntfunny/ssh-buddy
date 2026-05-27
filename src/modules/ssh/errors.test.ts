import { describe, it, expect } from 'vitest';
import { friendlyError, categorizeSshError } from './errors';

describe('ssh errors', () => {
  it('friendlyError maps common errors to clear messages', () => {
    expect(friendlyError('Error: Authentication failed (publickey)')).toBe('Authentication failed - check the username, password, or key.');
    expect(friendlyError('Error: Connection refused by server')).toBe('Connection refused - is the SSH server reachable on that host:port?');
    expect(friendlyError('Web SSH proxy is unreachable')).toBe('Web SSH proxy is unreachable - start backend/ws-ssh-proxy on port 8080 or set VITE_SSH_BUDDY_WS_PROXY_URL.');
    expect(friendlyError('Timeout connecting to host')).toBe('Timeout connecting to host.');
    expect(friendlyError('Host key changed for example.com')).toBe('Host key changed for example.com');
    expect(friendlyError('Some unknown error')).toBe('Some unknown error');
  });

  it('categorizeSshError categorizes errors', () => {
    expect(categorizeSshError('Authentication failed')).toBe('auth_failed');
    expect(categorizeSshError('Timeout connecting')).toBe('timeout');
    expect(categorizeSshError('host unreachable')).toBe('host_unreachable');
    expect(categorizeSshError('connection refused')).toBe('connection_refused');
    expect(categorizeSshError('Host key changed')).toBe('host_key_changed');
    expect(categorizeSshError('Web SSH proxy is unreachable')).toBe('proxy_unreachable');
    expect(categorizeSshError('unknown')).toBe('other');
  });
});
