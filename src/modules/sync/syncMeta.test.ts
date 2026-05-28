import { describe, it, expect } from 'vitest';
import { markDirty, clearAndSetToken, isDirty, getToken } from './syncMeta';
import type { SyncMeta } from './syncMeta';

describe('syncMeta pure ops', () => {
  it('markDirty sets dirty true, preserving token', () => {
    const m: SyncMeta = { a: { dirty: false, lastSyncedToken: 't1' } };
    const out = markDirty(m, 'a');
    expect(out.a.dirty).toBe(true);
    expect(out.a.lastSyncedToken).toBe('t1');
  });

  it('markDirty creates entry for unknown id', () => {
    const out = markDirty({}, 'new');
    expect(out.new).toEqual({ dirty: true, lastSyncedToken: '' });
  });

  it('clearAndSetToken clears dirty and stores token', () => {
    const m: SyncMeta = { a: { dirty: true, lastSyncedToken: 'old' } };
    const out = clearAndSetToken(m, 'a', 'new');
    expect(out.a).toEqual({ dirty: false, lastSyncedToken: 'new' });
  });

  it('isDirty / getToken read helpers', () => {
    const m: SyncMeta = { a: { dirty: true, lastSyncedToken: 'tok' } };
    expect(isDirty(m, 'a')).toBe(true);
    expect(isDirty(m, 'missing')).toBe(false);
    expect(getToken(m, 'a')).toBe('tok');
    expect(getToken(m, 'missing')).toBe('');
  });
});
