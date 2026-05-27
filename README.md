# ssh-buddy

A cross-platform SSH client for people who work across multiple devices and servers. Available on macOS, Windows, Linux, and Android — with iOS and a browser version on the roadmap.

---

## The idea

Most SSH clients are either locked to one platform, store your credentials in someone else's cloud, or both. ssh-buddy aims to be different:

- **Your keys, your device.** Connections go directly from your machine to your server — no proxy, no middleman in the native apps. Your private keys never leave your device.
- **Sync across devices, without trusting anyone.** Profiles are encrypted end-to-end before they ever leave your device. The sync server only ever sees ciphertext.
- **Works everywhere.** One app, same experience on your laptop, your desktop, and your phone.
- **Free and self-hostable.** No subscription. The sync backend is designed to run on your own server.

---

## Status

Early development. The core SSH client works on desktop and Android — you can connect to servers, manage profiles, and import/export your configuration. The sync backend and browser version are next on the roadmap.

| Feature | Status |
|---|---|
| SSH connection (password + key auth) | ✅ Working |
| Terminal | ✅ Working |
| Profile management | ✅ Working |
| Host key verification (TOFU) | ✅ Working |
| Import / export | ✅ Working |
| macOS, Windows, Linux builds | ✅ Working |
| Android | ✅ Working |
| Auto-update | 🔜 In progress |
| Profile sync (E2E encrypted) | 🔜 Planned |
| Browser version | 🔜 Planned |
| iOS | 🔜 Planned |

---

## Download

Builds are available as GitHub Actions artifacts. A proper release page with auto-update support is in progress.

---

## Self-hosting the sync backend

The sync backend is a standard [Pocketbase](https://pocketbase.io/) instance — a single binary you can run on any Linux server. Setup instructions will be added once the sync feature ships.

---

## Philosophy

ssh-buddy is built for people who manage their own infrastructure and take their security seriously. It doesn't try to be the simplest SSH client — it tries to be the most trustworthy one for a multi-device workflow.
