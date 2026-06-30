import type { Context, MiddlewareHandler } from "hono";

import { getCookie, setCookie } from "hono/cookie";
import { jsonError } from "./http-utils.ts";

const authCookieName = "oomol_connect_api_token";

/**
 * Optional local API authentication for HTTP, web console, and MCP callers.
 */
export type LocalAuthOptions = {
  adminToken?: string;
  runtimeToken?: string;
};

type AuthScope = "admin" | "runtime";

export function createLocalAuthMiddleware(options: LocalAuthOptions): MiddlewareHandler {
  const adminToken = normalizeToken(options.adminToken);
  const runtimeToken = normalizeToken(options.runtimeToken);
  if (!adminToken && !runtimeToken) {
    return async (_context, next) => {
      await next();
    };
  }

  return async (context, next) => {
    if (
      isPublicPath(context.req.path) ||
      hasValidToken(context, tokenForScope(options, readAuthScope(context.req.path)))
    ) {
      await next();
      return;
    }

    return jsonError(context, 401, "unauthorized", "A valid local API token is required.");
  };
}

export function installLocalAuthCookie(context: Context, options: LocalAuthOptions): void {
  const token = normalizeToken(options.adminToken);
  if (!token) {
    return;
  }

  setCookie(context, authCookieName, token, {
    httpOnly: true,
    sameSite: "Strict",
    secure: context.req.url.startsWith("https://"),
    path: "/",
  });
}

function isPublicPath(path: string): boolean {
  return path === "/health" || path.startsWith("/oauth/callback/");
}

function hasValidToken(context: Context, token: string | undefined): boolean {
  if (!token) {
    return true;
  }

  const authorization = context.req.header("authorization") ?? "";
  if (authorization === `Bearer ${token}`) {
    return true;
  }

  return getCookie(context, authCookieName) === token;
}

function normalizeToken(token: string | undefined): string | undefined {
  const value = token?.trim();
  return value ? value : undefined;
}

function readAuthScope(path: string): AuthScope {
  return path.startsWith("/mcp") || path.startsWith("/v1/") ? "runtime" : "admin";
}

function tokenForScope(options: LocalAuthOptions, scope: AuthScope): string | undefined {
  const adminToken = normalizeToken(options.adminToken);
  const runtimeToken = normalizeToken(options.runtimeToken);
  return scope === "runtime" ? (runtimeToken ?? adminToken) : adminToken;
}
