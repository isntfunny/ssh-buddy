import { Mosaic } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import { useWorkspace } from './WorkspaceProvider';
import { WorkspacePane } from './WorkspacePane';
import type { Profile } from '../profiles/types';
import { Center, Text } from '@mantine/core';

type HistoryPatch = {
  lastConnectedAt?: string;
  lastHostKeyFingerprint?: string;
  lastErrorCategory?: string;
};

type Props = {
  profiles: Profile[];
  onUpdateHistory: (profileId: string, patch: HistoryPatch) => void;
};

export function Workspace({ profiles, onUpdateHistory }: Props) {
  const { mosaicTree, setMosaicTree } = useWorkspace();

  if (!mosaicTree) {
    return (
      <Center h="100%">
        <Text c="dimmed">Select a profile from the sidebar to open a connection.</Text>
      </Center>
    );
  }

  return (
    <Mosaic<string>
      renderTile={(id) => (
        <WorkspacePane paneId={id} profiles={profiles} onUpdateHistory={onUpdateHistory} />
      )}
      value={mosaicTree}
      onChange={setMosaicTree}
      className="mosaic-blueprint-theme bp3-dark"
    />
  );
}
