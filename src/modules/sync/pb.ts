import PocketBase from 'pocketbase';

const PB_URL = 'https://ucwflsl8hfjkydhjttxmp5uk.dev.isntlab.de';

export const pb = new PocketBase(PB_URL);

export type PbUser = {
  id: string;
  email: string;
  kdf_salt: string;
};

export type PbProfileRecord = {
  id: string;
  profile_id: string;
  blob: string;
  nonce: string;
  schema_version: number;
  device_id: string;
  client_revision: number;
  updated: string;
};
