import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MosaicNode } from 'react-mosaic-component';
import { v4 as uuidv4 } from 'uuid';
import type { SshState } from '../ssh/useSshSession';
import { collectLeaves, insertSession, removeLeaf } from './mosaicTree';

export type SessionMeta = {
  profileId: string;
};

/** Imperative handles a session's view registers so tabs can act on it. */
export type SessionControls = {
  connect: () => void;
  disconnect: () => void;
  clear: () => void;
};

type WorkspaceContextType = {
  tree: MosaicNode<string> | null;
  sessions: Record<string, SessionMeta>;
  statuses: Record<string, SshState>;
  activeSessionId: string | null;
  addSession: (profileId: string) => void;
  changeTree: (tree: MosaicNode<string> | null) => void;
  closeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  reportStatus: (sessionId: string, state: SshState) => void;
  registerControls: (sessionId: string, controls: SessionControls) => void;
  unregisterControls: (sessionId: string) => void;
  getControls: (sessionId: string) => SessionControls | undefined;
};

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<MosaicNode<string> | null>(null);
  const [sessions, setSessions] = useState<Record<string, SessionMeta>>({});
  const [statuses, setStatuses] = useState<Record<string, SshState>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const controlsRef = useRef<Map<string, SessionControls>>(new Map());

  const addSession = useCallback(
    (profileId: string) => {
      const sessionId = uuidv4();
      setSessions((prev) => ({ ...prev, [sessionId]: { profileId } }));
      setTree((prev) => insertSession(prev, activeSessionId, sessionId));
      setActiveSessionId(sessionId);
    },
    [activeSessionId],
  );

  // Single funnel for every tree mutation (mosaic drag/resize/close + our closeSession).
  // Prunes session metadata + statuses for leaves that no longer exist.
  const changeTree = useCallback((next: MosaicNode<string> | null) => {
    const liveIds = new Set(collectLeaves(next));
    setTree(next);
    setSessions((prev) => {
      const pruned: Record<string, SessionMeta> = {};
      for (const id of Object.keys(prev)) if (liveIds.has(id)) pruned[id] = prev[id];
      return pruned;
    });
    setStatuses((prev) => {
      const pruned: Record<string, SshState> = {};
      for (const id of Object.keys(prev)) if (liveIds.has(id)) pruned[id] = prev[id];
      return pruned;
    });
    for (const id of controlsRef.current.keys()) {
      if (!liveIds.has(id)) controlsRef.current.delete(id);
    }
    setActiveSessionId((cur) => (cur && liveIds.has(cur) ? cur : ([...liveIds][0] ?? null)));
  }, []);

  const closeSession = useCallback((sessionId: string) => {
    setTree((prevTree) => {
      const next = removeLeaf(prevTree, sessionId);
      const liveIds = new Set(collectLeaves(next));
      setSessions((prev) => {
        const pruned: Record<string, SessionMeta> = {};
        for (const id of Object.keys(prev)) if (liveIds.has(id)) pruned[id] = prev[id];
        return pruned;
      });
      setStatuses((prev) => {
        const pruned: Record<string, SshState> = {};
        for (const id of Object.keys(prev)) if (liveIds.has(id)) pruned[id] = prev[id];
        return pruned;
      });
      for (const id of controlsRef.current.keys()) {
        if (!liveIds.has(id)) controlsRef.current.delete(id);
      }
      setActiveSessionId((cur) => (cur && liveIds.has(cur) ? cur : ([...liveIds][0] ?? null)));
      return next;
    });
  }, []);

  const setActiveSession = useCallback((sessionId: string) => setActiveSessionId(sessionId), []);

  const reportStatus = useCallback((sessionId: string, state: SshState) => {
    setStatuses((prev) => (prev[sessionId] === state ? prev : { ...prev, [sessionId]: state }));
  }, []);

  const registerControls = useCallback((sessionId: string, controls: SessionControls) => {
    controlsRef.current.set(sessionId, controls);
  }, []);

  const unregisterControls = useCallback((sessionId: string) => {
    controlsRef.current.delete(sessionId);
  }, []);

  const getControls = useCallback((sessionId: string) => controlsRef.current.get(sessionId), []);

  return (
    <WorkspaceContext.Provider
      value={{
        tree,
        sessions,
        statuses,
        activeSessionId,
        addSession,
        changeTree,
        closeSession,
        setActiveSession,
        reportStatus,
        registerControls,
        unregisterControls,
        getControls,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
