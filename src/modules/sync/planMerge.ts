import type { Profile } from '../profiles/types';
import { unionHistory } from '../profiles/connectionHistory';
import { isDirty, getToken, type SyncMeta } from './syncMeta';

export type RemoteProfile = { profile: Profile; token: string };

export type MergeAction =
  | { kind: 'take-remote'; profile: Profile; token: string }
  | { kind: 'push'; profile: Profile }
  | { kind: 'conflict'; local: Profile; remote: Profile; token: string };

function withHistory(
  base: Profile,
  local: Profile | undefined,
  remote: Profile | undefined,
  syncHistory: boolean,
): Profile {
  if (!syncHistory) return { ...base, history: local?.history ?? base.history };
  return { ...base, history: unionHistory(local?.history, remote?.history) };
}

export function planMerge(
  remote: RemoteProfile[],
  local: Profile[],
  meta: SyncMeta,
  opts: { syncHistory: boolean },
): MergeAction[] {
  const remoteById = new Map(remote.map((r) => [r.profile.id, r]));
  const localById = new Map(local.map((p) => [p.id, p]));
  const ids = new Set<string>([...remoteById.keys(), ...localById.keys()]);
  const actions: MergeAction[] = [];

  for (const id of ids) {
    const r = remoteById.get(id);
    const l = localById.get(id);

    if (r && !l) {
      actions.push({ kind: 'take-remote', profile: withHistory(r.profile, undefined, r.profile, opts.syncHistory), token: r.token });
    } else if (l && !r) {
      actions.push({ kind: 'push', profile: l });
    } else if (l && r) {
      if (!isDirty(meta, id)) {
        actions.push({ kind: 'take-remote', profile: withHistory(r.profile, l, r.profile, opts.syncHistory), token: r.token });
      } else if (r.token === getToken(meta, id)) {
        actions.push({ kind: 'push', profile: withHistory(l, l, r.profile, opts.syncHistory) });
      } else {
        actions.push({ kind: 'conflict', local: l, remote: r.profile, token: r.token });
      }
    }
  }

  return actions;
}
