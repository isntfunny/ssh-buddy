# ssh-buddy Gameplan

This is the end-to-end implementation roadmap from the current local/web SSH MVP to a releasable cross-platform SSH client with encrypted profile sync.

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-05-26-architecture-design.md`
- Current detailed implementation plan: `docs/superpowers/plans/2026-05-26-plan-1-local-mvp.md`
- Rule when documents disagree: the architecture spec wins, unless it is explicitly updated.

## Current State

Implemented:
- Tauri 2 + React + TypeScript scaffold.
- Mantine app shell, profile CRUD UI, local plaintext profile storage.
- Native SSH path: frontend -> Tauri command -> Rust `russh` session -> target SSH server.
- Browser SSH path: frontend -> WebSocket -> Go `ws-ssh-proxy` -> target SSH server.
- xterm.js terminal component shared by native and browser paths.
- Gated native integration test against a real SSH server.
- Docker test SSH server fixture.

Known current gaps:
- Current browser proxy is MVP-quality and needs hardening before it is trusted outside local testing.
- Profile storage is still plaintext/local-only.
- No master password, encryption, sync, import/export, SFTP, port forwarding, snippets, mobile packaging, or release pipeline yet.
- Native manual GUI smoke testing was blocked in the headless environment and still needs a real desktop run.

## Definition Of Done

The project is "done" for a first serious public release when:
- Desktop builds are available for Linux, macOS, and Windows.
- Browser build can connect through a self-hosted `ws-ssh-proxy`.
- Profiles are encrypted at rest and synced end-to-end through Pocketbase.
- Native credentials never leave the device.
- Browser SSH clearly discloses the proxy trust tradeoff.
- Password and private-key auth work on native and web.
- Interactive shell, terminal resize, reconnect, and disconnect are stable.
- Import/export exists for backup and portability.
- Release docs explain self-hosting Pocketbase and `ws-ssh-proxy`.
- Automated tests cover crypto, storage, native SSH, web proxy SSH, and sync conflict basics.

## Phase 0: Stabilize Current MVP

Goal: make the existing native + browser SSH MVP reliable enough to build on.

Tasks:
- Reconcile Plan 1 with the architecture spec now that browser SSH landed earlier than originally planned.
- Add a focused plan file for browser SSH proxy stabilization.
- Keep `backend/ws-ssh-proxy` as a first-class repo module and document its dev commands.
- Add proxy integration tests that connect through WebSocket to the Docker SSH server.
- Add frontend tests around transport selection: Tauri runtime uses IPC, browser uses WebSocket.
- Add clear runtime config:
  - `VITE_SSH_BUDDY_WS_PROXY_URL`
  - `SSH_BUDDY_PROXY_ADDR`
  - proxy target allowlist/denylist config
- Fix proxy hardening basics:
  - strict origin policy config
  - connection timeout
  - idle timeout
  - max session duration
  - target host allowlist/denylist
  - request size limits
  - no payload logging
  - structured metadata logs only
- Run manual desktop smoke test on a real GUI machine:
  - create profile
  - connect native SSH
  - run commands
  - wrong password message
  - connection refused message
  - disconnect

Exit criteria:
- `pnpm test:run`, `pnpm build`, `cargo test --lib`, native SSH integration test, and proxy integration test pass.
- Browser at `localhost:1420` can connect through local proxy to Docker SSH server.
- Native app can connect directly to the same server on a desktop machine.

## Phase 1: Local SSH Client Completeness

Goal: make the local client feel like a usable SSH app before adding encryption and sync.

Tasks:
- Improve terminal ergonomics:
  - reconnect button
  - clear terminal
  - copy/paste behavior
  - terminal focus handling
  - reconnect after dropped session
  - resize correctness on panel/window changes
- Improve profile model toward spec v1:
  - tags
  - snippets
  - env vars
  - optional jump host placeholder in schema, UI can come later
- Add profile import/export for plaintext v1 JSON.
- Add private-key UX:
  - paste key
  - optional passphrase
  - key parse validation before save when possible
  - never log key contents
- Add connection history metadata:
  - last connected at
  - last successful host key fingerprint display
  - last error category, without secrets
- Add native `known_hosts` / Trust-On-First-Use groundwork:
  - store seen host key fingerprints locally
  - show first-connect warning
  - block changed host key unless user confirms

Exit criteria:
- Password and private-key auth work on native and browser.
- Import/export round-trip works.
- Terminal behavior is acceptable for daily use.
- Host key trust is no longer silent auto-accept in normal UI.

## Phase 2: Crypto And Master Password

Goal: replace plaintext local profile storage with encrypted local storage using the architecture spec.

Tasks:
- Add `src/modules/crypto/`.
- Install and initialize `libsodium-wrappers-sumo`.
- Implement Argon2id KDF:
  - time=3
  - memory=64 MiB
  - parallelism=1
  - 32-byte output
  - 16-byte per-user salt
- Implement XChaCha20-Poly1305 profile blob encryption:
  - 24-byte nonce per write
  - schema version in envelope
  - authenticated associated data for stable metadata if needed
- Add master-password onboarding:
  - create vault
  - unlock vault
  - confirm data loss if forgotten
  - strength feedback
- Add encrypted local store:
  - native file-backed encrypted vault
  - browser IndexedDB encrypted vault
  - migration from current plaintext local MVP with explicit confirmation
- Add Tauri Stronghold integration:
  - store unlocked derived key or wrapping key where appropriate
  - require re-entry when unavailable or invalid
- Add crypto tests:
  - round-trip
  - wrong password fails
  - tamper detection
  - schema version handling
  - no plaintext profile fields in persisted file

Exit criteria:
- No profile secret is stored plaintext locally.
- App can lock/unlock.
- Existing local plaintext profiles can be migrated once.
- Tests prove wrong-key and tamper failures.

## Phase 3: Pocketbase Sync

Goal: optional encrypted profile sync across devices using a self-hosted Pocketbase backend.

Tasks:
- Add `backend/pocketbase/` migrations and hooks.
- Define Pocketbase collections:
  - `users`
  - `profiles`
  - `devices`
- Add frontend auth module:
  - sign up
  - sign in
  - sign out
  - sync status
- Add sync module:
  - upload encrypted profile blobs
  - download and decrypt blobs
  - realtime subscriptions
  - offline queue
  - last-write-wins conflict handling
  - overwritten offline edit notification
- Add device identity:
  - generated device ID
  - device name
  - last seen
- Add sync controls:
  - enable sync
  - disable sync
  - force push local vault
  - force pull remote vault
  - show sync errors without leaking profile contents
- Add integration tests against a real Pocketbase container.

Exit criteria:
- Two clients can sync encrypted profiles through Pocketbase.
- Server only stores ciphertext and non-secret metadata.
- Conflict behavior matches spec.
- Sync can be disabled without data loss.

## Phase 4: Web Deployment

Goal: make the browser client and WebSocket SSH proxy deployable for real self-hosting.

Tasks:
- Harden `ws-ssh-proxy` for deployment:
  - TLS/WSS behind reverse proxy
  - origin allowlist
  - target allowlist/denylist
  - rate limits
  - idle/session timeouts
  - structured logs
  - health endpoint
  - Dockerfile
  - Coolify deployment docs
- Add frontend web build config:
  - proxy URL env var
  - Pocketbase URL env var
  - clear production warnings for proxy trust
- Add browser storage policy:
  - encrypted IndexedDB only
  - no long-lived plaintext secrets
  - clipboard handling review
- Add browser integration tests:
  - connect through local proxy
  - wrong password
  - proxy unavailable
  - resize
  - disconnect

Exit criteria:
- Browser deployment can be self-hosted with Pocketbase and `ws-ssh-proxy`.
- Browser SSH works in Chrome and Firefox.
- Proxy trust tradeoff is visible before first browser SSH connection.

## Phase 5: Mobile Builds

Goal: ship Android and iOS builds from the same Tauri + React codebase.

Tasks:
- Audit Tauri mobile support for required plugins.
- Split desktop-only assumptions from shared UI.
- Validate native SSH on Android and iOS:
  - direct TCP to target
  - password auth
  - private-key auth
  - background/foreground handling
  - keyboard handling
- Adapt UI for mobile:
  - profile list navigation
  - terminal viewport
  - mobile keyboard controls
  - paste and special keys
- Configure mobile secret storage path.
- Add Android build docs and CI task.
- Add iOS build docs and manual release checklist.

Exit criteria:
- Android debug build can connect to SSH.
- iOS debug build can connect to SSH.
- Mobile profile unlock and encrypted local storage work.

## Phase 6: Advanced SSH Features

Goal: close the gap between a basic terminal and a practical SSH client.

Tasks:
- Port forwarding:
  - local forwarding
  - remote forwarding
  - dynamic SOCKS forwarding if feasible
  - UI for active forwards
- SFTP:
  - file browser
  - upload/download
  - rename/delete/mkdir
  - progress and conflict handling
- Snippets:
  - profile-level snippets
  - global snippets
  - insert vs run behavior
  - variable substitution
- Multi-session UX:
  - tabs
  - split panes
  - session naming
  - reconnect
- Jump hosts:
  - profile references another profile as jump host
  - native support first
  - web proxy support second

Exit criteria:
- Common day-to-day SSH workflows work without leaving ssh-buddy.
- Advanced features respect the same secret-handling rules.

## Phase 7: Packaging, CI, And Release

Goal: make releases repeatable and supportable.

Tasks:
- CI:
  - TypeScript tests
  - TypeScript build
  - Rust check/test/clippy
  - Go proxy test/build
  - Docker integration tests
  - Pocketbase integration tests
- Desktop packaging:
  - Linux AppImage/deb/rpm or chosen subset
  - macOS dmg/app bundle
  - Windows installer
- Web packaging:
  - static frontend image or artifact
  - proxy Docker image
  - Pocketbase deployment notes
- Release docs:
  - local dev quickstart
  - self-hosting guide
  - security model
  - backup/export guide
  - troubleshooting
- Security review:
  - no secret logs
  - no plaintext persisted profile secrets
  - browser proxy disclosure
  - dependency audit

Exit criteria:
- A fresh machine can run local dev from docs.
- A user can self-host web + sync from docs.
- Release artifacts are reproducible.

## Phase 8: Stretch Goals

These are intentionally after the first serious release:
- True end-to-end browser SSH via WASM SSH engine plus dumb TCP proxy.
- SSH agent forwarding.
- OpenSSH certificates.
- GSSAPI/Kerberos.
- Hardware-key workflows.
- Team/shared vaults.
- Optional hosted public backend.
- Telemetry, if ever added, must be opt-in only.

## Immediate Next Chunk

Recommended next implementation chunk:

1. Finish and commit the current browser SSH proxy changes.
2. Add proxy integration tests.
3. Add proxy config hardening basics.
4. Update Plan 1 or create Plan 1.5 so the docs no longer imply browser SSH is deferred.
5. Run native desktop smoke on a GUI-capable machine.

After that, start Phase 2: crypto and master password.
