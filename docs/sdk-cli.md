# SDK And CLI

OpenConnector can be used directly through MCP and HTTP, and it also has dedicated developer tools
for application and agent workflows.

## Connector SDK

[Connector SDK](https://github.com/oomol-lab/connector-sdk) is the TypeScript client for calling
connector Actions from apps and agent runtimes. Use it when you want to execute Actions, proxy
upstream provider APIs, or inspect the runtime catalog from code.

Install:

```bash
npm install @oomol-lab/connector
```

Minimal usage:

```ts
import { Connector } from "@oomol-lab/connector";

const connector = new Connector({
  apiKey: process.env.OOMOL_API_KEY!,
  baseUrl: "http://localhost:3000/v1",
});

const user = await connector.github.get_current_user({});
console.log(user);
```

The SDK keeps provider credentials behind the gateway. The client sends connector API requests; the
runtime authorizes and executes the provider Action.

## oo CLI

[oo CLI](https://github.com/oomol-lab/oo-cli) is the command-line toolkit for local AI agent
workflows. Use it when you want an agent on your machine to discover and call connected account
capabilities through a consistent command-line entry.

Install on macOS or Linux:

```bash
curl -fsSL https://cli.oomol.com/install.sh | bash
```

Install on Windows PowerShell:

```powershell
irm https://cli.oomol.com/install.ps1 | iex
```

Then authenticate:

```bash
oo login
```

## Protocol APIs

For custom clients, scripts, or agent hosts that do not use the SDK or CLI, use:

- MCP: `http://localhost:3000/mcp`
- HTTP runtime API: `/v1/actions`
- OpenAPI: `/openapi.json`

See [runtime-api.md](runtime-api.md) for protocol-level details.
