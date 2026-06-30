import type { ResolvedCredential } from "../core/types.ts";
import type { OAuthClientConfig } from "../oauth/oauth-client-config-service.ts";
import type { RunLog } from "./runtime-store.ts";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const backupFormat = "oomol-connect-runtime-backup";
const backupVersion = 1;

export type RuntimeDataSnapshot = {
  version: 1;
  exportedAt: string;
  connections: Array<{ service: string; credential: ResolvedCredential }>;
  oauthClientConfigs: OAuthClientConfig[];
  runs: RunLog[];
};

export type PlainRuntimeDataBackup = {
  format: typeof backupFormat;
  version: typeof backupVersion;
  exportedAt: string;
  encryption: {
    mode: "none";
  };
  payload: RuntimeDataSnapshot;
};

export type EncryptedRuntimeDataBackup = {
  format: typeof backupFormat;
  version: typeof backupVersion;
  exportedAt: string;
  encryption: {
    mode: "aes-256-gcm";
    kdf: "scrypt";
    salt: string;
    iv: string;
    tag: string;
  };
  payload: string;
};

export type RuntimeDataBackup = PlainRuntimeDataBackup | EncryptedRuntimeDataBackup;

export function createRuntimeDataSnapshot(input: {
  connections: Array<{ service: string; credential: ResolvedCredential }>;
  oauthClientConfigs: OAuthClientConfig[];
  runs: RunLog[];
  exportedAt?: string;
}): RuntimeDataSnapshot {
  return {
    version: backupVersion,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    connections: input.connections,
    oauthClientConfigs: input.oauthClientConfigs,
    runs: input.runs,
  };
}

export function encodeRuntimeDataBackup(input: {
  snapshot: RuntimeDataSnapshot;
  backupKey?: string;
}): RuntimeDataBackup {
  if (!input.backupKey) {
    return {
      format: backupFormat,
      version: backupVersion,
      exportedAt: input.snapshot.exportedAt,
      encryption: { mode: "none" },
      payload: input.snapshot,
    };
  }

  assertUsableBackupKey(input.backupKey);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveBackupKey(input.backupKey, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(input.snapshot), "utf8"), cipher.final()]);

  return {
    format: backupFormat,
    version: backupVersion,
    exportedAt: input.snapshot.exportedAt,
    encryption: {
      mode: "aes-256-gcm",
      kdf: "scrypt",
      salt: salt.toString("base64url"),
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    },
    payload: encrypted.toString("base64url"),
  };
}

export function decodeRuntimeDataBackup(input: { backup: RuntimeDataBackup; backupKey?: string }): RuntimeDataSnapshot {
  assertRuntimeDataBackup(input.backup);
  if (isPlainRuntimeDataBackup(input.backup)) {
    return input.backup.payload;
  }
  const backup = input.backup;

  if (!input.backupKey) {
    throw new Error("OOMOL_CONNECT_BACKUP_KEY is required to import this encrypted backup.");
  }
  assertUsableBackupKey(input.backupKey);

  const key = deriveBackupKey(input.backupKey, Buffer.from(backup.encryption.salt, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(backup.encryption.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(backup.encryption.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(backup.payload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const snapshot = JSON.parse(plaintext) as RuntimeDataSnapshot;
  assertRuntimeDataSnapshot(snapshot);
  return snapshot;
}

export function assertRuntimeDataBackup(value: unknown): asserts value is RuntimeDataBackup {
  if (typeof value !== "object" || value == null) {
    throw new Error("Backup must be a JSON object.");
  }

  const backup = value as RuntimeDataBackup;
  if (backup.format !== backupFormat || backup.version !== backupVersion) {
    throw new Error("Unsupported runtime backup format or version.");
  }
  if (backup.encryption.mode === "none") {
    assertRuntimeDataSnapshot(backup.payload);
    return;
  }
  if (backup.encryption.mode !== "aes-256-gcm" || backup.encryption.kdf !== "scrypt") {
    throw new Error("Unsupported runtime backup encryption.");
  }
  for (const value of [backup.encryption.salt, backup.encryption.iv, backup.encryption.tag, backup.payload]) {
    if (typeof value !== "string" || !value) {
      throw new Error("Encrypted runtime backup is malformed.");
    }
  }
}

export function assertRuntimeDataSnapshot(value: unknown): asserts value is RuntimeDataSnapshot {
  if (typeof value !== "object" || value == null) {
    throw new Error("Runtime data snapshot must be a JSON object.");
  }

  const snapshot = value as RuntimeDataSnapshot;
  if (snapshot.version !== backupVersion || typeof snapshot.exportedAt !== "string") {
    throw new Error("Unsupported runtime data snapshot.");
  }
  if (
    !Array.isArray(snapshot.connections) ||
    !Array.isArray(snapshot.oauthClientConfigs) ||
    !Array.isArray(snapshot.runs)
  ) {
    throw new Error("Runtime data snapshot is missing required collections.");
  }
}

function deriveBackupKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32);
}

function assertUsableBackupKey(value: string): void {
  if (!value.trim()) {
    throw new Error("Backup key must not be empty.");
  }
}

function isPlainRuntimeDataBackup(backup: RuntimeDataBackup): backup is PlainRuntimeDataBackup {
  return backup.encryption.mode === "none";
}
