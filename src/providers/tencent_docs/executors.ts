import type { ExecutionContext, ExecutionResult, ProviderExecutors } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { ProviderRequestError, toProviderExecutionError } from "../provider-runtime.ts";
import { tencentDocsActionHandlers } from "./runtime.ts";

const service = "tencent_docs";

export const executors: ProviderExecutors = Object.fromEntries(
  Object.entries(tencentDocsActionHandlers).map(([name, handler]) => [
    `${service}.${name}`,
    async (input: unknown, context: ExecutionContext): Promise<ExecutionResult> => {
      try {
        const credential = await context.getCredential(service);
        if (credential?.authType !== "oauth2") {
          throw new ProviderRequestError(401, "Connect tencent_docs with OAuth first.");
        }
        const clientId =
          optionalString(credential.metadata.clientId) ??
          optionalString(credential.metadata.client_id) ??
          optionalString(credential.metadata.clientID);
        const openID =
          optionalString(credential.metadata.openID) ??
          optionalString(credential.metadata.openId) ??
          optionalString(credential.metadata.user_id);
        if (!clientId && name !== "get_current_user") {
          throw new ProviderRequestError(400, "tencent_docs OpenAPI actions require clientId in OAuth metadata.");
        }
        if (!openID && name !== "get_current_user") {
          throw new ProviderRequestError(400, "tencent_docs OpenAPI actions require openID in OAuth metadata.");
        }

        return {
          ok: true,
          output: await handler(input as Record<string, unknown>, {
            accessToken: credential.accessToken,
            clientId: clientId ?? "",
            openID: openID ?? "",
            fetcher: fetch,
            signal: context.signal,
          }),
        };
      } catch (error) {
        return toProviderExecutionError(error, "tencent_docs request failed");
      }
    },
  ]),
);
