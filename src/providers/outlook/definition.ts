import type { ProviderDefinition } from "../../core/types.ts";

import { outlookActions } from "./actions.ts";
import { outlookOAuthScopes } from "./scopes.ts";

const service = "outlook";

/**
 * Outlook provider backed by Microsoft Graph mail APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Outlook",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: outlookOAuthScopes,
      redirectPath: "/oauth/callback/outlook",
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        response_mode: "query",
      },
    },
  ],
  homepageUrl: "https://www.microsoft.com/microsoft-365/outlook/email-and-calendar-software-microsoft-outlook",
  actions: outlookActions,
};
