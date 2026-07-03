# Cloudflare Deployment

OpenConnector supports Cloudflare Workers as a metadata and runtime-state deployment target. The
Worker runtime uses:

- Workers for the HTTP runtime.
- D1 for connections, OAuth config/state, runtime tokens, and run logs.
- R2 for temporary transit files.
- Static Assets for the Web Console.

## Prerequisites

- A Cloudflare account with Workers, D1, and R2 access.
- Wrangler authentication configured for your account.
- Node.js 22 or newer.

## Create Local Config

Copy the example Wrangler config:

```bash
cp wrangler.example.jsonc wrangler.local.jsonc
```

`wrangler.local.jsonc` is ignored by git. Fill it with your Cloudflare resource IDs before remote
deployment.

## Create Cloudflare Resources

Create the D1 database and R2 bucket:

```bash
npx wrangler d1 create oomol-connect
npx wrangler r2 bucket create oomol-connect-transit-files
```

Put the returned D1 `database_id` into `wrangler.local.jsonc`.

## Build Runtime Assets

Generate the provider catalog and build the Web Console:

```bash
npm run generate:catalog
npm run build:web
```

Make sure your Wrangler config maps the built Web Console assets to the `ASSETS` binding before
starting a Worker preview or deploying. `wrangler.example.jsonc` already includes the required
Static Assets configuration:

```jsonc
"assets": {
  "directory": "dist/web",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application"
}
```

## Local Worker Preview

Apply migrations locally and start a Worker preview:

```bash
npx wrangler d1 migrations apply oomol-connect --local
npm run dev:cloudflare
```

The local Worker preview uses the same generated provider Action executor registry as the Node
runtime.

## Remote Deployment

Apply migrations remotely:

```bash
npx wrangler d1 migrations apply oomol-connect --remote
```

Set required secrets with Wrangler:

```bash
npx wrangler secret put OOMOL_CONNECT_ADMIN_TOKEN
npx wrangler secret put OOMOL_CONNECT_ENCRYPTION_KEY
```

Deploy:

```bash
npm run deploy:cloudflare
```

## Runtime Behavior

The Cloudflare runtime serves catalog metadata, `/api` and `/v1` metadata endpoints, connections,
runtime tokens, OAuth config/state, R2-backed transit files, and the generated provider Action
executor registry.

Configure an R2 lifecycle rule for the transit bucket if you want unread expired transit files
cleaned up automatically.

## Configuration

Cloudflare uses the same environment variable names for origin, auth tokens, action policy, transit
file limits, and credential encryption. `PORT`, `HOST`, and `OOMOL_CONNECT_DATA_DIR` are local
Node-only settings on Workers.

See [configuration.md](configuration.md) for all runtime environment variables.
