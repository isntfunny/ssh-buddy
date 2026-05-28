# Sync: Merge, Konflikte, Tombstones & Connection-History — Design

**Datum:** 2026-05-28
**Status:** Approved (Design)

## Problem

Das bestehende Multi-Device-Sync (PocketBase, E2E-verschlüsselt) merged lokal mit
remote schlecht bis gar nicht. Verifizierte Ursachen im aktuellen Code:

1. **Löschungen synchronisieren nicht (Resurrection).** `unionMerge`
   ([syncEngine.ts:17-42](../../../src/modules/sync/syncEngine.ts)) fügt nur hinzu/behält.
   Es gibt keinen `pb...delete()`-Aufruf. Lokal gelöschte Profile bleiben auf dem
   Remote und werden beim nächsten Sync wieder heruntergeladen und lokal angelegt.
2. **Connection-History-Churn.** `lastConnectedAt` / `lastErrorCategory` /
   `lastHostKeyFingerprint` werden via `profiles.update` geschrieben und bumpen
   `updatedAt`. Bloßes Verbinden auf Gerät A lässt A's Kopie "gewinnen" und
   überschreibt echte Content-Edits von Gerät B.
3. **`client_revision` ist tot** — wird konstant als `1` gepusht, nie gelesen.
4. **Last-Write-Wins per Wall-Clock** — Clock-Skew zwischen Geräten verliert still
   die echte neuere Änderung; ganzes Profil wird ersetzt (kein Bewusstsein für
   Konflikte).
5. **Realtime-Echo** — `subscribe('*')` empfängt die eigenen Pushes zurück.

## Nicht-Ziele (bewusst gestrichen)

- **Kein Revisions-/Optimistic-Concurrency-System** mit Countern und Compare-and-Swap.
  Overkill für ein persönliches Tool mit wenigen Geräten und seltenen echten
  Gleichzeitig-Edits.
- **Kein feldweises Auto-Merge.** Konflikte löst der User mit drei Knöpfen.
- **Keine CRDTs / Vektor-Uhren.**

## Lösungsüberblick

Konflikt-Erkennung über ein lokales `dirty`-Flag plus PocketBases eingebautes
`updated`-Feld (Server-Timestamp) als opakes Versions-Token. Das Modal erscheint
nur bei echter Divergenz. Löschungen via Tombstones. Connection-History wird ein
echtes append-only Event-Log, union-gemergt (konfliktfrei), optional geräteübergreifend
per Setting.

## 1. Datenmodell

### Profile-Content (verschlüsselt synct)

Bestehende Felder bleiben (`id`, `name`, `host`, `port`, `username`, `auth`,
`notes`, `color`, `tags`, `snippets`, `envVars`, `jumpHostId`, `createdAt`,
`updatedAt`). Änderungen:

- **Entfernt:** `lastConnectedAt`, `lastErrorCategory`, `lastHostKeyFingerprint`
  (ersetzt durch History).
- **Neu:** `deletedAt?: string` — Tombstone. Gesetzt = gelöscht; UI blendet aus,
  Sync trägt den Tombstone weiter.
- **Neu:** `history: ConnectionEvent[]` — append-only Event-Log (siehe §4).
- `updatedAt` bumpt **nur** bei echten Content-Edits (Name, Host, Port, Auth,
  Notes, **Tags**, Snippets, EnvVars, Color, JumpHost). Nicht durch Verbindungen.

**Tags** sind ein normales Content-Feld: nehmen an der dirty/Konflikt-Logik teil,
erscheinen im Konflikt-Diff als Liste. **Kein Auto-Union** — damit auch das
*Entfernen* eines Tags propagiert.

### Sync-Metadaten (rein lokal, NICHT im Blob)

```ts
type SyncMetaEntry = { dirty: boolean; lastSyncedToken: string };
type SyncMeta = Record<string /* profileId */, SyncMetaEntry>;
```

- `dirty` — wird bei jedem lokalen `create`/`update`/`remove` gesetzt, beim
  erfolgreichen Push/Take auf `false`.
- `lastSyncedToken` — der `updated`-Wert des PB-Records beim letzten erfolgreichen
  Sync dieses Profils.

Gespeichert getrennt vom Profil-Blob (eigener lokaler Store), damit es nie
verschlüsselt/gepusht wird.

### Connection-Event

```ts
type ConnectionEvent = {
  id: string;            // uuid, stabil für Union-Dedupe
  at: string;            // ISO timestamp
  outcome: 'connected' | 'error';
  errorCategory?: string;
  hostKeyFingerprint?: string;
  deviceId: string;
};
```

### Settings (synct über User, eigener verschlüsselter Singleton-Record)

```ts
type SyncSettings = { syncConnectionHistory: boolean };
```

`syncConnectionHistory = false` → History bleibt rein lokal, wird nie in den
Profil-Blob geschrieben/gepusht und eingehende Remote-History wird ignoriert.

## 2. Sync-Ablauf (pro Profil)

```
remote = PB-Record (falls vorhanden), local = lokale Kopie, meta = syncMeta[id]

1. History (immer, unabhängig vom Content-Ausgang):
   merged.history = unionByEventId(local.history, remote.history)
   (nur wenn syncConnectionHistory aktiv; sonst merged.history = local.history)

2. Content-Entscheidung:
   - kein local           → nimm remote (inkl. deletedAt)
   - kein remote          → push local (neu)
   - !meta.dirty          → nimm remote-Content        (stummer Take; 95%-Fall)
   - dirty & remote.updated == meta.lastSyncedToken     → Fast-Forward: push local
   - dirty & remote.updated != meta.lastSyncedToken     → KONFLIKT → Queue fürs Modal

3. Tombstone: deletedAt ist Teil des Content und gewinnt/verliert wie jeder andere
   Content-Stand über den obigen Entscheidungsbaum.

4. Nach erfolgreichem Push/Take:
   meta.dirty = false
   meta.lastSyncedToken = (neuer) remote.updated
```

- **Echo-Filter:** Realtime-Events, deren `device_id` == eigene `device_id`,
  werden ignoriert.
- **Tombstone-Purge:** Profile mit `deletedAt` älter als 90 Tage werden lokal und
  remote endgültig entfernt.
- `client_revision` wird nicht mehr genutzt; per Migration auf optional gesetzt.

### Konflikt-Sammlung

`syncAll` löst alle nicht-konfliktären Fälle automatisch auf (Fast-Forward,
stummer Take, Tombstones, History-Union) und gibt die echten Konflikte als Liste
zurück:

```ts
type SyncConflict = { profileId: string; local: Profile; remote: Profile;
                      remoteDeviceName?: string };
```

`mergeProfiles(local[], remote[], meta)` → `{ merged, toPush, conflicts }`.

## 3. Konflikt-Modal

Erscheint nur bei echter Divergenz; arbeitet eine Queue ab (mehrere Konflikte
nacheinander).

```
┌─ Sync-Konflikt: "Production DB" ──────────────┐
│ Beide Geräte haben dieses Profil geändert.    │
│ Remote zuletzt geändert auf: MacBook (gestern)│
│                                               │
│  Feld      Deine Version   │ Remote-Version   │
│  Host      10.0.0.5        │ 10.0.0.9         │
│  Port      22              │ 2222             │
│  Tags      prod, db        │ prod             │
│  Notes     "staging"       │ "prod"           │
│                                               │
│ [ Meine behalten ] [ Remote behalten ]        │
│ [ Beide behalten (Duplikat) ]                 │
└───────────────────────────────────────────────┘
```

Auflösungen:

- **Meine behalten** → local-Content überschreibt remote (push), `dirty=false`,
  Token aktualisieren.
- **Remote behalten** → remote-Content lokal übernehmen, `dirty=false`, Token
  aktualisieren.
- **Beide behalten (Duplikat)** → remote bleibt unter der bestehenden ID; local
  wird als **neues Profil** dupliziert (`Name (Konflikt-Kopie)`, neue ID) und
  gepusht. Nichts geht verloren.

Der Diff zeigt nur Felder, die sich unterscheiden. History wird in allen Fällen
vereinigt (nicht Teil des Diffs). `remoteDeviceName` wird aus der `devices`-Collection
über die `device_id` des Remote-Records aufgelöst.

## 4. Connection-History (Feature)

- `ConnectionView` ([ConnectionView.tsx:48-92](../../../src/modules/shell/ConnectionView.tsx))
  ruft beim Connect/Error nicht mehr `onUpdateHistory` (das `profiles.update`
  bumpte), sondern hängt ein `ConnectionEvent` über einen eigenen Pfad an die
  History an — **kein Content-Bump, kein `dirty`**.
- **Recording:** `connected` mit `hostKeyFingerprint` bei erfolgreichem Connect;
  `error` mit `errorCategory` bei Fehler. Jeweils mit eigener `deviceId`.
- **Retention:** Beim Anhängen Events älter als 90 Tage droppen (pro Profil).
- **Anzeige:** History-Sektion im Profil-Detail/-Editor — Liste mit Zeitpunkt,
  Erfolg/Fehler (+ Kategorie), Gerät, Fingerprint.
- **Setting-Toggle** im Account-/Settings-Bereich: „Verbindungs-Historie zwischen
  Geräten synchronisieren" (default: aus → rein lokal).

## 5. PocketBase-Schema (neue Migration)

- `profiles.client_revision`: auf **optional** setzen (Code ignoriert das Feld).
- Neue Collection `settings`: Felder `user` (relation, cascadeDelete), `blob`
  (text), `nonce` (text), `schema_version` (number). Auth-Rules wie bei `profiles`
  (`user = @request.auth.id`). Unique-Index auf `user` (ein Record pro User).
- Tombstones brauchen **kein** Schema — `deletedAt` steckt im verschlüsselten Blob.

## 6. Komponenten-Schnitt

| Datei | Änderung |
|-------|----------|
| `src/modules/profiles/types.ts` | `deletedAt`, `history`; entferne `lastConnectedAt`/`lastErrorCategory`/`lastHostKeyFingerprint`; `ConnectionEvent`-Typ |
| `src/modules/profiles/storage.ts` | `dirty` setzen bei `create`/`update`/`remove`; `remove` → Tombstone statt Hard-Delete; History-Append-Methode |
| `src/modules/sync/syncMeta.ts` (neu) | lokale dirty/token-Map (Tauri-File + Browser-localStorage) |
| `src/modules/sync/syncEngine.ts` | `unionMerge` → `mergeProfiles` mit `{merged,toPush,conflicts}`; History-Union; Tombstone-Handling/-Purge; Echo-Filter; `pb...delete()` für gepurgte Tombstones |
| `src/modules/sync/useSync.ts` | `conflicts`-State + `resolveConflict(id, choice)` |
| `src/modules/sync/SyncConflictModal.tsx` (neu) | Queue-Modal mit Diff + 3 Knöpfen |
| `src/modules/shell/ConnectionView.tsx` | Event-Append statt `onUpdateHistory`-Bump |
| `src/modules/settings/` (neu) | Settings-Store, Settings-Sync (Singleton-Record), Toggle-UI |
| `backend/pocketbase/pb_migrations/` | neue Migration: `client_revision` optional, `settings`-Collection |
| Profil-Detail/-Editor | History-Sektion (Anzeige) |

## Tests

- `mergeProfiles`: stummer Take (!dirty), Fast-Forward (dirty + Token gleich),
  Konflikt (dirty + Token verschieden), neu lokal, neu remote, Tombstone gewinnt,
  History-Union dedupe, History-Retention.
- Tombstone-Purge nach 90 Tagen.
- Echo-Filter ignoriert eigene `device_id`.
- Settings-Toggle: History wird bei `false` nicht in den Blob geschrieben.
- Konflikt-Auflösung „Beide behalten" erzeugt neue ID + Konflikt-Kopie.
