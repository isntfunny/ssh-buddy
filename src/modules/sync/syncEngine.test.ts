import { describe, it, expect } from 'vitest';
import { unionMerge } from './syncEngine';
import type { Profile } from '../profiles/types';

function makeProfile(id: string, updatedAt: string, name = 'test'): Profile {
  return {
    id,
    name,
    host: 'localhost',
    port: 22,
    username: 'root',
    auth: { kind: 'password', password: 'pw' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  };
}

describe('unionMerge', () => {
  it('includes PB-only profiles', () => {
    const pb = [makeProfile('pb-1', '2026-01-02T00:00:00.000Z')];
    const local: Profile[] = [];
    const { merged } = unionMerge(pb, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('pb-1');
  });

  it('includes local-only profiles and marks them dirty', () => {
    const pb: Profile[] = [];
    const local = [makeProfile('local-1', '2026-01-02T00:00:00.000Z')];
    const { merged, dirtyIds } = unionMerge(pb, local);
    expect(merged).toHaveLength(1);
    expect(dirtyIds).toContain('local-1');
  });

  it('keeps PB version when PB is newer', () => {
    const pb = [makeProfile('x', '2026-01-03T00:00:00.000Z', 'pb-name')];
    const local = [makeProfile('x', '2026-01-01T00:00:00.000Z', 'local-name')];
    const { merged } = unionMerge(pb, local);
    expect(merged[0].name).toBe('pb-name');
  });

  it('keeps local version and marks dirty when local is newer', () => {
    const pb = [makeProfile('x', '2026-01-01T00:00:00.000Z', 'pb-name')];
    const local = [makeProfile('x', '2026-01-03T00:00:00.000Z', 'local-name')];
    const { merged, dirtyIds } = unionMerge(pb, local);
    expect(merged[0].name).toBe('local-name');
    expect(dirtyIds).toContain('x');
  });

  it('handles empty both sides', () => {
    const { merged, dirtyIds } = unionMerge([], []);
    expect(merged).toHaveLength(0);
    expect(dirtyIds).toHaveLength(0);
  });
});
