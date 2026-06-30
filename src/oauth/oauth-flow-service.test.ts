import type { IConnectionStore, StoredConnection } from "../connection-service.ts";
import type { ActionExecutor, CredentialValidators, ProviderDefinition, ResolvedCredential } from "../core/types.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "./oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "./oauth-flow-service.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { OAuthClientConfigService } from "./oauth-client-config-service.ts";
import { OAuthFlowService } from "./oauth-flow-service.ts";

const oauthProvider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://example.com/oauth/authorize",
      tokenUrl: "https://example.com/oauth/token",
      scopes: ["read", "write"],
      redirectPath: "/oauth/callback/example",
      tokenEndpointAuthMethod: "client_secret_post",
      clientConfigFields: [
        {
          key: "tenant",
          label: "Tenant",
          inputType: "text",
          required: true,
          secret: false,
        },
      ],
    },
  ],
  actions: [],
};

describe("OAuthFlowService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds an authorization URL from user-provided client config", async () => {
    const services = createServices([oauthProvider]);
    await services.clientConfigs.upsertConfig({
      service: "example",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: {
        tenant: " default ",
      },
    });

    await expect(services.clientConfigs.getConfig("example")).resolves.toMatchObject({
      extra: {
        tenant: "default",
      },
    });

    const started = await services.flow.startAuthorization({ service: "example", connectionName: "work" });
    const authorizationUrl = new URL(started.authorizationUrl);

    expect(authorizationUrl.origin).toBe("https://example.com");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("http://localhost:3000/oauth/callback/example");
    expect(authorizationUrl.searchParams.get("scope")).toBe("read write");
    expect(authorizationUrl.searchParams.get("state")).toBe(started.state);
    expect(await services.states.take(started.state)).toMatchObject({
      service: "example",
      connectionName: "work",
    });
  });

  it("requires OAuth client config before authorization", async () => {
    const services = createServices([oauthProvider]);

    await expect(services.flow.startAuthorization({ service: "example" })).rejects.toMatchObject({
      code: "oauth_client_config_required",
    });
  });

  it("requires declared OAuth client config fields", async () => {
    const services = createServices([oauthProvider]);

    await expect(
      services.clientConfigs.upsertConfig({
        service: "example",
        clientId: "client-id",
        clientSecret: "client-secret",
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "tenant is required.",
    });
  });

  it("stores completed OAuth credentials under the requested connection name", async () => {
    const services = createServices([oauthProvider]);
    await services.clientConfigs.upsertConfig({
      service: "example",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: {
        tenant: "default",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "access-token", token_type: "Bearer" })),
    );

    const started = await services.flow.startAuthorization({ service: "example", connectionName: "work" });
    await expect(services.flow.completeAuthorization({ state: started.state, code: "code" })).resolves.toEqual({
      service: "example",
      connected: true,
    });

    await expect(services.connections.getCredential("example", "work")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "access-token",
    });
    await expect(services.connections.getCredential("example")).resolves.toBeUndefined();
  });
});

function createServices(providers: ProviderDefinition[]): {
  clientConfigs: OAuthClientConfigService;
  connections: ConnectionService;
  flow: OAuthFlowService;
  states: MemoryOAuthStateStore;
} {
  const catalog = createCatalogStore(providers);
  const connections = new ConnectionService({
    catalog,
    providerLoader: new EmptyProviderLoader(),
    store: new MemoryConnectionStore(),
  });
  const clientConfigs = new OAuthClientConfigService({
    catalog,
    origin: "http://localhost:3000",
    store: new MemoryOAuthClientConfigStore(),
  });

  const states = new MemoryOAuthStateStore();
  return {
    clientConfigs,
    connections,
    flow: new OAuthFlowService({
      clientConfigs,
      connections,
      states,
    }),
    states,
  };
}

class EmptyProviderLoader implements IProviderLoader {
  async loadActionExecutor(_service: string, _actionId: string): Promise<ActionExecutor | undefined> {
    return undefined;
  }

  async loadCredentialValidators(_service: string): Promise<CredentialValidators | undefined> {
    return undefined;
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
  private readonly states = new Map<string, OAuthAuthorizationState>();

  async set(state: OAuthAuthorizationState): Promise<void> {
    this.states.set(state.state, state);
  }

  async take(state: string): Promise<OAuthAuthorizationState | undefined> {
    const value = this.states.get(state);
    this.states.delete(state);
    return value;
  }
}
