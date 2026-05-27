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

  const addSession = useCallback((profileId: string) => {
    const sessionId = uuidv4();
    const newSession = { id: sessionId, profileId };

    setPanes((prev) => {
      const paneIds = Object.keys(prev);
      if (paneIds.length === 0) {
        const paneId = uuidv4();
        setMosaicTree(paneId);
        return { [paneId]: { id: paneId, sessions: [newSession], activeSessionId: sessionId } };
      }

      // Default: add to the first pane
      const paneId = paneIds[0];
      return {
        ...prev,
        [paneId]: {
          ...prev[paneId],
          sessions: [...prev[paneId].sessions, newSession],
          activeSessionId: sessionId,
        },
      };
    });
  }, []);

  const removeSession = useCallback((paneId: string, sessionId: string) => {
    setPanes((prev) => {
      const pane = prev[paneId];
      if (!pane) return prev;
      const newSessions = pane.sessions.filter((s) => s.id !== sessionId);

      if (newSessions.length === 0) {
        const newPanes = { ...prev };
        delete newPanes[paneId];
        // Note: Real react-mosaic tree cleanup requires mosaicActions.remove.
        // For this simple robust setup, if no panes remain, clear the tree entirely.
        if (Object.keys(newPanes).length === 0) {
          setMosaicTree(null);
        }
        return newPanes;
      }

      const activeSessionId = pane.activeSessionId === sessionId
        ? newSessions[newSessions.length - 1].id
        : pane.activeSessionId;

      return {
        ...prev,
        [paneId]: { ...pane, sessions: newSessions, activeSessionId },
      };
    });
  }, []);

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
