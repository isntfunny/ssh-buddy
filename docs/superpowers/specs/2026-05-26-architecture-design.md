# ssh-buddy — Architecture Design

**Date:** 2026-05-26
**Status:** Draft, pending user approval
**Author:** Initial brainstorming session

## 1. Goals

1. Cross-platform SSH client: Android, iOS, macOS, Windows, Linux, Web — single codebase (Tauri 2.0 + React).
2. Free for end users. Self-hostable backend, no SaaS lock-in.
3. End-to-end encrypted profile synchronization between a user's devices. Sync server stores ciphertext only.
4. Native platforms connect directly to target SSH servers — no third-party proxy in the path.
5. Profiles, snippets, and identities portable via documented JSON export/import.

## 2. Non-goals

1. **E2E on the SSH wire from the browser build.** Browser sandbox prevents direct TCP. The web build routes SSH through our WebSocket proxy, which can observe the SSH handshake/credentials. Documented to users.
2. Feature parity with OpenSSH on day one. MVP scope is password + public-key auth, interactive shell, port forwarding, SFTP. Agents, certificates, GSSAPI come later.
3. Building our own SSH protocol implementation. We use `russh` (native) and a documented proxy for web.
4. Multi-tenant SaaS hosting. The reference deployment is self-hosted on the project owner's Coolify infrastructure.

## 3. High-level architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          User devices                                │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐   │
│  │ Native (Tauri)  │    │ Mobile (Tauri)  │    │ Web (React only)│   │
│  │  React + Mantine│    │ React + Mantine │    │ React + Mantine │   │
│  │  xterm.js       │    │ xterm.js        │    │ xterm.js        │   │
│  │  ─ Rust backend │    │ ─ Rust backend  │    │ ─ no Rust       │   │
│  │  ─ russh ──────►│SSH │ ─ russh ───────►│SSH │ ─ WS proxy ────►│
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘   │
│           │                      │                      │            │
│           │ encrypted profile sync (HTTPS + WSS)        │            │
│           └──────────────────────┬───────────────────────┘           │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │
                ┌──────────────────▼──────────────────┐
                │     Backend (self-hosted, Coolify)  │
                │                                     │
                │   ┌─────────────┐  ┌──────────────┐ │
                │   │ Pocketbase  │  │ ws-ssh-proxy │ │
                │   │ (sync only) │  │ (web only)   │ │
                │   │ ciphertext  │  │ dumb TCP fwd │ │
                │   └──────┬──────┘  └──────┬───────┘ │
                └──────────┼─────────────────┼────────┘
                           │                 │ TCP to target
                           ▼                 ▼
                       SQLite           SSH server
```

## 4. Components

### 4.1 Frontend (`src/`)

React + TypeScript + Mantine v7. Organized by feature module:

- **`modules/profiles/`** — CRUD for SSH profiles, list view, edit forms, import/export.
- **`modules/ssh/`** — terminal sessions, xterm.js integration, transport selection (native Tauri command vs web WebSocket).
- **`modules/sync/`** — Pocketbase client, realtime subscription, conflict resolution.
- **`modules/crypto/`** — libsodium wrappers, master-password handling, blob encrypt/decrypt.
- **`modules/auth/`** — sign-up, sign-in, master-password setup, account recovery flows.
- **`modules/ui/`** — Mantine theme, shared layouts, modals, notifications.
- **`lib/`** — small shared helpers (date formatting, error types).

### 4.2 Tauri Rust backend (`src-tauri/`)

Only present in native builds (not the web build).

- **`src/ssh/`** — `russh` session management, PTY allocation, port-forwarding setup, SFTP.
- **`src/storage/`** — `stronghold` plugin integration for storing the master-password-derived key after first unlock (so user doesn't re-enter master password every launch).
- **`src/commands/`** — Tauri commands exposed to the frontend via IPC. Each command is a thin wrapper, no business logic.

### 4.3 Sync backend: Pocketbase (`backend/pocketbase/`)

Self-hosted Pocketbase instance on Coolify. We store only collection schemas, migrations, and hooks here — Pocketbase itself is the upstream binary.

Collections:

**`users`** — built-in Pocketbase users collection. Email + password (server-side bcrypt for login auth, not related to the master password used for profile encryption).

**`profiles`** — one record per user-profile pair.
- `user` (relation → users) — owner
- `blob` (text) — base64 of XChaCha20-Poly1305 ciphertext containing the entire profile JSON
- `nonce` (text) — base64 of the 24-byte XChaCha20 nonce used for this blob
- `kdf_salt` (text) — base64 of the 16-byte Argon2id salt; same for all of a user's blobs, but stored per-record for forward compatibility
- `schema_version` (number) — current profile JSON schema version
- `updated_at` (datetime)
- `device_id` (text) — which device wrote this version
- `client_revision` (number) — monotonic counter from the client, used for last-write-wins conflict resolution

**`devices`** — registered devices per user, for sync UI ("3 devices syncing").
- `user`, `name`, `platform`, `last_seen_at`, `pubkey_fingerprint` (optional, for future end-to-end device verification)

### 4.4 WebSocket SSH proxy (`backend/ws-ssh-proxy/`)

Self-hosted Go service. Only the web build uses it; native builds connect directly to the SSH target.

**MVP behavior — proxy is a real SSH client.** The browser cannot perform an SSH handshake itself in MVP scope (see 5.4), so the proxy speaks SSH on behalf of the browser: the browser ships authentication material to the proxy, the proxy connects to the target via `crypto/ssh`, and forwards PTY bytes back over the WebSocket. Expected size: ~500–800 lines of Go.

**Stretch goal — dumb TCP forwarder.** If/when we have a browser-side SSH client (via Go-WASM `sshterm` embed or similar), the proxy collapses to a ~150-line dumb TCP pipe with no SSH knowledge. The protocol over the WebSocket switches accordingly. Both modes can coexist on different endpoints (`/ssh` for MVP, `/tcp` for stretch).

**Endpoints (MVP):**
- `WSS /ssh` — body of the upgrade request carries connection params and credentials. Proxy authenticates to target SSH server, then bridges PTY + control messages over the WebSocket.

**Rules:**
- Credentials are held in memory only for the duration of the connection. Never written to disk or logs.
- No payload logging. Metadata logs only: timestamp, target hostname, byte counts, duration, auth method used (not the secret).
- Allowlist or denylist for target hosts is per-deployment config (the reference deployment is open; run-your-own if you want restrictions).
- Rate-limited per source IP to prevent abuse.
- Operator trust is explicit: the proxy operator can see credentials passed through it. This is the core MVP tradeoff (see Non-goals and section 10).

## 5. Data flow

### 5.1 Profile sync (write)

1. User edits a profile in any client.
2. Client serializes the full profile object to JSON, increments local `client_revision`.
3. Client encrypts JSON with XChaCha20-Poly1305 using a key derived from master password + per-user salt via Argon2id (id, iterations: tunable, memory: 64 MiB, parallelism: 1; concrete params in spec section 7).
4. Client uploads `{blob, nonce, client_revision, schema_version, device_id}` to Pocketbase, authenticated as the user.
5. Pocketbase stores the record and broadcasts a realtime event to all subscribed clients.
6. Other devices receive the event, decrypt the blob locally with the same derived key, update their local cache and UI.

### 5.2 Profile sync (conflict)

Two devices edit the same profile while offline. When both come online:

- Each uploads its blob with its own `client_revision`.
- The later upload wins (server timestamp + `client_revision` as tie-breaker).
- The "loser" device, upon receiving the realtime event, sees its local edit lost. We surface a non-blocking notification: "Profile X was changed on another device. Your offline edit was overwritten. [Show diff]". User can manually re-apply.

We deliberately choose **last-write-wins** over CRDT for MVP simplicity. SSH profiles are not collaboratively edited in practice. CRDT can be added later if needed.

### 5.3 SSH connection — native (Tauri)

1. User clicks "Connect" on a profile.
2. Frontend asks Rust backend via Tauri command: `ssh_connect(profile_id)`.
3. Rust backend decrypts the in-memory profile (the frontend passes the decrypted profile object; alternatively, Rust holds a copy of the master key after first unlock for autoconnect features).
4. Rust opens TCP socket directly to `host:port`, performs SSH handshake via `russh`, allocates PTY.
5. Rust streams stdout/stderr/PTY output via Tauri event to the frontend.
6. Frontend's xterm.js writes the output. Keystrokes flow back the same path.

**Security property:** Credentials never leave the device. The SSH session is between the user's device and the target server.

### 5.4 SSH connection — web (MVP)

1. User clicks "Connect" on a profile in the browser build.
2. Frontend opens a WebSocket to our `ws-ssh-proxy`: `wss://proxy.example.org/ssh`.
3. Frontend sends a connection-init message over the WebSocket containing target host/port and auth material (password or private key + passphrase), decrypted in the browser from the synced profile.
4. Proxy opens TCP to `H:P`, performs SSH handshake on behalf of the browser using `crypto/ssh`, allocates PTY.
5. Proxy streams PTY bytes over the WebSocket; frontend writes to xterm.js. Keystrokes flow back.

**Why not E2E in MVP:** There is no production-quality pure-JS SSH client today. Building one (`russh→WASM` or `sshterm` Go-WASM embed) is research-grade work and would block the project. We deliberately ship the proxy-does-SSH variant first.

**Security property (MVP, web only):** Profile sync remains E2E (proxy never holds the master password or decrypts sync blobs). But the SSH connection is *not* E2E — the proxy operator can observe credentials at handshake and session bytes thereafter. Self-hosting the proxy puts that trust in the user themselves.

### 5.5 SSH connection — web (stretch goal)

After MVP ships and we have time to invest, we explore a true E2E web path:
- Embed `sshterm`'s Go-WASM binary as the SSH engine inside the React app.
- Switch the proxy to `/tcp` mode (dumb TCP forwarder, ~150 lines).
- Now the SSH handshake runs in the browser; proxy only sees ciphertext.

Decision criteria for promoting the stretch to default: bundle size acceptable (< 3 MB additional), latency acceptable on mid-range hardware, no critical bugs from the WASM bridge.

## 6. Security model

| Asset | Threat | Defense |
|---|---|---|
| Profile data at rest on server | Server breach | Stored as ciphertext only; encryption key derived from user's master password, never sent to server |
| Profile data at rest on device | Device theft | Native: stored encrypted, key in OS keychain via Tauri `stronghold`. Web: stored only in browser memory + IndexedDB encrypted |
| Profile data in transit | Network MITM | TLS for HTTPS/WSS. Pinning is a future enhancement |
| Master password | Server breach | Never transmitted. Used only client-side for Argon2id |
| SSH credentials (native) | N/A — directly used in SSH handshake on device | n/a |
| SSH credentials (web) | Visible to proxy operator in MVP | Documented tradeoff. Self-host the proxy. Stretch: WASM SSH client |
| Replay of stale blob upload | Active attacker who has write access | `client_revision` monotonicity check; if implemented strictly, prevents replay |
| Account takeover via sync server | Pocketbase compromise | Attacker gets ciphertext only; cannot decrypt without master password |

## 7. Crypto parameters

- **KDF:** Argon2id, time=3, memory=64 MiB, parallelism=1, output=32 bytes. Per-user salt = 16 bytes from CSPRNG, stored alongside the user record (server-readable; that's fine, it's a salt).
- **Symmetric encryption:** XChaCha20-Poly1305-IETF. 24-byte nonce from CSPRNG, regenerated per blob write.
- **Master password requirements:** minimum 10 characters. We do NOT enforce composition rules. We display zxcvbn-style strength feedback.
- **Forgotten master password = data loss.** No recovery. Display this prominently during onboarding and require a one-time confirmation.

## 8. Plaintext profile schema (v1)

```typescript
type Profile = {
  id: string;                    // UUID v4
  name: string;
  host: string;
  port: number;                  // default 22
  username: string;
  auth: AuthMethod;              // see below
  jumpHost?: string;             // ID of another Profile to use as jump host
  envVars?: Record<string, string>;
  snippets?: Snippet[];          // shell snippets the user can invoke
  notes?: string;
  tags?: string[];
  createdAt: string;             // ISO 8601
  updatedAt: string;
};

type AuthMethod =
  | { kind: 'password'; password: string }
  | { kind: 'privateKey'; pem: string; passphrase?: string }
  | { kind: 'agent' };           // future

type Snippet = {
  id: string;
  label: string;
  body: string;
  description?: string;
};
```

Schema version is encoded in the encrypted record (`schema_version`). Migrations run client-side after decryption.

## 9. Testing strategy

- **Unit tests:** crypto module (round-trip encrypt/decrypt, KDF determinism). Profile schema migrations. Conflict resolution rules.
- **Integration tests:** sync flow against a real Pocketbase instance (docker-compose for CI).
- **End-to-end SSH tests (native):** run a local OpenSSH server in CI, connect via the app's Rust backend, exercise password + key auth.
- **Manual cross-platform smoke tests:** before each release, run on all five native platforms + Chrome + Firefox + Safari.
- **No mocked SSH** — real OpenSSH in tests, per the project owner's general preference for real integration over mocks.

## 10. Accepted tradeoffs (explicit)

1. **Tauri mobile is "stable foundation, not finished story" (as of 2026-05).** We accept the risk that some mobile-specific plugins are still maturing. If we hit a blocker, fallback is to ship desktop first, mobile later.
2. **Web build trusts the SSH proxy operator.** Documented. Acceptable for MVP given the alternative (russh→WASM) is research-grade.
3. **xterm.dart was an alternative considered with Flutter.** We chose xterm.js + Tauri instead because xterm.js is the battle-tested web terminal and the Mantine + React stack is a better fit for the project owner's TypeScript preference.
4. **No CRDT for profile sync.** Last-write-wins is sufficient for the use case; CRDT can be added later without breaking the schema.
5. **No agent forwarding in MVP.** Common but not critical. Documented in roadmap.

## 11. Open questions to resolve during implementation planning

1. Exact device-binding/registration flow: do we require a device to be approved from another device before it can sync (like Signal), or is master-password sufficient (like Bitwarden)?
2. Master-password change flow: re-encrypt all blobs with new key. Trivial in theory, careful in practice — handle gracefully if interrupted mid-rewrite.
3. Backup/export format and whether it includes the encryption key.
4. Go `crypto/ssh` vs alternative Go SSH library for the MVP proxy — `crypto/ssh` is stdlib and sufficient unless we hit a feature gap.
5. Bundle-size budget for stretch-goal `sshterm` Go-WASM embed: what's the threshold above which we keep the proxy-SSH MVP as the default?

## 12. Out of scope for this spec

- Marketing site, branding, app-store listings.
- Pricing (it's free).
- Telemetry policy (opt-in only, decide later).
- Localization (English-only at first).

## 13. References

- [Tauri 2.0 stable announcement](https://v2.tauri.app/blog/tauri-20/)
- [russh on crates.io](https://crates.io/crates/russh)
- [xterm.js](https://xtermjs.org/)
- [Mantine v7](https://mantine.dev/)
- [Pocketbase](https://pocketbase.io/)
- [sshterm — Go-WASM reference](https://github.com/c2FmZQ/sshterm)
- [Terminon — Tauri + React + xterm.js reference](https://github.com/Shabari-K-S/terminon)
- [libsodium](https://libsodium.gitbook.io/doc/)
