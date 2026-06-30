import { serve } from "@hono/node-server";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadCatalog } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { ActionPolicyService, parseActionPolicyList } from "../core/action-policy.ts";
import { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthCredentialRefreshService } from "../oauth/oauth-credential-refresh-service.ts";
import { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { ActionRunner } from "./action-runner.ts";
import { ConnectServer } from "./connect-server.ts";
import { createSecretCodec } from "./secret-codec.ts";
import { SqliteRuntimeDatabase } from "./sqlite-runtime-store.ts";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
const publicOrigin = process.env.OOMOL_CONNECT_ORIGIN ?? `http://localhost:${port}`;
const dataDir = process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data");
const secretCodec = createSecretCodec(process.env.OOMOL_CONNECT_ENCRYPTION_KEY);
const legacyApiToken = process.env.OOMOL_CONNECT_API_TOKEN;
const adminToken = process.env.OOMOL_CONNECT_ADMIN_TOKEN ?? legacyApiToken;
const runtimeToken = process.env.OOMOL_CONNECT_RUNTIME_TOKEN ?? legacyApiToken;
const actionPolicy = new ActionPolicyService({
  allowedActions: parseActionPolicyList(process.env.OOMOL_CONNECT_ALLOWED_ACTIONS),
  blockedActions: parseActionPolicyList(process.env.OOMOL_CONNECT_BLOCKED_ACTIONS),
});
const sourceRoot = join(process.cwd(), "web");
const builtRoot = join(process.cwd(), "dist/web");
const staticRoot = await resolveStaticRoot(builtRoot, sourceRoot);
await mkdir(dataDir, { recursive: true });
const catalog = await loadCatalog();
const providerLoader = new ProviderLoader();
const runtimeDatabase = new SqliteRuntimeDatabase(join(dataDir, "connect.sqlite"), {
  secretCodec,
});
const oauthClientConfigs = new OAuthClientConfigService({
  catalog,
  origin: publicOrigin,
  store: runtimeDatabase.oauthClientConfigStore,
});
const connections = new ConnectionService({
  catalog,
  oauthCredentials: new OAuthCredentialRefreshService(oauthClientConfigs),
  providerLoader,
  store: runtimeDatabase.connectionStore,
});
const actions = new ActionRunner({
  catalog,
  providerLoader,
  connections,
  runs: runtimeDatabase.runLogStore,
  actionPolicy,
});
const app = new ConnectServer({
  catalog,
  providerLoader,
  connections,
  oauthClientConfigs,
  oauthFlow: new OAuthFlowService({
    clientConfigs: oauthClientConfigs,
    connections,
    states: runtimeDatabase.oauthStateStore,
  }),
  actions,
  staticRoot,
  auth: {
    adminToken,
    runtimeToken,
  },
  actionPolicy,
}).createApp();

process.once("SIGINT", () => {
  runtimeDatabase.close();
  process.exit(0);
});
process.once("SIGTERM", () => {
  runtimeDatabase.close();
  process.exit(0);
});

serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    console.log(`connect server listening on http://${hostname}:${info.port}`);
    console.log(`runtime data directory: ${dataDir}`);
    if (!adminToken) {
      console.warn("local admin authentication is disabled; set OOMOL_CONNECT_ADMIN_TOKEN to require bearer tokens");
    }
    if (!runtimeToken) {
      console.warn("runtime API authentication is disabled; set OOMOL_CONNECT_RUNTIME_TOKEN to require bearer tokens");
    }
    if (!secretCodec.encrypted) {
      console.warn(
        "local credential encryption is disabled; set OOMOL_CONNECT_ENCRYPTION_KEY to encrypt stored credentials",
      );
    }
  },
);

async function resolveStaticRoot(primary: string, fallback: string): Promise<string> {
  try {
    await access(join(primary, "index.html"));
    return primary;
  } catch {
    return fallback;
  }
}
