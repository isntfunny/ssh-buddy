export type Snippet = {
  label: string;
  command: string;
};

export type AuthMethod =
  | { kind: 'password'; password: string }
  | { kind: 'privateKey'; pem: string; passphrase?: string };

export type Profile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  notes?: string;
  // Schema v1 extensions
  tags?: string[];
  snippets?: Snippet[];
  envVars?: Record<string, string>;
  jumpHostId?: string | null;
  // Connection history (updated by the app after connect/error)
  lastConnectedAt?: string;
  lastHostKeyFingerprint?: string;
  lastErrorCategory?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewProfileInput = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;

export const SCHEMA_VERSION = 1 as const;

export type ProfileStoreFile = {
  schemaVersion: typeof SCHEMA_VERSION;
  profiles: Profile[];
};
