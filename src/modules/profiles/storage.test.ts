import { describe, it, expect, beforeEach } from 'vitest';
import type { NewProfileInput } from './types';
import { createInMemoryStorage } from './storage';

const baseInput: NewProfileInput = {
  name: 'Test server',
  host: 'example.com',
  port: 22,
  username: 'alice',
  auth: { kind: 'password', password: 'secret' },
};

describe('ProfileStorage (in-memory)', () => {
  let storage: ReturnType<typeof createInMemoryStorage>;

  beforeEach(() => {
    storage = createInMemoryStorage();
  });

  it('starts empty', async () => {
    expect(await storage.list()).toEqual([]);
  });

  it('creates a profile with generated id and timestamps', async () => {
    const created = await storage.create(baseInput);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.name).toBe('Test server');
    expect(new Date(created.createdAt).getTime()).not.toBeNaN();
    expect(created.updatedAt).toBe(created.createdAt);
  });

  it('lists created profiles', async () => {
    await storage.create(baseInput);
    await storage.create({ ...baseInput, name: 'Second' });
    const all = await storage.list();
    expect(all.map((p) => p.name).sort()).toEqual(['Second', 'Test server']);
  });

  it('updates a profile and bumps updatedAt', async () => {
    const created = await storage.create(baseInput);
    await new Promise((r) => setTimeout(r, 5));
    const updated = await storage.update(created.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
    expect(updated.id).toBe(created.id);
    expect(updated.updatedAt).not.toBe(created.updatedAt);
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it('throws when updating a missing profile', async () => {
    await expect(storage.update('does-not-exist', { name: 'x' })).rejects.toThrow();
  });

  it('removes a profile', async () => {
    const created = await storage.create(baseInput);
    await storage.remove(created.id);
    expect(await storage.list()).toEqual([]);
  });

  it('throws when removing a missing profile', async () => {
    await expect(storage.remove('does-not-exist')).rejects.toThrow();
  });

  it('round-trips a profile with schema v1 extensions', async () => {
    const storage = createInMemoryStorage();
    const created = await storage.create({
      name: 'ext',
      host: 'h',
      port: 22,
      username: 'u',
      auth: { kind: 'password', password: 'p' },
      tags: ['prod', 'web'],
      snippets: [{ label: 'uptime', command: 'uptime' }],
      envVars: { EDITOR: 'vim' },
      jumpHostId: null,
    });
    expect(created.tags).toEqual(['prod', 'web']);
    expect(created.snippets).toEqual([{ label: 'uptime', command: 'uptime' }]);
    expect(created.envVars).toEqual({ EDITOR: 'vim' });
    expect(created.jumpHostId).toBeNull();
  });

  it('stores and retrieves connection history fields', async () => {
    const storage = createInMemoryStorage();
    const now = new Date().toISOString();
    const created = await storage.create({
      name: 'hist',
      host: 'h',
      port: 22,
      username: 'u',
      auth: { kind: 'password', password: 'p' },
    });
    const updated = await storage.update(created.id, {
      lastConnectedAt: now,
      lastHostKeyFingerprint: 'SHA256:abc123',
      lastErrorCategory: 'auth_failed',
    });
    expect(updated.lastConnectedAt).toBe(now);
    expect(updated.lastHostKeyFingerprint).toBe('SHA256:abc123');
    expect(updated.lastErrorCategory).toBe('auth_failed');
  });
});
