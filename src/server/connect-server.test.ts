import type { IConnectionStore, StoredConnection } from "../connection-service.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { ActionDefinition, ActionExecutor, ProviderDefinition, ResolvedCredential } from "../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "../oauth/oauth-flow-service.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { IRunLogStore, RunLog } from "./runtime-store.ts";

import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { ActionPolicyService as LocalActionPolicyService } from "../core/action-policy.ts";
import { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { ActionRunner } from "./action-runner.ts";
import { ConnectServer } from "./connect-server.ts";

const apiKeyProvider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [{ type: "api_key" }],
  actions: [],
};

const echoAction: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo input.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};

const followUpAction: ActionDefinition = {
  ...echoAction,
  id: "example.follow_up",
  name: "follow_up",
};

describe("ConnectServer", () => {
  it("serves catalog and standard connection errors without opening a port", async () => {
    const app = createTestServer([apiKeyProvider]).createApp();

    const catalogResponse = await app.request("/api/providers/example");
    await expect(catalogResponse.json()).resolves.toMatchObject({
      service: "example",
      displayName: "Example",
    });

    const connectionResponse = await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: {} }),
    });

    expect(connectionResponse.status).toBe(400);
    await expect(connectionResponse.json()).resolves.toEqual({
      error: {
        code: "invalid_input",
        message: "apiKey is required.",
      },
    });
  });

  it("requires a local API token when configured", async () => {
    const app = createTestServer([apiKeyProvider], {
      auth: { adminToken: "local-token", runtimeToken: "runtime-token" },
    }).createApp();

    expect((await app.request("/health")).status).toBe(200);

    const unauthorized = await app.request("/api/providers/example");
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({
      error: {
        code: "unauthorized",
        message: "A valid local API token is required.",
      },
    });

    const authorized = await app.request("/api/providers/example", {
      headers: { authorization: "Bearer local-token" },
    });
    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toMatchObject({
      service: "example",
    });

    const runtimeUnauthorized = await app.request("/v1/actions", {
      headers: { authorization: "Bearer local-token" },
    });
    expect(runtimeUnauthorized.status).toBe(401);

    const runtimeAuthorized = await app.request("/v1/actions", {
      headers: { authorization: "Bearer runtime-token" },
    });
    expect(runtimeAuthorized.status).toBe(200);
  });

  it("stores redacted run log summaries for HTTP action execution", async () => {
    const runs = new MemoryRunLogStore();
    const server = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
        runs,
      },
    );
    const app = server.createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const response = await app.request("/api/actions/example.echo/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          query: "hello",
          apiKey: "secret-key",
          nested: { password: "secret-password" },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(runs.list()).toMatchObject([
      {
        actionId: "example.echo",
        caller: "http",
        ok: true,
        connectionProfile: {
          accountId: "example-account",
          displayName: "Example Account",
          grantedScopes: [],
        },
        inputSummary: {
          query: "hello",
          apiKey: "[redacted]",
          nested: { password: "[redacted]" },
        },
      },
    ]);
  });

  it("creates named connections and runs actions with aliases", async () => {
    const runs = new MemoryRunLogStore();
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
        runs,
      },
    ).createApp();

    const connection = await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authType: "api_key",
        connectionName: "work",
        values: { apiKey: "work-key" },
      }),
    });
    expect(connection.status).toBe(200);
    await expect(connection.json()).resolves.toMatchObject({
      service: "example",
      connectionName: "work",
      default: false,
    });

    const run = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oo-connector-alias": "work",
      },
      body: JSON.stringify({ input: { message: "hello" } }),
    });
    expect(run.status).toBe(200);
    await expect(run.json()).resolves.toMatchObject({
      success: true,
      data: { message: "hello" },
    });
    expect(runs.list()).toMatchObject([
      {
        connectionProfile: {
          displayName: "Example Account",
        },
      },
    ]);
  });

  it("renders agent guides with current connection and provider permissions", async () => {
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [
            {
              ...echoAction,
              requiredScopes: ["messages.read"],
              providerPermissions: ["messages:read"],
            },
          ],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const response = await app.request("/api/actions/example.echo/agent.md");

    expect(response.status).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain("## Current Connection");
    expect(markdown).toContain("Example Account");
    expect(markdown).toContain("`example-account`");
    expect(markdown).toContain("`messages:read`");
  });

  it("renders markdown descriptions and escapes union type separators in parameter tables", async () => {
    const app = createTestServer([
      {
        ...apiKeyProvider,
        actions: [
          {
            ...echoAction,
            description: "Echo **input**.\n\n- Supports markdown descriptions.",
            inputSchema: {
              type: "object",
              properties: {
                cc: {
                  anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
                  description: "Cc recipients.\n\n- Use **email** addresses.\n- Accepts multiple values.",
                },
              },
            },
          },
        ],
      },
    ]).createApp();

    const response = await app.request("/api/actions/example.echo/agent.md");

    expect(response.status).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain("Echo **input**.\n\n- Supports markdown descriptions.");
    expect(markdown).toContain("| `cc` | No       | `string \\| array` |");
    expect(markdown).toContain(
      "- `cc`\n\n  Cc recipients.\n\n  - Use **email** addresses.\n  - Accepts multiple values.",
    );
    expect(markdown).not.toContain("| `cc` | No       | `string | array` |");
  });

  it("applies local action policy before executing HTTP actions", async () => {
    const runs = new MemoryRunLogStore();
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        actionPolicy: new LocalActionPolicyService({
          blockedActions: ["example.echo"],
        }),
        providerLoader: new EchoProviderLoader(),
        runs,
      },
    ).createApp();

    const response = await app.request("/api/actions/example.echo/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "action_blocked",
      },
    });
    expect(runs.list()).toMatchObject([
      {
        actionId: "example.echo",
        ok: false,
        errorCode: "action_blocked",
      },
    ]);
  });

  it("serves the public v1 runtime catalog and action envelope", async () => {
    const actionWithFollowUp: ActionDefinition = {
      ...echoAction,
      followUpActions: ["example.follow_up"],
    };
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [actionWithFollowUp, followUpAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const providers = await app.request("/v1/providers");
    expect(providers.status).toBe(200);
    await expect(providers.json()).resolves.toMatchObject({
      success: true,
      data: [
        {
          service: "example",
          displayName: "Example",
          categories: [{ id: "Developer Tools", displayName: "Developer Tools" }],
          authTypes: ["api_key"],
        },
      ],
    });

    const actionServices = await app.request("/v1/actions");
    expect(actionServices.status).toBe(200);
    await expect(actionServices.json()).resolves.toMatchObject({
      success: true,
      data: [{ service: "example" }],
    });

    const actions = await app.request("/v1/actions?service=example");
    expect(actions.status).toBe(200);
    await expect(actions.json()).resolves.toMatchObject({
      success: true,
      data: [
        {
          id: "example.echo",
          service: "example",
          followUpActions: [{ actionId: "example.follow_up" }],
        },
        {
          id: "example.follow_up",
          service: "example",
          followUpActions: [],
        },
      ],
    });

    const action = await app.request("/v1/actions/example.echo");
    expect(action.status).toBe(200);
    await expect(action.json()).resolves.toMatchObject({
      success: true,
      meta: {},
      data: {
        id: "example.echo",
        service: "example",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        followUpActions: [{ actionId: "example.follow_up" }],
        asyncLifecycle: null,
      },
    });

    const run = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { message: "hello" } }),
    });
    expect(run.status).toBe(200);
    await expect(run.json()).resolves.toMatchObject({
      success: true,
      message: "OK",
      data: { message: "hello" },
      meta: {
        actionId: "example.echo",
      },
    });
  });

  it("serves v1 apps and authenticated service views without leaking credentials", async () => {
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const apps = await app.request("/v1/apps");
    expect(apps.status).toBe(200);
    const appsBody = await apps.json();
    expect(appsBody).toMatchObject({
      success: true,
      meta: {},
      data: [
        {
          id: "example:default",
          service: "example",
          alias: "default",
          authType: "api_key",
          status: "active",
          isDefault: true,
        },
      ],
    });
    expect(JSON.stringify(appsBody)).not.toContain("example-key");

    const authenticated = await app.request("/v1/apps/authenticated?service=example&service=missing");
    expect(authenticated.status).toBe(200);
    await expect(authenticated.json()).resolves.toMatchObject({
      success: true,
      data: ["example"],
    });
  });

  it("maps v1 runtime failures to stable envelopes", async () => {
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    const unknown = await app.request("/v1/actions/example.missing");
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toMatchObject({
      success: false,
      errorCode: "invalid_input",
      meta: { actionId: "example.missing" },
    });

    const missingConnection = await app.request("/v1/actions/example.echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oomol-connector-alias": "work",
      },
      body: JSON.stringify({ input: {} }),
    });
    expect(missingConnection.status).toBe(404);
    await expect(missingConnection.json()).resolves.toMatchObject({
      success: false,
      errorCode: "connection_not_found",
    });

    const proxy = await app.request("/v1/proxy/example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "/anything", method: "GET" }),
    });
    expect(proxy.status).toBe(501);
    await expect(proxy.json()).resolves.toMatchObject({
      success: false,
      errorCode: "proxy_not_supported",
    });
  });
});

interface CreateTestServerOptions {
  auth?: { adminToken?: string; runtimeToken?: string };
  actionPolicy?: ActionPolicyService;
  providerLoader?: IProviderLoader;
  runs?: MemoryRunLogStore;
}

function createTestServer(providers: ProviderDefinition[], options: CreateTestServerOptions = {}): ConnectServer {
  const catalog = createCatalogStore(providers, {
    executableActionIds: ["example.echo"],
  });
  const providerLoader = options.providerLoader ?? new EmptyProviderLoader();
  const runs = options.runs ?? new MemoryRunLogStore();
  const connections = new ConnectionService({
    catalog,
    providerLoader,
    store: new MemoryConnectionStore(),
  });
  const clientConfigs = new OAuthClientConfigService({
    catalog,
    origin: "http://localhost:3000",
    store: new MemoryOAuthClientConfigStore(),
  });

  const actionRunner = new ActionRunner({
    catalog,
    providerLoader,
    connections,
    runs,
    actionPolicy: options.actionPolicy,
  });

  return new ConnectServer({
    catalog,
    providerLoader,
    connections,
    oauthClientConfigs: clientConfigs,
    oauthFlow: new OAuthFlowService({
      clientConfigs,
      connections,
      states: new MemoryOAuthStateStore(),
    }),
    actions: actionRunner,
    staticRoot: ".tmp/test-static",
    auth: options.auth,
    actionPolicy: options.actionPolicy,
  });
}

class EmptyProviderLoader implements IProviderLoader {
  async loadActionExecutor(): Promise<never> {
    throw new Error("No actions are available in this test.");
  }

  async loadCredentialValidators(): Promise<undefined> {
    return undefined;
  }
}

class EchoProviderLoader implements IProviderLoader {
  async loadActionExecutor(): Promise<ActionExecutor> {
    return async (input, context) => {
      await context.getCredential("example");
      return { ok: true, output: input };
    };
  }

  async loadCredentialValidators(): Promise<{
    apiKey(): Promise<{
      profile: {
        accountId: string;
        displayName: string;
        grantedScopes: string[];
      };
    }>;
  }> {
    return {
      async apiKey() {
        return {
          profile: {
            accountId: "example-account",
            displayName: "Example Account",
            grantedScopes: [],
          },
        };
      },
    };
  }
}

class MemoryConnectionStore implements IConnectionStore {
  private readonly store = new Map<string, ResolvedCredential>();

  async get(service: string, connectionName: string): Promise<ResolvedCredential | undefined> {
    return this.store.get(createConnectionKey(service, connectionName));
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<void> {
    this.store.set(createConnectionKey(service, connectionName), credential);
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.store.delete(createConnectionKey(service, connectionName));
  }

  async list(): Promise<StoredConnection[]> {
    return [...this.store.entries()].map(([key, credential]) => {
      const [service, connectionName] = key.split(":");
      return {
        service: service!,
        connectionName: connectionName!,
        credential,
      };
    });
  }
}

function createConnectionKey(service: string, connectionName: string): string {
  return `${service}:${connectionName}`;
}

class MemoryOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly configs = new Map<string, OAuthClientConfig>();

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    return this.configs.get(service);
  }

  async set(config: OAuthClientConfig): Promise<void> {
    this.configs.set(config.service, config);
  }

  async delete(service: string): Promise<void> {
    this.configs.delete(service);
  }

  async list(): Promise<OAuthClientConfig[]> {
    return [...this.configs.values()];
  }
}

class MemoryOAuthStateStore implements IOAuthStateStore {
  async set(_state: OAuthAuthorizationState): Promise<void> {}

  async take(_state: string): Promise<OAuthAuthorizationState | undefined> {
    return undefined;
  }
}

class MemoryRunLogStore implements IRunLogStore {
  private readonly runs: RunLog[] = [];

  add(run: RunLog): void {
    this.runs.unshift(run);
  }

  list(): RunLog[] {
    return this.runs;
  }
}
