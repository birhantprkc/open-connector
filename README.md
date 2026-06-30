# OOMOL Connect

OOMOL Connect is a local connector runtime for letting agents use external services without handing
raw provider tokens to the agent.

You run it next to the agent, configure provider credentials locally, discover typed actions, and
execute those actions through HTTP or MCP. Provider credentials stay in your local SQLite database;
agents see action schemas, provider scopes, and safe account identity such as the connected user or
workspace name.

## What You Can Build With It

- Give an agent a local tool boundary instead of direct API keys.
- Configure one shared connection once, then let agents call provider actions by schema.
- Use API key, custom credential, OAuth2, or no-auth providers from the same local runtime.
- Browse providers and action contracts through HTTP, OpenAPI, MCP metadata, or the web console.
- Add open-source provider definitions and lazy-loaded local executors.

## Quick Start

Install dependencies, generate the provider catalog, run tests, and start the local runtime:

```bash
npm install
npm run generate:catalog
npm test
npm run dev
```

Open the local API reference:

```text
http://localhost:3000/docs
```

Run a no-auth action through the public runtime API:

```bash
curl -s -X POST http://localhost:3000/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

To serve the local web console from the same runtime, build it first:

```bash
npm run build:web
npm run dev
```

Then open:

```text
http://localhost:3000
```

Runtime state is stored in `./data/connect.sqlite` by default. Use `OOMOL_CONNECT_DATA_DIR` to point
the local database somewhere else.

## Main Workflow

### 1. Protect The Local Runtime

By default, the server binds to `127.0.0.1`. Set an admin token when anything outside your own
browser or shell can reach the local admin API or web console:

```bash
OOMOL_CONNECT_ADMIN_TOKEN="replace-with-an-admin-token" npm run dev
```

Then admin HTTP clients must send:

```text
Authorization: Bearer replace-with-an-admin-token
```

Set `OOMOL_CONNECT_RUNTIME_TOKEN` separately for `/v1` and `/mcp` callers. If you only set the
legacy `OOMOL_CONNECT_API_TOKEN`, it is used as both admin and runtime token.

Set `OOMOL_CONNECT_ENCRYPTION_KEY` to encrypt stored provider credentials and OAuth client secrets:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" npm run dev
```

The bundled web console receives a same-site local cookie from the runtime, so it continues to work
when API-token authentication is enabled.

### 2. Discover Providers And Actions

List providers:

```bash
curl -s http://localhost:3000/v1/providers
```

List services that have actions:

```bash
curl -s http://localhost:3000/v1/actions
```

List action contracts for one service:

```bash
curl -s "http://localhost:3000/v1/actions?service=github"
```

Inspect one action:

```bash
curl -s http://localhost:3000/v1/actions/github.get_authenticated_user
```

For local development and agent prompts, the admin API can return a compact markdown guide with the
action input schema, scopes, provider permissions, current connection identity, and execution
examples:

```bash
curl -s http://localhost:3000/api/actions/github.get_authenticated_user/agent.md
```

### 3. Configure An API Key Connection

Provider credential fields are declared by the provider catalog. Inspect the provider first:

```bash
curl -s http://localhost:3000/api/providers/github
```

Create or replace the default API key connection:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"github_pat_..."}}'
```

Create a named connection by adding `connectionName`:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","connectionName":"work","values":{"apiKey":"github_pat_..."}}'
```

The default API key field is `values.apiKey`. Some providers declare extra fields in their
`auth[].extraFields`; unknown fields are rejected so scripts and provider definitions fail fast when
they drift.

Check configured connections and the safe account identity exposed to agents:

```bash
curl -s http://localhost:3000/api/connections
```

### 4. Configure An OAuth2 Connection

OAuth2 providers use your own provider OAuth app. First list OAuth-capable providers and copy the
`expectedRedirectUri` for the service you want:

```bash
curl -s http://localhost:3000/api/oauth/configs
```

With the default port, GitHub expects:

```text
http://localhost:3000/oauth/callback/github
```

If you change `PORT`, `HOST`, or run behind a tunnel, set `OOMOL_CONNECT_ORIGIN` before starting the
runtime. The callback URL shown in `expectedRedirectUri` is the exact URL to paste into the provider
OAuth app.

Store the OAuth client credentials locally:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/github \
  -H 'content-type: application/json' \
  -d '{"clientId":"...","clientSecret":"..."}'
```

Start authorization:

```bash
curl -s -X POST http://localhost:3000/api/oauth/authorizations \
  -H 'content-type: application/json' \
  -d '{"service":"github"}'
```

Open the returned `authorizationUrl` in a browser. After the provider redirects back to the local
callback URL, the runtime stores the OAuth credential as the default connection. Add
`"connectionName":"work"` to the authorization request to store the OAuth result as a named
connection.

### 5. Execute Actions

Execute an action through the public runtime API:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_authenticated_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

When `OOMOL_CONNECT_RUNTIME_TOKEN` is enabled, include the runtime bearer token:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_authenticated_user \
  -H 'authorization: Bearer replace-with-a-runtime-token' \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

If a service has an existing named connection, select it with `x-oo-connector-alias`:

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_authenticated_user \
  -H 'x-oo-connector-alias: work' \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

The `alias` query parameter is also accepted:

```bash
curl -s -X POST "http://localhost:3000/v1/actions/github.get_authenticated_user?alias=work" \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

Recent local runs are available from:

```bash
curl -s http://localhost:3000/api/runs
```

Use `OOMOL_CONNECT_ALLOWED_ACTIONS` and `OOMOL_CONNECT_BLOCKED_ACTIONS` to constrain which actions
agents can execute.

### 6. Use MCP Or OpenAPI

MCP clients can connect to:

```text
http://localhost:3000/mcp
```

Discovery-oriented MCP tool metadata is available at:

```bash
curl -s http://localhost:3000/mcp/tools
```

OpenAPI is available at:

```text
http://localhost:3000/openapi.json
http://localhost:3000/docs
```

## Project Layout

```text
src/
  core/                     Core provider/action contracts and validation
  connections/              Local connection and credential handling
  oauth/                    Local OAuth client configuration and callback flow
  providers/                Provider definitions and lazy-loaded executors
  server/                   Local HTTP server
web/                        Vite local console package
catalog/apps/               Generated public catalog JSON
examples/                   Runnable local examples
scripts/                    Catalog and registry generation tools
.codex/skills/add-provider/ Agent-readable provider contribution workflow
docs/                       User and contributor documentation
```

## Development

```bash
npm run generate:catalog
npm run lint
npm run format
npm test
npm run build
```

Formatting and linting use `oxfmt` and `oxlint`.

## Adding Providers

Provider code lives under `src/providers/<service>`.

Use the provider contribution skill:

[.codex/skills/add-provider/SKILL.md](.codex/skills/add-provider/SKILL.md)

Typical provider workflow:

```bash
npm run generate:catalog
npm test
npm run build
```

Provider definitions generate catalog JSON. Provider executors are loaded only when one of that
provider's actions is executed.

## Runtime API

Agent and SDK-style clients should call the `/v1` runtime API. It returns a uniform JSON envelope:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": {}
}
```

The public runtime API exposes:

- `GET /v1/health`
- `GET /v1/providers`
- `GET /v1/actions`
- `GET /v1/actions?service=<service>`
- `GET /v1/actions/:actionId`
- `POST /v1/actions/:actionId`
- `GET /v1/apps`
- `GET /v1/apps/services/:service`
- `GET /v1/apps/authenticated`
- `POST /v1/proxy/:service`

`POST /v1/proxy/:service` currently returns `proxy_not_supported` until a provider proxy runtime is
implemented.

## Local Admin API

Local admin endpoints are used by the web console, examples, and setup scripts:

- `GET /health`
- `GET /api/providers`
- `GET /api/providers/:service`
- `GET /api/actions`
- `GET /api/actions/:actionId`
- `GET /api/actions/:actionId/agent.md`
- `POST /api/actions/:actionId/runs`
- `GET /api/connections`
- `PUT /api/connections/:service`
- `DELETE /api/connections/:service`
- `GET /api/oauth/configs`
- `PUT /api/oauth/configs/:service`
- `DELETE /api/oauth/configs/:service`
- `POST /api/oauth/authorizations`
- `GET /oauth/callback/:service`
- `GET /api/runs`
- `POST /mcp`
- `GET /mcp/tools`
- `GET /openapi.json`

Credential request fields are declared by each provider's catalog `auth` metadata. The runtime
rejects unknown credential fields and required fields with empty values so local scripts, future UI
forms, and provider definitions stay aligned.

Credential validators may attach a stable connection profile with `accountId`, `displayName`, and
known `grantedScopes`. This profile is safe to expose in `/api/connections`, MCP action discovery,
agent guides, and recent run logs.

## Documentation

- [Quickstart](docs/quickstart.md)
- [Configuration](docs/configuration.md)
- [Catalog format](docs/catalog-format.md)
- [Credentials](docs/credentials.md)
- [Verification language](docs/verification.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)

## License Scope

Unless otherwise noted, the source code, scripts, generated project scaffolding, tests, and
documentation authored for this repository are licensed under the Apache License, Version 2.0. See
[LICENSE.txt](LICENSE.txt).

The Apache-2.0 license for this repository does not grant rights to third-party products,
providers, apps, APIs, trademarks, service marks, trade names, logos, icons, brand assets,
documentation, screenshots, or other copyrighted materials owned by their respective holders.

Provider and app names, metadata, links, scopes, permissions, and optional logos/icons are included
only to identify services and enable interoperability. All third-party brand and product rights
remain with their respective owners. Inclusion in this catalog does not imply endorsement,
sponsorship, partnership, certification, or verification by those owners.

If you contribute provider metadata or assets, only submit material you have the right to submit.
Prefer linking to official public assets instead of copying brand files into this repository.

## Community

Please keep issues and pull requests focused, respectful, and actionable. Participation in this
project is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
