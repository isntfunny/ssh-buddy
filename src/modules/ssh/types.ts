import type { AuthMethod } from '../profiles/types';

export type ConnectRequest = {
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  initialCols: number;
  initialRows: number;
};

export type OutputEvent = {
  sessionId: string;
  bytes: number[];
};

export type ConnectOutcome =
  | { type: 'connected'; sessionId: string; fingerprint: string }
  | { type: 'newHostKey'; sessionId: string; fingerprint: string };

export type TofuState = {
  fingerprint: string;
  host: string;
  port: number;
  trust: () => Promise<void>;
  reject: () => Promise<void>;
};
