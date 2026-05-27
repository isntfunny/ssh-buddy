# PocketBase backend

The live deployment uses the upstream `ghcr.io/muchobien/pocketbase` image from
`docker-compose.live.yml`. The persistent database remains in the existing
`pb_data` volume. Versioned schema changes live in `pb_migrations/` and are
mounted read-only into the container as `/pb_migrations`.

PocketBase applies unapplied migrations automatically when `serve` starts. To
apply this schema to the live instance, redeploy/recreate the PocketBase service:

```bash
docker compose -f docker-compose.live.yml up -d pocketbase
```

The initial migration creates the sync collections required by the app:

- adds `kdf_salt` to the built-in `users` auth collection
- creates `profiles` with per-user API rules
- creates `devices` with per-user API rules

No API key is required in the app. Clients authenticate as normal PocketBase
users, and collection rules restrict records to `user = @request.auth.id`.
