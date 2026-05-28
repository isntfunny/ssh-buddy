import { describe, it, expect } from 'vitest';
import { planMerge, type RemoteProfile } from './planMerge';
import type { SyncMeta } from './syncMeta';
import type { Profile } from '../profiles/types';

function prof(id: string, name = 'n', extra: Partial<Profile> = {}): Profile {
  return {
    id, name, host: 'h', port: 22, username: 'u',
    auth: { kind: 'password', password: 'p' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}
const remote = (p: Profile, token: string): RemoteProfile => ({ profile: p, token });

describe('planMerge', () => {
  it('remote-only → take-remote', () => {
    const out = planMerge([remote(prof('a'), 't1')], [], {}, { syncHistory: true });
    expect(out).toEqual([{ kind: 'take-remote', profile: { ...prof('a'), history: [] }, token: 't1' }]);
  });

  it('local-only → push', () => {
    const out = planMerge([], [prof('b')], {}, { syncHistory: true });
    expect(out[0].kind).toBe('push');
  });

  it('not dirty → take-remote even if content differs', () => {
    const meta: SyncMeta = { c: { dirty: false, lastSyncedToken: 't1' } };
    const out = planMerge([remote(prof('c', 'remote'), 't2')], [prof('c', 'local')], meta, { syncHistory: true });
    expect(out[0]).toMatchObject({ kind: 'take-remote', token: 't2' });
    expect((out[0] as { profile: Profile }).profile.name).toBe('remote');
  });

  it('dirty + token unchanged → push (fast-forward)', () => {
    const meta: SyncMeta = { d: { dirty: true, lastSyncedToken: 't1' } };
    const out = planMerge([remote(prof('d', 'remote'), 't1')], [prof('d', 'local')], meta, { syncHistory: true });
    expect(out[0]).toMatchObject({ kind: 'push' });
    expect((out[0] as { profile: Profile }).profile.name).toBe('local');
  });

  it('dirty + token changed → conflict', () => {
    const meta: SyncMeta = { e: { dirty: true, lastSyncedToken: 't1' } };
    const out = planMerge([remote(prof('e', 'remote'), 't2')], [prof('e', 'local')], meta, { syncHistory: true });
    expect(out[0]).toMatchObject({ kind: 'conflict', token: 't2' });
  });

  it('unions history into take-remote result when syncHistory on', () => {
    const meta: SyncMeta = { f: { dirty: false, lastSyncedToken: 't1' } };
    const local = prof('f', 'x', { history: [{ id: 'l1', at: '2026-02-01T00:00:00.000Z', outcome: 'connected', deviceId: 'd' }] });
    const rem = prof('f', 'x', { history: [{ id: 'r1', at: '2026-03-01T00:00:00.000Z', outcome: 'connected', deviceId: 'd' }] });
    const out = planMerge([remote(rem, 't2')], [local], meta, { syncHistory: true });
    const merged = (out[0] as { profile: Profile }).profile;
    expect(merged.history?.map((h) => h.id).sort()).toEqual(['l1', 'r1']);
  });

  it('keeps only local history when syncHistory off', () => {
    const meta: SyncMeta = { g: { dirty: false, lastSyncedToken: 't1' } };
    const local = prof('g', 'x', { history: [{ id: 'l1', at: '2026-02-01T00:00:00.000Z', outcome: 'connected', deviceId: 'd' }] });
    const rem = prof('g', 'x', { history: [{ id: 'r1', at: '2026-03-01T00:00:00.000Z', outcome: 'connected', deviceId: 'd' }] });
    const out = planMerge([remote(rem, 't2')], [local], meta, { syncHistory: false });
    const merged = (out[0] as { profile: Profile }).profile;
    expect(merged.history?.map((h) => h.id)).toEqual(['l1']);
  });
});
