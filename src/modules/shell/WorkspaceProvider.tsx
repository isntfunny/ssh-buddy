import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createHtmlPortalNode, type HtmlPortalNode } from 'react-reverse-portal';
import type { DockviewApi } from 'dockview-react';
import type { SshState } from '../ssh/useSshSession';

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
  sessions: Record<string, SessionMeta>;
  statuses: Record<string, SshState>;
  activeSessionId: string | null;
  addSession: (profileId: string) => void;
  closeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  reportStatus: (sessionId: string, state: SshState) => void;
  registerControls: (sessionId: string, controls: SessionControls) => void;
  unregisterControls: (sessionId: string) => void;
  getControls: (sessionId: string) => SessionControls | undefined;
  /** Wire the dockview api once the layout is ready. */
  setApi: (api: DockviewApi) => void;
  /** Stable detached DOM node per session; backs the keep-alive portal. */
  getPortalNode: (sessionId: string) => HtmlPortalNode;
};

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

function pruneRecord<T>(record: Record<string, T>, live: Set<string>): Record<string, T> {
  const next: Record<string, T> = {};
  let changed = false;
  for (const id of Object.keys(record)) {
    if (live.has(id)) next[id] = record[id];
    else changed = true;
  }
  return changed ? next : record;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Record<string, SessionMeta>>({});
  const [statuses, setStatuses] = useState<Record<string, SshState>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const apiRef = useRef<DockviewApi | null>(null);
  const controlsRef = useRef<Map<string, SessionControls>>(new Map());
  const portalNodes = useRef<Map<string, HtmlPortalNode>>(new Map());
  const reconcileTimer = useRef<number | null>(null);

  const getPortalNode = useCallback((sessionId: string) => {
    let node = portalNodes.current.get(sessionId);
    if (!node) {
      node = createHtmlPortalNode({ attributes: { style: 'width:100%;height:100%;' } });
      portalNodes.current.set(sessionId, node);
    }
    return node;
  }, []);

  // dockview fires onDidRemovePanel during drags too (remove + re-add), so we never
  // prune on the raw event. Instead we reconcile against the settled panel set on the
  // next tick: a moved panel is back in api.panels by then, a closed one is gone.
  const queueReconcile = useCallback(() => {
    if (reconcileTimer.current != null) return;
    reconcileTimer.current = window.setTimeout(() => {
      reconcileTimer.current = null;
      const api = apiRef.current;
      if (!api) return;
      const live = new Set(api.panels.map((p) => p.id));
      setSessions((prev) => pruneRecord(prev, live));
      setStatuses((prev) => pruneRecord(prev, live));
      for (const id of [...controlsRef.current.keys()]) {
        if (!live.has(id)) controlsRef.current.delete(id);
      }
      for (const id of [...portalNodes.current.keys()]) {
        if (!live.has(id)) portalNodes.current.delete(id);
      }
    }, 0);
  }, []);

  const setApi = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api;
      api.onDidActivePanelChange((panel) => setActiveSessionId(panel?.id ?? null));
      api.onDidRemovePanel(() => queueReconcile());
    },
    [queueReconcile],
  );

  const addSession = useCallback(
    (profileId: string) => {
      const api = apiRef.current;
      if (!api) return;
      const sessionId = uuidv4();
      setSessions((prev) => ({ ...prev, [sessionId]: { profileId } }));
      getPortalNode(sessionId); // create the keep-alive node before the panel mounts
      api.addPanel({
        id: sessionId,
        component: 'session',
        tabComponent: 'session',
        params: { sessionId },
      });
    },
    [getPortalNode],
  );

  const closeSession = useCallback((sessionId: string) => {
    apiRef.current?.getPanel(sessionId)?.api.close();
  }, []);

  const setActiveSession = useCallback((sessionId: string) => {
    apiRef.current?.getPanel(sessionId)?.api.setActive();
  }, []);

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
        sessions,
        statuses,
        activeSessionId,
        addSession,
        closeSession,
        setActiveSession,
        reportStatus,
        registerControls,
        unregisterControls,
        getControls,
        setApi,
        getPortalNode,
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
