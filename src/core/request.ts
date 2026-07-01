/**
 * Query parameter values accepted by provider HTTP helpers.
 */
export type QueryValue = string | number | boolean | null | undefined;

/**
 * Convert defined scalar values into URL query strings.
 *
 * Empty strings, null, and undefined are omitted because provider list APIs
 * usually treat them as absent filters rather than meaningful values.
 */
export function queryParams(input: Record<string, QueryValue>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    output[key] = String(value);
  }
  return output;
}

/**
 * Convert boolean query flags where true is encoded as "1" and false as "0".
 */
export function queryFlag(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? "1" : "0";
}

/**
 * Return a shallow JSON object without undefined values.
 */
export function jsonObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

const privateHostnames = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const privateHostnameSuffixes = [".localhost", ".local"];
const privateIpv4Cidrs: Array<[number, number]> = [
  [ipv4ToNumber("0.0.0.0"), 8],
  [ipv4ToNumber("10.0.0.0"), 8],
  [ipv4ToNumber("100.64.0.0"), 10],
  [ipv4ToNumber("127.0.0.0"), 8],
  [ipv4ToNumber("169.254.0.0"), 16],
  [ipv4ToNumber("172.16.0.0"), 12],
  [ipv4ToNumber("192.0.0.0"), 24],
  [ipv4ToNumber("192.0.2.0"), 24],
  [ipv4ToNumber("192.168.0.0"), 16],
  [ipv4ToNumber("198.18.0.0"), 15],
  [ipv4ToNumber("198.51.100.0"), 24],
  [ipv4ToNumber("203.0.113.0"), 24],
  [ipv4ToNumber("224.0.0.0"), 4],
  [ipv4ToNumber("240.0.0.0"), 4],
];

export interface PublicHttpUrlOptions {
  fieldName: string;
  createError: (message: string) => Error;
}

/**
 * Parse a user-supplied URL and reject local/private network targets.
 *
 * This is a local runtime SSRF guard for provider actions that fetch remote
 * user-supplied content before uploading it to an upstream provider.
 */
export function assertPublicHttpUrl(value: string, options: PublicHttpUrlOptions): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw options.createError(`${options.fieldName} must be a valid URL`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw options.createError(`${options.fieldName} must use http or https`);
  }

  const hostname = url.hostname.toLowerCase();
  if (privateHostnames.has(hostname) || privateHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw options.createError(`${options.fieldName} must not target local hosts`);
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4 !== undefined && privateIpv4Cidrs.some(([network, bits]) => ipv4InCidr(ipv4, network, bits))) {
    throw options.createError(`${options.fieldName} must not target private or reserved IP addresses`);
  }

  if (hostname.includes(":")) {
    throw options.createError(`${options.fieldName} must not target IPv6 addresses`);
  }

  return url;
}

function parseIpv4(hostname: string): number | undefined {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return undefined;
  }

  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return undefined;
    }
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return undefined;
    }
    value = (value << 8) + octet;
  }

  return value >>> 0;
}

function ipv4ToNumber(value: string): number {
  const parsed = parseIpv4(value);
  if (parsed === undefined) {
    throw new Error(`invalid IPv4 CIDR base: ${value}`);
  }
  return parsed;
}

function ipv4InCidr(value: number, network: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (network & mask);
}
