import { useForm } from '@mantine/form';
import {
  Button,
  Group,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useEffect } from 'react';
import type { AuthMethod, NewProfileInput, Profile } from './types';

type Props = {
  initial?: Profile;
  onSubmit: (values: NewProfileInput) => Promise<void> | void;
  onCancel: () => void;
};

type FormValues = {
  name: string;
  host: string;
  port: number;
  username: string;
  authKind: 'password' | 'privateKey';
  password: string;
  pem: string;
  passphrase: string;
  notes: string;
};

function buildAuth(v: FormValues): AuthMethod {
  return v.authKind === 'password'
    ? { kind: 'password', password: v.password }
    : { kind: 'privateKey', pem: v.pem, passphrase: v.passphrase || undefined };
}

function fromProfile(p?: Profile): FormValues {
  return {
    name: p?.name ?? '',
    host: p?.host ?? '',
    port: p?.port ?? 22,
    username: p?.username ?? '',
    authKind: p?.auth.kind ?? 'password',
    password: p?.auth.kind === 'password' ? p.auth.password : '',
    pem: p?.auth.kind === 'privateKey' ? p.auth.pem : '',
    passphrase: p?.auth.kind === 'privateKey' ? p.auth.passphrase ?? '' : '',
    notes: p?.notes ?? '',
  };
}

export function ProfileForm({ initial, onSubmit, onCancel }: Props) {
  const form = useForm<FormValues>({
    initialValues: fromProfile(initial),
    validate: {
      name: (v) => (v.trim() ? null : 'Required'),
      host: (v) => (v.trim() ? null : 'Required'),
      username: (v) => (v.trim() ? null : 'Required'),
      port: (v) => (v >= 1 && v <= 65535 ? null : 'Must be 1–65535'),
    },
  });

  useEffect(() => {
    form.setValues(fromProfile(initial));
    form.resetDirty(fromProfile(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  return (
    <form
      onSubmit={form.onSubmit(async (values) => {
        await onSubmit({
          name: values.name.trim(),
          host: values.host.trim(),
          port: values.port,
          username: values.username.trim(),
          auth: buildAuth(values),
          notes: values.notes.trim() || undefined,
        });
      })}
    >
      <Stack>
        <TextInput label="Name" placeholder="My server" {...form.getInputProps('name')} />
        <Group grow>
          <TextInput label="Host" placeholder="example.com" {...form.getInputProps('host')} />
          <NumberInput label="Port" min={1} max={65535} {...form.getInputProps('port')} />
        </Group>
        <TextInput label="Username" placeholder="root" {...form.getInputProps('username')} />
        <SegmentedControl
          data={[
            { label: 'Password', value: 'password' },
            { label: 'Private key', value: 'privateKey' },
          ]}
          {...form.getInputProps('authKind')}
        />
        {form.values.authKind === 'password' ? (
          <PasswordInput label="Password" {...form.getInputProps('password')} />
        ) : (
          <>
            <Textarea
              label="Private key (PEM)"
              minRows={6}
              autosize
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              {...form.getInputProps('pem')}
            />
            <PasswordInput
              label="Passphrase (optional)"
              {...form.getInputProps('passphrase')}
            />
          </>
        )}
        <Textarea label="Notes (optional)" autosize {...form.getInputProps('notes')} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{initial ? 'Save' : 'Create'}</Button>
        </Group>
      </Stack>
    </form>
  );
}
