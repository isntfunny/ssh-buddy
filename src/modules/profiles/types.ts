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
  createdAt: string;
  updatedAt: string;
};

export type NewProfileInput = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;

export const SCHEMA_VERSION = 1 as const;

export type ProfileStoreFile = {
  schemaVersion: typeof SCHEMA_VERSION;
  profiles: Profile[];
};
