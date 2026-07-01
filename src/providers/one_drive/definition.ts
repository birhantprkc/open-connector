import type { ProviderDefinition } from "../../core/types.ts";

import { oneDriveActions } from "./actions.ts";
import { oneDriveOAuthScopes } from "./scopes.ts";

const service = "one_drive";

/**
 * OneDrive provider backed by Microsoft Graph.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "OneDrive",
  categories: ["Storage", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: oneDriveOAuthScopes,
      redirectPath: "/oauth/callback/one_drive",
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        response_mode: "query",
      },
    },
  ],
  homepageUrl: "https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage",
  actions: oneDriveActions,
};
