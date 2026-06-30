# Configuration

OOMOL Connect is configured with environment variables.

| Variable                           | Default                   | Purpose                                                                               |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `PORT`                             | `3000`                    | Local HTTP server port.                                                               |
| `HOST`                             | `127.0.0.1`               | Bind address. Docker image sets `0.0.0.0`.                                            |
| `OOMOL_CONNECT_ORIGIN`             | `http://localhost:<PORT>` | Public origin used for OAuth redirect URLs.                                           |
| `OOMOL_CONNECT_DATA_DIR`           | `./data`                  | Directory containing `connect.sqlite`. Docker image sets `/app/data`.                 |
| `OOMOL_CONNECT_ENCRYPTION_KEY`     | unset                     | Enables AES-256-GCM encryption for stored credentials and OAuth client config.        |
| `OOMOL_CONNECT_NEW_ENCRYPTION_KEY` | unset                     | New key used by `runtime:data rotate-key`.                                            |
| `OOMOL_CONNECT_BACKUP_KEY`         | unset                     | Encrypts or decrypts runtime data backup files.                                       |
| `OOMOL_CONNECT_ADMIN_TOKEN`        | unset                     | Requires bearer-token auth for local admin API, docs, and web console.                |
| `OOMOL_CONNECT_RUNTIME_TOKEN`      | unset                     | Requires bearer-token auth for `/v1` and MCP runtime callers.                         |
| `OOMOL_CONNECT_API_TOKEN`          | unset                     | Legacy fallback used as both admin and runtime token when the split tokens are unset. |
| `OOMOL_CONNECT_ALLOWED_ACTIONS`    | unset                     | Comma-separated executable action allowlist. Supports `service.*`.                    |
| `OOMOL_CONNECT_BLOCKED_ACTIONS`    | unset                     | Comma-separated executable action denylist. Supports `service.*`.                     |

Example:

```bash
OOMOL_CONNECT_DATA_DIR="$PWD/data" \
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" \
OOMOL_CONNECT_BACKUP_KEY="replace-with-another-long-random-secret" \
OOMOL_CONNECT_ADMIN_TOKEN="replace-with-an-admin-token" \
OOMOL_CONNECT_RUNTIME_TOKEN="replace-with-a-runtime-token" \
OOMOL_CONNECT_ALLOWED_ACTIONS="hackernews.*,github.get_current_user" \
npm run dev
```
