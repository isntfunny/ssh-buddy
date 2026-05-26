# Integration tests

Integration tests in this directory require a real SSH server. They are skipped
unless the `SSH_BUDDY_INTEGRATION` environment variable is set.

Quickstart:

```bash
docker compose -f docker-compose.test.yml up -d
SSH_BUDDY_INTEGRATION=1 cargo test --test integration_ssh -- --nocapture
docker compose -f docker-compose.test.yml down
```

Config picked up from these env vars, with defaults:

| Var | Default |
|---|---|
| `SSH_BUDDY_TEST_HOST` | `127.0.0.1` |
| `SSH_BUDDY_TEST_PORT` | `2222` |
| `SSH_BUDDY_TEST_USER` | `testuser` |
| `SSH_BUDDY_TEST_PASSWORD` | `testpass` |
