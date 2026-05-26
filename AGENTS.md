# Agent Instructions for ssh-buddy

You are working in ssh-buddy — a cross-platform SSH client with end-to-end encrypted profile sync.

## Project goal in one paragraph

Build a free SSH client that runs on Android, iOS, macOS, Windows, Linux, and the browser from a single Tauri 2.0 + React codebase. Users can store SSH connection profiles (hosts, credentials, keys, snippets) locally and optionally sync them between their devices via a self-hosted Pocketbase backend. Profiles are end-to-end encrypted: the server only ever stores ciphertext, decryption keys never leave the device.

## Stack

| Layer | Tech |
|---|---|
| App framework | Tauri 2.0 |
| Frontend | React + TypeScript |
| UI library | **Mantine v7** (CSS Modules, no Tailwind) |
| Terminal emulator | xterm.js |
| SSH on native platforms | `russh` (Rust) inside Tauri's Rust backend |
| SSH from web build | WebSocket → small Go proxy that opens TCP to the target |
| Profile sync backend | Pocketbase (self-hosted via Coolify) |
| Crypto | libsodium (`libsodium-wrappers-sumo` in TS, `sodiumoxide` in Rust). Argon2id for KDF, XChaCha20-Poly1305 for blob encryption |
| Native secret storage | Tauri's `stronghold` plugin |

## Repo layout (target — most of this does not exist yet)

```
ssh-buddy/
├── README.md
├── AGENTS.md                       ← this file
├── .gitignore
├── docs/
│   └── superpowers/
│       ├── specs/                  ← design specs
│       └── plans/                  ← implementation plans
├── src/                            ← React + TypeScript frontend
│   ├── modules/                    ← feature modules (profiles, ssh, sync, crypto, ui, ...)
│   ├── lib/                        ← shared helpers
│   └── main.tsx
├── src-tauri/                      ← Rust backend
│   ├── src/
│   │   ├── ssh/                    ← russh wrapper, session management
│   │   ├── storage/                ← stronghold integration
│   │   └── commands/               ← Tauri commands exposed to JS
│   └── Cargo.toml
├── backend/                        ← self-hostable Go services
│   ├── ws-ssh-proxy/               ← dumb WebSocket-to-TCP forwarder
│   └── pocketbase/                 ← Pocketbase migrations + hooks
└── package.json
```

Until scaffolding is done, only `docs/` and the root config files exist.

## Conventions

- **Language in code/docs/comments: English.** Commit messages may be German per the project owner's preference, but code identifiers and comments are English.
- **TypeScript:** strict mode. No `any` unless commented why.
- **React:** function components only, hooks-based. Mantine components by default — don't roll custom CSS unless Mantine can't do it.
- **Rust:** standard `clippy --all` clean. Errors with `thiserror`, async with `tokio`.
- **Modules over files:** each feature is a directory (`src/modules/profiles/`, `src-tauri/src/ssh/`), not a flat file. When a file grows past ~300 lines, split it.
- **No new top-level dirs without updating this file and the spec.**
- **Profile data is sensitive.** Never log decrypted profile contents. Mask passwords/keys in error messages.

## Important architectural rules

1. **The server never sees decrypted profile data.** All encryption/decryption happens client-side. The master password never leaves the device.
2. **Native SSH connections go device → target server directly.** No proxy.
3. **Web SSH connections go browser → our WebSocket proxy → target.** In the MVP, the proxy speaks SSH on behalf of the browser. Document clearly to users that this proxy can observe credentials at handshake time. A later stretch path may move SSH into the browser and downgrade the proxy to a dumb TCP forwarder.
4. **The WebSocket proxy MUST NOT log payloads.** It logs only connection metadata (timestamps, byte counts, target hostname).
5. **Crypto choices are fixed and live in the spec.** Don't introduce new crypto primitives without updating the spec.

## How to read the spec

The architecture spec is the source of truth for design decisions. It lives at:

`docs/superpowers/specs/YYYY-MM-DD-architecture-design.md`

When the spec and the code disagree, the spec is right and the code needs to be fixed — or the spec needs to be updated explicitly. Don't silently drift.

## When in doubt

Ask the project owner. This project is at an early stage; conventions and stack are still flexible if there's a good reason to change.
