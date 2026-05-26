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
