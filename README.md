# ssh-buddy

Cross-platform SSH client with end-to-end encrypted profile sync.

Runs natively on Android, iOS, macOS, Windows, Linux, and in the browser. Profiles and credentials sync between your devices through a self-hostable backend; the server only ever sees encrypted blobs.

## Goals

- **One codebase, all platforms.** Tauri 2.0 + React for mobile, desktop, and web.
- **Free for end users.** No subscriptions. Self-hostable backend; a public instance may exist later.
- **End-to-end encrypted profile sync.** The sync server stores ciphertext only. Loss of server data must not leak profiles.
- **Native SSH on native platforms.** The Rust backend in the Tauri app talks SSH directly to target servers — no proxy in the path.
- **No vendor lock-in.** Profiles export/import in a documented format.

## Non-goals

- Web-version E2E on the SSH wire — see [the spec](docs/superpowers/specs/) for the accepted tradeoff (browser sandbox forces a proxy).
- Full feature parity with OpenSSH from day one. Public-key + password auth, port forwarding, and SFTP first; agents and certificates later.

## Status

Plan 1 local MVP is implemented: plaintext local profiles, native desktop SSH via
Tauri/Rust, and an interactive xterm.js terminal. Design spec lives in
[`docs/superpowers/specs/`](docs/superpowers/specs/).

## Stack

| Layer | Choice |
|---|---|
| App framework | Tauri 2.0 (desktop + mobile) |
| Frontend | React + TypeScript |
| UI library | Mantine v7 (CSS Modules, no Tailwind) |
| Terminal | xterm.js (+ `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-webgl`) |
| SSH (native) | `russh` (Rust) inside the Tauri backend |
| SSH (web build) | WebSocket → backend SSH proxy (tradeoff documented) |
| Sync backend | Pocketbase (self-hosted) |
| Web-SSH proxy | Small Go service, self-hosted |
| Crypto | libsodium (`libsodium-wrappers-sumo` JS / `sodiumoxide` Rust). Argon2id KDF, XChaCha20-Poly1305 for profile blobs |
| Secret storage | Tauri's `stronghold` plugin on native; in-memory only on web |

## Run locally (Plan 1 MVP)

Requires Node 20+, pnpm 9+, Rust toolchain, and the system dependencies for
Tauri listed in the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm tauri dev
```

A native window opens. Create a profile from the sidebar, then click Connect.

Browser SSH needs the WebSocket SSH proxy:

```bash
pnpm proxy:dev
```

Then run the frontend in another terminal:

```bash
pnpm dev
```

Open `http://localhost:1420`. By default the browser connects to
`ws://localhost:8080/ssh`. Override it with `VITE_SSH_BUDDY_WS_PROXY_URL`.
The proxy performs the SSH handshake for the browser and can observe SSH
credentials during connection setup.

Proxy configuration:

| Env var | Default | Purpose |
|---|---|---|
| `SSH_BUDDY_PROXY_ADDR` | `:8080` | HTTP/WebSocket listen address |
| `SSH_BUDDY_PROXY_ALLOWED_ORIGINS` | `http://localhost:1420,http://127.0.0.1:1420` | Allowed browser origins |
| `SSH_BUDDY_PROXY_ALLOWED_TARGETS` | empty | Optional comma-separated target host allowlist |
| `SSH_BUDDY_PROXY_DENIED_TARGETS` | empty | Optional comma-separated target host denylist |
| `SSH_BUDDY_PROXY_MAX_SESSIONS_PER_IP` | `10` | Concurrent WebSocket sessions per source IP |
| `SSH_BUDDY_PROXY_DIAL_TIMEOUT` | `10s` | TCP/SSH dial timeout |
| `SSH_BUDDY_PROXY_IDLE_TIMEOUT` | `5m` | WebSocket read idle timeout |
| `SSH_BUDDY_PROXY_MAX_SESSION_TIME` | `2h` | Maximum session duration |
| `SSH_BUDDY_PROXY_MAX_INIT_BYTES` | `65536` | Maximum first-message size |

Proxy tests:

```bash
pnpm proxy:test
pnpm proxy:build
```

The real SSH proxy integration test is gated:

```bash
docker compose -f docker-compose.test.yml up -d
cd backend/ws-ssh-proxy
SSH_BUDDY_PROXY_INTEGRATION=1 go test ./... -run TestProxyIntegrationConnectAndRunCommand -v
cd ../..
docker compose -f docker-compose.test.yml down
```

For the integration test against a real SSH server:

```bash
docker compose -f docker-compose.test.yml up -d
cd src-tauri
SSH_BUDDY_INTEGRATION=1 cargo test --test integration_ssh
cd ..
docker compose -f docker-compose.test.yml down
```

## License

TBD.
