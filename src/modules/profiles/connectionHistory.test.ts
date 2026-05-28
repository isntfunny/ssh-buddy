import { describe, it, expect } from 'vitest';
import { makeEvent, unionHistory, pruneHistory } from './connectionHistory';
import type { ConnectionEvent } from './types';

const ev = (id: string, at: string): ConnectionEvent => ({
  id, at, outcome: 'connected', deviceId: 'dev-1',
});

describe('unionHistory', () => {
  it('dedupes by id and sorts newest first', () => {
    const a = [ev('1', '2026-01-01T00:00:00.000Z'), ev('2', '2026-01-03T00:00:00.000Z')];
    const b = [ev('2', '2026-01-03T00:00:00.000Z'), ev('3', '2026-01-02T00:00:00.000Z')];
    const out = unionHistory(a, b);
    expect(out.map((e) => e.id)).toEqual(['2', '3', '1']);
  });

  it('handles undefined inputs', () => {
    expect(unionHistory(undefined, undefined)).toEqual([]);
    expect(unionHistory([ev('1', '2026-01-01T00:00:00.000Z')], undefined).map((e) => e.id)).toEqual(['1']);
  });
});

describe('pruneHistory', () => {
  it('drops events older than 90 days', () => {
    const now = new Date('2026-05-01T00:00:00.000Z').getTime();
    const recent = ev('r', '2026-04-15T00:00:00.000Z');
    const old = ev('o', '2026-01-01T00:00:00.000Z');
    const out = pruneHistory([recent, old], now);
    expect(out.map((e) => e.id)).toEqual(['r']);
  });
});

describe('makeEvent', () => {
  it('creates an event with a uuid id and given fields', () => {
    const e = makeEvent({ outcome: 'error', errorCategory: 'auth', deviceId: 'd' });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e.outcome).toBe('error');
    expect(e.errorCategory).toBe('auth');
    expect(new Date(e.at).getTime()).not.toBeNaN();
  });
});
