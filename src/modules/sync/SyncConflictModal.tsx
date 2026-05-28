import { Badge, Button, Group, Modal, Stack, Table, Text } from '@mantine/core';
import type { Profile } from '../profiles/types';
import type { SyncConflict } from './syncEngine';
import type { ConflictChoice } from './useSync';

function fieldValue(p: Profile, field: keyof Profile): string {
  const v = p[field];
  if (v == null) return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const COMPARED: (keyof Profile)[] = ['name', 'host', 'port', 'username', 'notes', 'tags', 'color', 'jumpHostId'];

export function SyncConflictModal({
  conflicts,
  onResolve,
}: {
  conflicts: SyncConflict[];
  onResolve: (profileId: string, choice: ConflictChoice) => void;
}) {
  const current = conflicts[0];
  if (!current) return null;

  const diffRows = COMPARED.filter((f) => fieldValue(current.local, f) !== fieldValue(current.remote, f));

  return (
    <Modal opened onClose={() => {}} withCloseButton={false} title={`Sync-Konflikt: ${current.remote.name}`} size="lg">
      <Stack gap="md">
        <Text size="sm">
          Beide Geräte haben dieses Profil geändert.
          {current.remoteDeviceName && (
            <> Remote zuletzt geändert auf <Badge variant="light">{current.remoteDeviceName}</Badge>.</>
          )}
        </Text>

        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Feld</Table.Th>
              <Table.Th>Deine Version</Table.Th>
              <Table.Th>Remote-Version</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {diffRows.map((f) => (
              <Table.Tr key={f}>
                <Table.Td>{f}</Table.Td>
                <Table.Td>{fieldValue(current.local, f)}</Table.Td>
                <Table.Td>{fieldValue(current.remote, f)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <Group justify="flex-end">
          <Button variant="default" onClick={() => onResolve(current.profileId, 'mine')}>Meine behalten</Button>
          <Button variant="default" onClick={() => onResolve(current.profileId, 'remote')}>Remote behalten</Button>
          <Button onClick={() => onResolve(current.profileId, 'both')}>Beide behalten (Duplikat)</Button>
        </Group>

        {conflicts.length > 1 && (
          <Text size="xs" c="dimmed">Noch {conflicts.length - 1} weitere(r) Konflikt(e)</Text>
        )}
      </Stack>
    </Modal>
  );
}
