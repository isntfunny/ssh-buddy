import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import type { MosaicNode } from 'react-mosaic-component';
import { v4 as uuidv4 } from 'uuid';

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
  setMosaicTree: (tree: MosaicNode<string> | null) => void;
  addSession: (profileId: string) => void;
  removeSession: (paneId: string, sessionId: string) => void;
  setActiveSession: (paneId: string, sessionId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [panes, setPanes] = useState<Record<string, PaneData>>({});
  const [mosaicTree, setMosaicTree] = useState<MosaicNode<string> | null>(null);

  // Side effects (id generation, setMosaicTree) are kept OUT of the setState
  // updater: StrictMode invokes updaters twice, which would mint two different
  // pane ids and leave mosaicTree pointing at a pane that isn't in `panes`.
  const addSession = useCallback(
    (profileId: string) => {
      const sessionId = uuidv4();
      const newSession: WorkspaceSession = { id: sessionId, profileId };
      const paneIds = Object.keys(panes);

      if (paneIds.length === 0) {
        const paneId = uuidv4();
        setPanes({ [paneId]: { id: paneId, sessions: [newSession], activeSessionId: sessionId } });
        setMosaicTree(paneId);
        return;
      }

      // Default: add to the first pane
      const paneId = paneIds[0];
      setPanes((prev) => ({
        ...prev,
        [paneId]: {
          ...prev[paneId],
          sessions: [...prev[paneId].sessions, newSession],
          activeSessionId: sessionId,
        },
      }));
    },
    [panes],
  );

  const removeSession = useCallback(
    (paneId: string, sessionId: string) => {
      const pane = panes[paneId];
      if (!pane) return;
      const newSessions = pane.sessions.filter((s) => s.id !== sessionId);

      if (newSessions.length === 0) {
        setPanes((prev) => {
          const next = { ...prev };
          delete next[paneId];
          return next;
        });
        // Note: Real react-mosaic tree cleanup for split layouts requires
        // mosaicActions.remove. When the last pane is removed, clear the tree.
        if (Object.keys(panes).length <= 1) {
          setMosaicTree(null);
        }
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
    [panes],
  );

  const setActiveSession = useCallback((paneId: string, sessionId: string) => {
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
    <WorkspaceContext.Provider value={{ panes, mosaicTree, setMosaicTree, addSession, removeSession, setActiveSession }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
