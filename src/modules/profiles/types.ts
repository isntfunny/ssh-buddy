export type Snippet = {
  label: string;
  command: string;
};

export type AuthMethod =
  | { kind: 'password'; password: string }
  | { kind: 'privateKey'; pem: string; passphrase?: string };

export type ConnectionEvent = {
  id: string;
  at: string; // ISO timestamp
  outcome: 'connected' | 'error';
  errorCategory?: string;
  hostKeyFingerprint?: string;
  deviceId: string;
};

export type Profile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  notes?: string;
  color?: string;
  // Schema v1 extensions
  tags?: string[];
  snippets?: Snippet[];
  envVars?: Record<string, string>;
  jumpHostId?: string | null;
  // Append-only connection log (union-merged, not part of conflict logic)
  history?: ConnectionEvent[];
  // Tombstone: when set, the profile is deleted but still syncs
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewProfileInput = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;

export const SCHEMA_VERSION = 1 as const;

export type ProfileStoreFile = {
  schemaVersion: typeof SCHEMA_VERSION;
  profiles: Profile[];
};
