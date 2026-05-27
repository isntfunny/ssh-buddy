import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import {
  createBalancedTreeFromLeaves,
  getLeaves,
  type MosaicNode,
} from 'react-mosaic-component';
import { v4 as uuidv4 } from 'uuid';

export const MAX_PANES = 4;

export type WorkspaceSession = {
  id: string; // The tab id
  profileId: string;
};

export type PaneData = {
  id: string;
  sessions: WorkspaceSession[];
  activeSessionId: string | null;
};

type WorkspaceContextType = {
  panes: Record<string, PaneData>;
  mosaicTree: MosaicNode<string> | null;
  activePaneId: string | null;
  setMosaicTree: (tree: MosaicNode<string> | null) => void;
  setActivePane: (paneId: string) => void;
  addSession: (profileId: string) => void;
  splitPane: () => void;
  closePane: (paneId: string) => void;
  removeSession: (paneId: string, sessionId: string) => void;
  setActiveSession: (paneId: string, sessionId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [panes, setPanes] = useState<Record<string, PaneData>>({});
  const [mosaicTree, setMosaicTree] = useState<MosaicNode<string> | null>(null);
  const [activePaneId, setActivePaneId] = useState<string | null>(null);

  const setActivePane = useCallback((paneId: string) => setActivePaneId(paneId), []);

  // Side effects (id generation, setMosaicTree) stay OUT of setState updaters:
  // StrictMode invokes updaters twice, which would mint divergent ids and leave
  // the mosaic tree pointing at panes that aren't in `panes`.
  const addSession = useCallback(
    (profileId: string) => {
      const sessionId = uuidv4();
      const newSession: WorkspaceSession = { id: sessionId, profileId };
      const paneIds = Object.keys(panes);

      if (paneIds.length === 0) {
        const paneId = uuidv4();
        setPanes({ [paneId]: { id: paneId, sessions: [newSession], activeSessionId: sessionId } });
        setMosaicTree(paneId);
        setActivePaneId(paneId);
        return;
      }

      // Open in the active pane (fall back to the first pane if it's gone).
      const targetPaneId = activePaneId && panes[activePaneId] ? activePaneId : paneIds[0];
      setPanes((prev) => ({
        ...prev,
        [targetPaneId]: {
          ...prev[targetPaneId],
          sessions: [...prev[targetPaneId].sessions, newSession],
          activeSessionId: sessionId,
        },
      }));
      setActivePaneId(targetPaneId);
    },
    [panes, activePaneId],
  );

  const splitPane = useCallback(() => {
    const leaves = getLeaves(mosaicTree);
    if (leaves.length >= MAX_PANES) return;
    const paneId = uuidv4();
    setPanes((prev) => ({ ...prev, [paneId]: { id: paneId, sessions: [], activeSessionId: null } }));
    setMosaicTree(createBalancedTreeFromLeaves([...leaves, paneId]));
    setActivePaneId(paneId);
  }, [mosaicTree]);

  const closePane = useCallback(
    (paneId: string) => {
      const remaining = getLeaves(mosaicTree).filter((id) => id !== paneId);
      setPanes((prev) => {
        const next = { ...prev };
        delete next[paneId];
        return next;
      });
      setMosaicTree(remaining.length ? createBalancedTreeFromLeaves(remaining) : null);
      setActivePaneId((cur) => (cur === paneId ? remaining[0] ?? null : cur));
    },
    [mosaicTree],
  );

  const removeSession = useCallback(
    (paneId: string, sessionId: string) => {
      const pane = panes[paneId];
      if (!pane) return;
      const newSessions = pane.sessions.filter((s) => s.id !== sessionId);

      // Closing the last tab closes the pane itself.
      if (newSessions.length === 0) {
        const remaining = getLeaves(mosaicTree).filter((id) => id !== paneId);
        setPanes((prev) => {
          const next = { ...prev };
          delete next[paneId];
          return next;
        });
        setMosaicTree(remaining.length ? createBalancedTreeFromLeaves(remaining) : null);
        setActivePaneId((cur) => (cur === paneId ? remaining[0] ?? null : cur));
        return;
      }

      const activeSessionId =
        pane.activeSessionId === sessionId
          ? newSessions[newSessions.length - 1].id
          : pane.activeSessionId;

      setPanes((prev) => ({
        ...prev,
        [paneId]: { ...pane, sessions: newSessions, activeSessionId },
      }));
    },
    [panes, mosaicTree],
  );

  const setActiveSession = useCallback((paneId: string, sessionId: string) => {
    setActivePaneId(paneId);
    setPanes((prev) => {
      const pane = prev[paneId];
      if (!pane) return prev;
      return {
        ...prev,
        [paneId]: { ...pane, activeSessionId: sessionId },
      };
    });
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        panes,
        mosaicTree,
        activePaneId,
        setMosaicTree,
        setActivePane,
        addSession,
        splitPane,
        closePane,
        removeSession,
        setActiveSession,
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
