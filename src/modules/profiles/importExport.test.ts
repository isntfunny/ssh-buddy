import { describe, it, expect } from 'vitest';
import { exportProfilesToJson, parseProfilesImport } from './importExport';
import type { Profile } from './types';
import { SCHEMA_VERSION } from './types';

const now = new Date().toISOString();

const sampleProfiles: Profile[] = [
  {
    id: 'p1',
    name: 'Test',
    host: 'example.com',
    port: 22,
    username: 'admin',
    auth: { kind: 'password', password: 'secret' },
    createdAt: now,
    updatedAt: now,
  },
];

describe('exportProfilesToJson', () => {
  it('produces valid JSON with schemaVersion', () => {
    const json = exportProfilesToJson(sampleProfiles);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.profiles).toHaveLength(1);
    expect(parsed.profiles[0].name).toBe('Test');
  });
});

describe('parseProfilesImport', () => {
  it('parses a valid export JSON', () => {
    const json = exportProfilesToJson(sampleProfiles);
    const profiles = parseProfilesImport(json);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Test');
  });

  it('throws on wrong schema version', () => {
    const json = JSON.stringify({ schemaVersion: 999, profiles: [] });
    expect(() => parseProfilesImport(json)).toThrow('Unsupported schema version');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseProfilesImport('not-json')).toThrow();
  });

  it('throws when profiles field is missing', () => {
    const json = JSON.stringify({ schemaVersion: SCHEMA_VERSION });
    expect(() => parseProfilesImport(json)).toThrow('Missing profiles array');
  });
});
