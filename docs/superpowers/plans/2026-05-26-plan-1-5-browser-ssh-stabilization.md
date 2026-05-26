# Plan 1.5: Browser SSH Proxy Stabilization

**Goal:** Make the browser SSH path a first-class MVP surface. The browser connects through `backend/ws-ssh-proxy`; native Tauri builds continue to connect directly through Rust `russh`.

**Why this exists:** Plan 1 originally deferred web SSH, but the architecture spec requires browser SSH through a WebSocket proxy. This plan reconciles the implementation roadmap with the spec.

## Scope

Included:
- WebSocket SSH proxy is part of the repo under `backend/ws-ssh-proxy`.
- Browser frontend selects WebSocket transport outside Tauri.
- Native frontend selects Tauri IPC transport inside Tauri.
- Proxy has baseline deployment safety controls.
- Proxy has a real integration test against an SSH server.

Excluded:
- Pocketbase sync.
- Encrypted profile storage.
- True browser-side SSH/WASM. The proxy speaks SSH in this MVP.
- Production Docker/Coolify deployment polish. That moves to Phase 4.

## Tasks

### Task 1: Proxy Runtime Config

- [x] Add `SSH_BUDDY_PROXY_ADDR`.
- [x] Add `SSH_BUDDY_PROXY_ALLOWED_ORIGINS`.
- [x] Add `SSH_BUDDY_PROXY_ALLOWED_TARGETS`.
- [x] Add `SSH_BUDDY_PROXY_DENIED_TARGETS`.
- [x] Add `SSH_BUDDY_PROXY_MAX_SESSIONS_PER_IP`.
- [x] Add `SSH_BUDDY_PROXY_DIAL_TIMEOUT`.
- [x] Add `SSH_BUDDY_PROXY_WRITE_TIMEOUT`.
- [x] Add `SSH_BUDDY_PROXY_IDLE_TIMEOUT`.
- [x] Add `SSH_BUDDY_PROXY_MAX_SESSION_TIME`.
- [x] Add `SSH_BUDDY_PROXY_MAX_INIT_BYTES`.

### Task 2: Proxy Baseline Hardening

- [x] Restrict WebSocket origins by default to local Vite dev origins.
- [x] Enforce target allowlist/denylist if configured.
- [x] Enforce per-IP concurrent session limit.
- [x] Enforce read/write deadlines.
- [x] Enforce maximum first-message size.
- [x] Keep payloads out of logs.
- [x] Log only metadata: target, user, auth method, remote IP, duration, byte counts, error category.

### Task 3: Browser Transport

- [x] Browser transport opens `ws://localhost:8080/ssh` by default.
- [x] Browser transport accepts `VITE_SSH_BUDDY_WS_PROXY_URL` override.
- [x] Browser transport sends first WebSocket message `{ type: "connect", request }`.
- [x] Browser transport forwards terminal bytes as binary WebSocket messages.
- [x] Browser transport forwards resize and disconnect as JSON control messages.
- [x] UI displays proxy trust warning for browser SSH.

### Task 4: Tests

- [x] Add proxy policy unit tests.
- [x] Add gated proxy integration test against real SSH server.
- [ ] Add frontend unit test for Tauri vs browser transport selection.
- [x] Add Playwright browser smoke that connects through proxy.

### Task 5: Documentation

- [x] Update README with browser SSH proxy quickstart.
- [x] Update architecture spec WebSocket `/ssh` handshake wording.
- [x] Update AGENTS.md to clarify MVP proxy speaks SSH.
- [x] Add this Plan 1.5.

## Verification

Commands:

```bash
pnpm test:run
pnpm build
pnpm proxy:test
pnpm proxy:build
cd src-tauri && cargo check && cargo test --lib && cargo test --test integration_ssh
```

Proxy integration test:

```bash
docker compose -f docker-compose.test.yml up -d
cd backend/ws-ssh-proxy
SSH_BUDDY_PROXY_INTEGRATION=1 go test ./... -run TestProxyIntegrationConnectAndRunCommand -v
cd ../..
docker compose -f docker-compose.test.yml down
```

Manual browser smoke:

```bash
docker compose -f docker-compose.test.yml up -d
pnpm proxy:dev
pnpm dev
```

Open `http://localhost:1420`, create a profile for `testuser@127.0.0.1:2222`, password `testpass`, connect, run `echo hello`, disconnect.

## Exit Criteria

- [x] All verification commands pass.
- [x] Proxy integration test passes against Docker SSH server.
- [x] Browser smoke passes through proxy.
- [x] No background dev servers or test containers are left running after verification.
