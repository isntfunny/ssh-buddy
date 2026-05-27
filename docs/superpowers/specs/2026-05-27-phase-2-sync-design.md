# Phase 2: E2E Encrypted Profile Sync — Design

**Date:** 2026-05-27
**Status:** Approved
**Builds on:** `2026-05-26-architecture-design.md`

---

## 1. Goal

Allow users to sync their SSH profiles across devices via a self-hosted PocketBase backend. All encryption and decryption happens client-side. The server stores only ciphertext. The master password never leaves the device.

---

## 2. Scope

This phase covers four sequentially-dependent layers:

1. **Crypto module** — libsodium KDF + symmetric encryption (TypeScript only, no UI)
2. **Key storage** — Tauri Stronghold (native) + WebAuthn PRF (web)
3. **Auth module** — PocketBase account sign-up/sign-in + master-password setup + unlock flow
4. **Sync engine** — bidirectional sync + PocketBase realtime subscriptions

---

## 3. Non-goals

- Multi-tenant SaaS hosting (one hosted instance, hardcoded URL)
- CRDT conflict resolution (last-write-wins is sufficient)
- SSH-level E2E for the web build (unchanged from Phase 1)
- iOS/Android biometric unlock (deferred — mobile Stronghold integration is separate)

---

## 4. PocketBase Instance

**URL (hardcoded):** `https://ucwflsl8hfjkydhjttxmp5uk.dev.isntlab.de`

All clients (native + web) point to this instance. Users cannot configure their own URL in this phase.

---

## 5. PocketBase Schema

### 5.1 `users` collection (extend built-in)

Add one custom field to the PocketBase built-in `users` collection:

| Field | Type | Notes |
|---|---|---|
| `kdf_salt` | text | base64-encoded 16-byte Argon2id salt, generated on sign-up, never changes |

### 5.2 `profiles` collection

| Field | Type | Notes |
|---|---|---|
| `user` | relation → users | owner |
| `profile_id` | text | UUID v4 from the client (matches local profile ID) |
| `blob` | text | base64 XChaCha20-Poly1305 ciphertext of the full profile JSON |
| `nonce` | text | base64 24-byte XChaCha20 nonce, fresh per write |
| `schema_version` | number | current profile JSON schema version (start: 1) |
| `device_id` | text | UUID of the writing device |
| `client_revision` | number | monotonic counter, incremented on every write |
| `updated_at` | autodate | managed by PocketBase |

API rule: users can only read/write their own records (`user = @request.auth.id`).

### 5.3 `devices` collection

| Field | Type | Notes |
|---|---|---|
| `user` | relation → users | owner |
| `name` | text | user-facing device name (e.g. "MacBook Pro") |
| `platform` | text | `linux`, `windows`, `macos`, `android`, `ios`, `web` |
| `last_seen_at` | date | updated on every sync |

---

## 6. Crypto Module (`src/modules/crypto/`)

**Library:** `libsodium-wrappers-sumo` (runs identically in browser and Tauri).

### 6.1 KDF

```
Algorithm: Argon2id
Params:    time=3, memory=65536 (64 MiB), parallelism=1, output_length=32
Input:     master_password (UTF-8 string) + kdf_salt (16 bytes)
Output:    32-byte symmetric key
```

The `kdf_salt` is generated once on sign-up (CSPRNG), stored in `users.kdf_salt` on PocketBase, and fetched on every subsequent sign-in. This ensures any device can derive the same key from the same master password.

### 6.2 Encryption

```
Algorithm: XChaCha20-Poly1305-IETF
Nonce:     24 bytes from CSPRNG, fresh per write
Input:     key (32 bytes) + plaintext (profile JSON as string)
Output:    { ciphertext: base64 string, nonce: base64 string }
```

### 6.3 TypeScript Interface

```typescript
// src/modules/crypto/index.ts
export async function initCrypto(): Promise<void>          // loads libsodium WASM
export async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array>
export function encryptBlob(key: Uint8Array, plaintext: string): { ciphertext: string; nonce: string }
export function decryptBlob(key: Uint8Array, ciphertext: string, nonce: string): string
export function generateSalt(): Uint8Array                  // 16 bytes CSPRNG
export function generateNonce(): Uint8Array                 // 24 bytes CSPRNG
```

No dependency on Tauri, PocketBase, or React. Fully unit-testable in isolation.

---

## 7. Key Storage (`src/modules/keyStore/`)

Abstracts where the derived 32-byte key lives. Callers (auth, sync) never know the difference.

```typescript
// src/modules/keyStore/index.ts
export async function storeKey(key: Uint8Array): Promise<void>
export async function loadKey(): Promise<Uint8Array | null>
export async function clearKey(): Promise<void>
export async function isBiometricAvailable(): Promise<boolean>
```

### 7.1 Native (Tauri) — Stronghold

Uses `tauri-plugin-stronghold`. The OS protects the Stronghold vault with biometrics (Windows Hello, TouchID) or device PIN when available.

Rust commands exposed:
- `storage_store_key(key: Vec<u8>) → AppResult<()>`
- `storage_load_key() → AppResult<Option<Vec<u8>>>`
- `storage_clear_key() → AppResult<()>`

### 7.2 Web — WebAuthn PRF + IndexedDB

**Libraries:** `@simplewebauthn/browser`, `idb-keyval`

**Setup (once per browser):**
1. Call `navigator.credentials.create()` with PRF extension
2. Receive 32-byte PRF output from the authenticator
3. Use WebCrypto AES-KW to wrap the master key with the PRF output
4. Store wrapped key in IndexedDB via `idb-keyval`

**Unlock (subsequent visits):**
1. Call `navigator.credentials.get()` with PRF extension
2. Receive PRF output → unwrap key from IndexedDB

**Fallback (browser without PRF support):** Session-only — key lives in memory, cleared on tab close. User must re-enter master password on each visit.

PRF is supported in Chrome 116+, Safari 17.4+, Firefox 133+.

---

## 8. Auth Module (`src/modules/auth/`)

### 8.1 State machine

```
not-configured
      │ "Sync einrichten" clicked
      ▼
  setup-modal (sign-up or sign-in)
      │ success
      ▼
biometric-prompt (optional, one-time)
      │ configured / skipped
      ▼
  unlocked  ◄────────────────────────────┐
      │ app restart / tab reload         │
      ▼                                  │
   locked                                │
      │ biometric gesture / master PW   │
      └──────────────────────────────────┘
```

### 8.2 Sign-up flow

1. User enters email, PocketBase password, master password (+ confirmation)
2. Generate `kdf_salt` (16 bytes CSPRNG)
3. Create PocketBase account → store `kdf_salt` in `users.kdf_salt`
4. `deriveKey(masterPassword, kdf_salt)` → key in memory
5. Prompt: "Biometrischen Unlock einrichten?" → `storeKey(key)` or skip
6. Register device in `devices` collection
7. Run `syncAll()` → sync starts

### 8.3 Sign-in flow

1. User enters email + PocketBase password
2. PocketBase auth → fetch `users.kdf_salt`
3. User enters master password
4. `deriveKey(masterPassword, kdf_salt)` → key in memory
5. If first sign-in on this device: biometric-prompt
6. Run `syncAll()` → sync starts

### 8.4 Unlock flow (app start, key not in memory)

1. Show `UnlockScreen` (fullscreen, app blocked behind)
2. If biometric configured: auto-trigger `loadKey()` → biometric gesture from OS
3. If biometric fails or not configured: show master password input → `deriveKey()`
4. On web with no PRF support (session-only fallback): always show master password input — `loadKey()` returns null
5. Key in memory → dismiss `UnlockScreen` → sync starts

### 8.5 Hooks

```typescript
// src/modules/auth/useAuth.ts
export function useAuth(): {
  state: 'not-configured' | 'locked' | 'unlocked'
  user: PBUser | null
  key: Uint8Array | null
  signUp(email, pbPassword, masterPassword): Promise<void>
  signIn(email, pbPassword, masterPassword): Promise<void>
  unlock(masterPassword: string): Promise<void>
  unlockBiometric(): Promise<void>
  signOut(): Promise<void>
}
```

---

## 9. Sync Engine (`src/modules/sync/`)

**Library:** `pocketbase` (official JS SDK, works in browser and Tauri)

### 9.1 Bidirectional sync (`syncAll`)

Runs at:
- App start (after unlock)
- After sign-in / sign-up
- After PocketBase realtime reconnect

```typescript
async function syncAll(key: Uint8Array): Promise<void> {
  const [pbProfiles, localProfiles] = await Promise.all([
    fetchAndDecryptAll(key),   // fetch all PB records, decrypt blobs
    loadAllLocal(),             // load from local storage
  ])

  const merged = unionMerge(pbProfiles, localProfiles)
  // Union merge by profile_id:
  //   PB-only    → add to local
  //   local-only → encrypt → push to PB (client_revision: 1)
  //   both sides → compare updatedAt → winner survives
  //                if local won → encrypt → push to PB

  await saveLocalBatch(merged)
  await pushDirtyToPB(key, merged, localProfiles)
  await updateDeviceLastSeen()
}
```

### 9.2 Realtime subscription

Started after `syncAll` completes. Stays active while app is in foreground and network is available.

```typescript
pb.collection('profiles').subscribe('*', async (event) => {
  if (event.action === 'delete') {
    removeLocal(event.record.profile_id)
  } else {
    const profile = decryptBlob(key, event.record.blob, event.record.nonce)
    mergeLocal(profile) // only if event.record.client_revision > local revision
  }
})
```

On disconnect/reconnect: SDK auto-reconnects, then `syncAll` is called again.

### 9.3 Write-through on local changes

When the user creates or updates a profile locally:
1. Save to local storage immediately (optimistic)
2. Encrypt → upsert PB record in background
3. On PB error: mark profile as "dirty", retry on next sync

### 9.4 Conflict resolution

Last-write-wins via `updatedAt` (during `syncAll`) and `client_revision` (during realtime). No user-visible conflict UI. SSH profiles are not collaboratively edited in practice; silent last-write-wins is sufficient.

### 9.5 Hook

```typescript
// src/modules/sync/useSync.ts
export function useSync(): {
  status: 'idle' | 'syncing' | 'error'
  lastSyncedAt: Date | null
  error: string | null
  syncNow(): Promise<void>
}
```

---

## 10. UI Changes

### 10.1 New components

**`AccountFooter.tsx`** — Sidebar footer row. Three states:
- Not configured: `→ Sync einrichten` (click → `SetupModal`)
- Locked: `🔒 gesperrt` (click → `UnlockScreen`)
- Unlocked: `● user@example.com · sync vor 3s` (click → `AccountModal`)

**`UnlockScreen.tsx`** — Fullscreen overlay blocking the entire app. Biometric button auto-triggered if configured. "Master-Passwort eingeben" fallback link below.

**`SetupModal.tsx`** — Two tabs: "Anmelden" and "Registrieren". Fields: email, PocketBase password, master password. After success: one-time biometric-setup prompt.

**`AccountModal.tsx`** — Opens on footer click (unlocked state). Shows: email, sync status, last sync timestamp, device count, export/import (under "Mehr"), sign-out button, "Biometrie zurücksetzen".

### 10.2 Changed components

**`AppShell.tsx`** — Add `AccountFooter` at the bottom of the sidebar. Remove Export/Import buttons from the navbar.

**`App.tsx`** — Add `UnlockScreen` and `SetupModal` rendering based on auth state from `useAuth`.

### 10.3 Export/Import

Moved from the sidebar into `AccountModal` (under a "Mehr" section). Feature is preserved, not deleted.

---

## 11. Libraries Summary

| Package | Purpose |
|---|---|
| `libsodium-wrappers-sumo` | Argon2id KDF + XChaCha20-Poly1305 |
| `pocketbase` | PocketBase JS client (auth + CRUD + realtime) |
| `@simplewebauthn/browser` | WebAuthn Registration + Authentication with PRF |
| `idb-keyval` | IndexedDB key-value store for wrapped key (web) |
| `tauri-plugin-stronghold` | Secure key vault (native only) |

---

## 12. Testing Strategy

- **Crypto:** Unit tests for round-trip encrypt/decrypt, KDF determinism, wrong-key failure.
- **Sync merge:** Unit tests for `unionMerge` — all three cases (PB-only, local-only, conflict).
- **Auth state machine:** Unit tests for state transitions.
- **Integration:** Manual smoke test against the live PocketBase instance (two browser tabs or two devices).
- No mocked PocketBase in unit tests — `unionMerge` is a pure function that takes plain objects, no PB SDK calls needed.

---

## 13. Security Notes

- `kdf_salt` is not secret (salts are public by design). Safe to store in PocketBase.
- The master password never leaves the device. PocketBase never sees it.
- The derived key lives only in RAM (and Stronghold/IndexedDB in wrapped form).
- PocketBase account password and master password are independent credentials.
- Sign-out calls `clearKey()` to remove from Stronghold/IndexedDB and wipe from memory.
- Forgotten master password = data loss. This must be communicated prominently in the sign-up UI.
