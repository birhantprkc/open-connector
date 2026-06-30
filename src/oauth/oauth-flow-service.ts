import type { ConnectionService } from "../connection-service.ts";
import type { OAuthClientConfigService } from "./oauth-client-config-service.ts";

import { requestAuthorizationCodeToken } from "./oauth-token.ts";

/**
 * Started OAuth authorization flow returned to the local console.
 */
export type OAuthAuthorizationStart = {
  authorizationUrl: string;
  state: string;
};

export interface OAuthAuthorizationStartInput {
  service: string;
  connectionName?: string;
}

/**
 * Short-lived OAuth state stored while the browser completes authorization.
 */
export type OAuthAuthorizationState = {
  service: string;
  connectionName?: string;
  state: string;
  createdAt: string;
};

/**
 * Storage contract for pending OAuth authorization states.
 */
export interface IOAuthStateStore {
  set(state: OAuthAuthorizationState): Promise<void>;
  take(state: string): Promise<OAuthAuthorizationState | undefined>;
}

/**
 * Coordinates localhost OAuth authorization and token exchange.
 */
export class OAuthFlowService {
  private readonly clientConfigs: OAuthClientConfigService;
  private readonly connections: ConnectionService;
  private readonly states: IOAuthStateStore;

  constructor(input: {
    clientConfigs: OAuthClientConfigService;
    connections: ConnectionService;
    states: IOAuthStateStore;
  }) {
    this.clientConfigs = input.clientConfigs;
    this.connections = input.connections;
    this.states = input.states;
  }

  async startAuthorization(input: OAuthAuthorizationStartInput): Promise<OAuthAuthorizationStart> {
    const { service, connectionName } = input;
    const auth = this.clientConfigs.getOAuthDefinition(service);
    const config = await this.clientConfigs.getConfig(service);
    if (!config) {
      throw new OAuthFlowError("oauth_client_config_required", `Configure an OAuth client for ${service} first.`);
    }

    const state = crypto.randomUUID();
    await this.states.set({
      service,
      connectionName,
      state,
      createdAt: new Date().toISOString(),
    });

    const authorizationUrl = new URL(auth.authorizationUrl);
    authorizationUrl.searchParams.set("client_id", config.clientId);
    authorizationUrl.searchParams.set("redirect_uri", this.clientConfigs.expectedRedirectUri(service));
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("state", state);
    if (auth.scopes.length > 0) {
      authorizationUrl.searchParams.set("scope", auth.scopes.join(" "));
    }
    for (const [key, value] of Object.entries(auth.authorizationParams ?? {})) {
      authorizationUrl.searchParams.set(key, value);
    }

    return {
      authorizationUrl: authorizationUrl.toString(),
      state,
    };
  }

  async completeAuthorization(input: { state: string; code: string }): Promise<{ service: string; connected: true }> {
    const pending = await this.states.take(input.state);
    if (!pending) {
      throw new OAuthFlowError("invalid_oauth_state", "OAuth state is missing or expired.");
    }

    const auth = this.clientConfigs.getOAuthDefinition(pending.service);
    const config = await this.clientConfigs.getConfig(pending.service);
    if (!config) {
      throw new OAuthFlowError(
        "oauth_client_config_required",
        `Configure an OAuth client for ${pending.service} first.`,
      );
    }

    const tokenResponse = await requestAuthorizationCodeToken({
      code: input.code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: this.clientConfigs.expectedRedirectUri(pending.service),
      tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
      tokenRequestFormat: auth.tokenRequestFormat,
      tokenUrl: auth.tokenUrl,
      createError: (message) => new OAuthFlowError("oauth_token_exchange_failed", message),
    });

    await this.connections.setOAuthCredential(pending.service, tokenResponse, pending.connectionName);
    return {
      service: pending.service,
      connected: true,
    };
  }
}

/**
 * Error with a stable code suitable for HTTP responses.
 */
export class OAuthFlowError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
