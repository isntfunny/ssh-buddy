import { newId } from '../../lib/id';
import type { ConnectionEvent } from './types';

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function makeEvent(
  fields: Omit<ConnectionEvent, 'id' | 'at'> & { at?: string },
): ConnectionEvent {
  const { at, ...rest } = fields;
  return { id: newId(), at: at ?? new Date().toISOString(), ...rest };
}

export function unionHistory(
  a: ConnectionEvent[] | undefined,
  b: ConnectionEvent[] | undefined,
): ConnectionEvent[] {
  const byId = new Map<string, ConnectionEvent>();
  for (const e of a ?? []) byId.set(e.id, e);
  for (const e of b ?? []) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) => y.at.localeCompare(x.at));
}

export function pruneHistory(
  events: ConnectionEvent[],
  now: number = Date.now(),
  maxAgeMs: number = MAX_AGE_MS,
): ConnectionEvent[] {
  return events.filter((e) => now - new Date(e.at).getTime() <= maxAgeMs);
}
