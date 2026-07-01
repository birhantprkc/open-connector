import type { ProviderDefinition } from "../../core/types.ts";

import { gtmetrixActions } from "./actions.ts";

const service = "gtmetrix";

export const provider: ProviderDefinition = {
  service,
  displayName: "GTmetrix",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "gtmetrix_api_key",
      description:
        "GTmetrix API key used with HTTP Basic authentication. View or regenerate it at https://gtmetrix.com/api/",
    },
  ],
  homepageUrl: "https://gtmetrix.com",
  actions: gtmetrixActions,
};
