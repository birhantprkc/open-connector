import type { JsonSchema } from "../../core/types.ts";

export interface GrafanaCloudGeneratedActionSchema {
  name: string;
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export const grafanaCloudGeneratedActionSchemas: GrafanaCloudGeneratedActionSchema[] = [
  {
    name: "list_regions",
    description: "List Grafana Cloud stack regions that can host Grafana Cloud stacks.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
      description: "Input for listing Grafana Cloud stack regions.",
    },
    outputSchema: {
      type: "object",
      properties: {
        regions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["integer", "null"],
                description: "The Grafana Cloud region ID.",
              },
              slug: {
                type: ["string", "null"],
                description: "The Grafana Cloud region slug.",
              },
              name: {
                type: ["string", "null"],
                description: "The Grafana Cloud region name.",
              },
              status: {
                type: ["string", "null"],
                description: "The Grafana Cloud region status.",
              },
              provider: {
                type: ["string", "null"],
                description: "The infrastructure provider for the region.",
              },
              description: {
                type: ["string", "null"],
                description: "The region description.",
              },
              raw: {
                type: "object",
                properties: {},
                additionalProperties: true,
                description: "The raw Grafana Cloud API object.",
              },
            },
            required: ["id", "slug", "name", "status", "provider", "description", "raw"],
            additionalProperties: false,
            description: "A normalized Grafana Cloud stack region.",
          },
          description: "Regions returned by Grafana Cloud.",
        },
        raw: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana Cloud API object.",
        },
      },
      required: ["regions", "raw"],
      additionalProperties: false,
      description: "Grafana Cloud stack regions response.",
    },
  },
  {
    name: "list_stacks",
    description: "List Grafana Cloud stacks in the connected organization.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        pageSize: {
          type: "integer",
          minimum: 1,
          description: "The number of records to request from Grafana Cloud.",
        },
        pageCursor: {
          type: "string",
          minLength: 1,
          description: "The Grafana Cloud pagination cursor from a previous response.",
        },
      },
      additionalProperties: false,
      description: "Input for listing Grafana Cloud stacks.",
    },
    outputSchema: {
      type: "object",
      properties: {
        stacks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["integer", "null"],
                description: "The Grafana Cloud stack ID.",
              },
              slug: {
                type: ["string", "null"],
                description: "The Grafana Cloud stack slug.",
              },
              name: {
                type: ["string", "null"],
                description: "The Grafana Cloud stack name.",
              },
              url: {
                type: ["string", "null"],
                description: "The Grafana Cloud stack URL.",
              },
              status: {
                type: ["string", "null"],
                description: "The Grafana Cloud stack status.",
              },
              orgSlug: {
                type: ["string", "null"],
                description: "The Grafana Cloud organization slug.",
              },
              orgName: {
                type: ["string", "null"],
                description: "The Grafana Cloud organization name.",
              },
              regionSlug: {
                type: ["string", "null"],
                description: "The Grafana Cloud region slug for the stack.",
              },
              planName: {
                type: ["string", "null"],
                description: "The Grafana Cloud plan name for the stack.",
              },
              raw: {
                type: "object",
                properties: {},
                additionalProperties: true,
                description: "The raw Grafana Cloud API object.",
              },
            },
            required: ["id", "slug", "name", "url", "status", "orgSlug", "orgName", "regionSlug", "planName", "raw"],
            additionalProperties: false,
            description: "A normalized Grafana Cloud stack.",
          },
          description: "Stacks returned by Grafana Cloud.",
        },
        nextPageCursor: {
          type: ["string", "null"],
          description: "The cursor to pass as pageCursor for the next Grafana Cloud stacks request.",
        },
        nextPage: {
          type: ["string", "null"],
          description: "The next page URL returned by Grafana Cloud, if present.",
        },
        raw: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana Cloud API object.",
        },
      },
      required: ["stacks", "nextPageCursor", "nextPage", "raw"],
      additionalProperties: false,
      description: "Grafana Cloud stacks response.",
    },
  },
  {
    name: "get_stack_connectivity",
    description: "Get private connectivity information for a Grafana Cloud stack.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        stackSlug: {
          type: "string",
          minLength: 1,
          description: "The Grafana Cloud stack slug.",
        },
      },
      required: ["stackSlug"],
      additionalProperties: false,
      description: "Input for retrieving Grafana Cloud stack connectivity.",
    },
    outputSchema: {
      type: "object",
      properties: {
        connectivity: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana Cloud API object.",
        },
      },
      required: ["connectivity"],
      additionalProperties: false,
      description: "Grafana Cloud stack connectivity response.",
    },
  },
  {
    name: "get_billed_usage",
    description: "Get Grafana Cloud billed usage for the connected organization by month.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        month: {
          type: "integer",
          minimum: 1,
          maximum: 12,
          description: "The billing month to retrieve, from 1 to 12.",
        },
        year: {
          type: "integer",
          minimum: 2000,
          description: "The billing year to retrieve.",
        },
      },
      required: ["month", "year"],
      additionalProperties: false,
      description: "Input for retrieving Grafana Cloud billed usage.",
    },
    outputSchema: {
      type: "object",
      properties: {
        usage: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["integer", "null"],
                description: "The Grafana Cloud billed usage item ID.",
              },
              dimensionId: {
                type: ["string", "null"],
                description: "The billed usage dimension ID.",
              },
              dimensionName: {
                type: ["string", "null"],
                description: "The billed usage dimension name.",
              },
              unit: {
                type: ["string", "null"],
                description: "The usage unit.",
              },
              includedUsage: {
                type: ["number", "null"],
                description: "The included usage quantity.",
              },
              totalUsage: {
                type: ["number", "null"],
                description: "The total usage quantity.",
              },
              overage: {
                type: ["number", "null"],
                description: "The overage quantity.",
              },
              amountDue: {
                type: ["number", "null"],
                description: "The amount due for this usage item.",
              },
              raw: {
                type: "object",
                properties: {},
                additionalProperties: true,
                description: "The raw Grafana Cloud API object.",
              },
            },
            required: [
              "id",
              "dimensionId",
              "dimensionName",
              "unit",
              "includedUsage",
              "totalUsage",
              "overage",
              "amountDue",
              "raw",
            ],
            additionalProperties: false,
            description: "A normalized Grafana Cloud billed usage item.",
          },
          description: "Billed usage items returned by Grafana Cloud.",
        },
        raw: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana Cloud API object.",
        },
      },
      required: ["usage", "raw"],
      additionalProperties: false,
      description: "Grafana Cloud billed usage response.",
    },
  },
];
