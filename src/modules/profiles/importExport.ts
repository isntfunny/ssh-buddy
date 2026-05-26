import type { Profile, ProfileStoreFile } from './types';
import { SCHEMA_VERSION } from './types';

export function exportProfilesToJson(profiles: Profile[]): string {
  const file: ProfileStoreFile = { schemaVersion: SCHEMA_VERSION, profiles };
  return JSON.stringify(file, null, 2);
}

export function parseProfilesImport(json: string): Profile[] {
  const parsed = JSON.parse(json) as Partial<ProfileStoreFile>;
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${String(parsed.schemaVersion)}`);
  }
  if (!Array.isArray(parsed.profiles)) {
    throw new Error('Missing profiles array in import file');
  }
  return parsed.profiles;
}

export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
