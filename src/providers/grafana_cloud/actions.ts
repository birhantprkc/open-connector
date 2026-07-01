import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { grafanaCloudGeneratedActionSchemas } from "./generated.ts";

const service = "grafana_cloud";

export type GrafanaCloudActionName = (typeof grafanaCloudGeneratedActionSchemas)[number]["name"];

export const grafanaCloudActions: ActionDefinition[] = grafanaCloudGeneratedActionSchemas.map((actionSchema) =>
  defineProviderAction(service, {
    name: actionSchema.name,
    description: actionSchema.description,
    requiredScopes: actionSchema.requiredScopes,
    providerPermissions: actionSchema.providerPermissions,
    inputSchema: actionSchema.inputSchema as JsonSchema,
    outputSchema: actionSchema.outputSchema as JsonSchema,
  }),
);
