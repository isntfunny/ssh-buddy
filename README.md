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

Pre-implementation. Design spec lives in [`docs/superpowers/specs/`](docs/superpowers/specs/).

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

## License

TBD.
