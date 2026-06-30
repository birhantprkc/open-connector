import type { IConnectionStore } from "../connection-service.ts";
import type { ResolvedCredential } from "../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "../oauth/oauth-flow-service.ts";
import type { RuntimeConnectionSnapshot, RuntimeDataSnapshot } from "./runtime-data-backup.ts";
import type { IRunLogStore, RunLog } from "./runtime-store.ts";
import type { ISecretCodec } from "./secret-codec.ts";

import { DatabaseSync } from "node:sqlite";
import { createRuntimeDataSnapshot } from "./runtime-data-backup.ts";
import { PlainTextSecretCodec } from "./secret-codec.ts";

type RuntimeRow = Record<string, unknown>;
type SecretJsonTable = "oauth_client_configs";

export interface SqliteRuntimeDatabaseOptions {
  runLimit?: number;
  secretCodec?: ISecretCodec;
}

interface ConnectionJsonInput {
  database: DatabaseSync;
  secretCodec: ISecretCodec;
  service: string;
  connectionName: string;
}

interface SetConnectionJsonInput extends ConnectionJsonInput {
  value: unknown;
}

interface SecretJsonInput {
  database: DatabaseSync;
  secretCodec: ISecretCodec;
  table: SecretJsonTable;
  service: string;
}

interface SetServiceJsonInput extends SecretJsonInput {
  value: unknown;
}

/**
 * Shared SQLite connection for local runtime state.
 */
export class SqliteRuntimeDatabase {
  readonly connectionStore: SqliteConnectionStore;
  readonly oauthClientConfigStore: SqliteOAuthClientConfigStore;
  readonly oauthStateStore: SqliteOAuthStateStore;
  readonly runLogStore: SqliteRunLogStore;

  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;

  constructor(filename: string, options: SqliteRuntimeDatabaseOptions = {}) {
    this.database = new DatabaseSync(filename);
    this.secretCodec = options.secretCodec ?? new PlainTextSecretCodec();
    this.initialize();
    this.connectionStore = new SqliteConnectionStore(this.database, this.secretCodec);
    this.oauthClientConfigStore = new SqliteOAuthClientConfigStore(this.database, this.secretCodec);
    this.oauthStateStore = new SqliteOAuthStateStore(this.database);
    this.runLogStore = new SqliteRunLogStore(this.database, options.runLimit ?? 100);
  }

  close(): void {
    this.database.close();
  }

  async exportSnapshot(): Promise<RuntimeDataSnapshot> {
    return createRuntimeDataSnapshot({
      connections: await this.connectionStore.list(),
      oauthClientConfigs: await this.oauthClientConfigStore.list(),
      runs: this.runLogStore.list(),
    });
  }

  restoreSnapshot(snapshot: RuntimeDataSnapshot): void {
    runInTransaction(this.database, () => {
      this.resetRuntimeData();
      for (const connection of snapshot.connections) {
        setConnectionJson({
          database: this.database,
          secretCodec: this.secretCodec,
          service: connection.service,
          connectionName: connection.connectionName,
          value: connection.credential,
        });
      }
      for (const config of snapshot.oauthClientConfigs) {
        setServiceJson({
          database: this.database,
          secretCodec: this.secretCodec,
          table: "oauth_client_configs",
          service: config.service,
          value: config,
        });
      }
      for (const run of snapshot.runs) {
        insertRun(this.database, run);
      }
    });
  }

  resetRuntimeData(): void {
    this.database.exec(`
      delete from connections;
      delete from oauth_client_configs;
      delete from oauth_states;
      delete from runs;
    `);
  }

  private initialize(): void {
    this.database.exec(`
      pragma journal_mode = wal;
      create table if not exists connections (
        service text not null,
        connection_name text not null,
        value text not null,
        updated_at text not null,
        primary key (service, connection_name)
      );
      create table if not exists oauth_client_configs (
        service text primary key,
        value text not null,
        updated_at text not null
      );
      create table if not exists oauth_states (
        state text primary key,
        value text not null,
        created_at text not null
      );
      create table if not exists runs (
        id text primary key,
        action_id text not null,
        started_at text not null,
        completed_at text not null,
        ok integer not null,
        value text not null
      );
    `);
  }
}

export class SqliteConnectionStore implements IConnectionStore {
  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;

  constructor(database: DatabaseSync, secretCodec: ISecretCodec) {
    this.database = database;
    this.secretCodec = secretCodec;
  }

  async get(service: string, connectionName: string): Promise<ResolvedCredential | undefined> {
    return getConnectionJson<ResolvedCredential>({
      database: this.database,
      secretCodec: this.secretCodec,
      service,
      connectionName,
    });
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<void> {
    setConnectionJson({
      database: this.database,
      secretCodec: this.secretCodec,
      service,
      connectionName,
      value: credential,
    });
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.database
      .prepare("delete from connections where service = ? and connection_name = ?")
      .run(service, connectionName);
  }

  async list(): Promise<RuntimeConnectionSnapshot[]> {
    return this.database
      .prepare("select service, connection_name, value from connections order by service, connection_name")
      .all()
      .map((row) => ({
        service: readString(row, "service"),
        connectionName: readString(row, "connection_name"),
        credential: parseJson<ResolvedCredential>(this.secretCodec.decode(readString(row, "value"))),
      }));
  }
}

export class SqliteOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly database: DatabaseSync;
  private readonly secretCodec: ISecretCodec;

  constructor(database: DatabaseSync, secretCodec: ISecretCodec) {
    this.database = database;
    this.secretCodec = secretCodec;
  }

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    return getSecretJson<OAuthClientConfig>({
      database: this.database,
      secretCodec: this.secretCodec,
      table: "oauth_client_configs",
      service,
    });
  }

  async set(config: OAuthClientConfig): Promise<void> {
    setServiceJson({
      database: this.database,
      secretCodec: this.secretCodec,
      table: "oauth_client_configs",
      service: config.service,
      value: config,
    });
  }

  async delete(service: string): Promise<void> {
    this.database.prepare("delete from oauth_client_configs where service = ?").run(service);
  }

  async list(): Promise<OAuthClientConfig[]> {
    return this.database
      .prepare("select value from oauth_client_configs order by service")
      .all()
      .map((row) => parseJson<OAuthClientConfig>(this.secretCodec.decode(readString(row, "value"))));
  }
}

export class SqliteOAuthStateStore implements IOAuthStateStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async set(state: OAuthAuthorizationState): Promise<void> {
    this.database
      .prepare(
        `
        insert into oauth_states (state, value, created_at)
        values (?, ?, ?)
        on conflict(state) do update set value = excluded.value, created_at = excluded.created_at
      `,
      )
      .run(state.state, JSON.stringify(state), state.createdAt);
  }

  async take(state: string): Promise<OAuthAuthorizationState | undefined> {
    const pending = getJson<OAuthAuthorizationState>(this.database, "oauth_states", "state", state);
    this.database.prepare("delete from oauth_states where state = ?").run(state);
    return pending;
  }
}

export class SqliteRunLogStore implements IRunLogStore {
  private readonly database: DatabaseSync;
  private readonly limit: number;

  constructor(database: DatabaseSync, limit: number) {
    this.database = database;
    this.limit = limit;
  }

  add(run: RunLog): void {
    insertRun(this.database, run);

    this.database
      .prepare(
        `
        delete from runs
        where id in (
          select id from runs
          order by started_at desc, id desc
          limit -1 offset ?
        )
      `,
      )
      .run(this.limit);
  }

  list(): RunLog[] {
    return this.database
      .prepare("select value from runs order by started_at desc, id desc limit ?")
      .all(this.limit)
      .map((row) => parseJson<RunLog>(readString(row, "value")));
  }
}

function insertRun(database: DatabaseSync, run: RunLog): void {
  database
    .prepare(
      `
      insert into runs (id, action_id, started_at, completed_at, ok, value)
      values (?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        action_id = excluded.action_id,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        ok = excluded.ok,
        value = excluded.value
    `,
    )
    .run(run.id, run.actionId, run.startedAt, run.completedAt, run.ok ? 1 : 0, JSON.stringify(run));
}

function runInTransaction(database: DatabaseSync, work: () => void): void {
  database.exec("begin immediate");
  try {
    work();
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

function getJson<T>(database: DatabaseSync, table: "oauth_states", keyColumn: "state", key: string): T | undefined {
  const row = database.prepare(`select value from ${table} where ${keyColumn} = ?`).get(key) as RuntimeRow | undefined;
  return row ? parseJson<T>(readString(row, "value")) : undefined;
}

function getSecretJson<T>(input: SecretJsonInput): T | undefined {
  const stored = getStoredValue(input.database, input.table, "service", input.service);
  return stored ? parseJson<T>(input.secretCodec.decode(stored)) : undefined;
}

function getConnectionJson<T>(input: ConnectionJsonInput): T | undefined {
  const row = input.database
    .prepare("select value from connections where service = ? and connection_name = ?")
    .get(input.service, input.connectionName) as RuntimeRow | undefined;
  return row ? parseJson<T>(input.secretCodec.decode(readString(row, "value"))) : undefined;
}

function getStoredValue(
  database: DatabaseSync,
  table: SecretJsonTable,
  keyColumn: "service",
  key: string,
): string | undefined {
  const row = database.prepare(`select value from ${table} where ${keyColumn} = ?`).get(key) as RuntimeRow | undefined;
  return row ? readString(row, "value") : undefined;
}

function setConnectionJson(input: SetConnectionJsonInput): void {
  input.database
    .prepare(
      `
      insert into connections (service, connection_name, value, updated_at)
      values (?, ?, ?, ?)
      on conflict(service, connection_name) do update set
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    )
    .run(
      input.service,
      input.connectionName,
      input.secretCodec.encode(JSON.stringify(input.value)),
      new Date().toISOString(),
    );
}

function setServiceJson(input: SetServiceJsonInput): void {
  input.database
    .prepare(
      `
      insert into ${input.table} (service, value, updated_at)
      values (?, ?, ?)
      on conflict(service) do update set value = excluded.value, updated_at = excluded.updated_at
    `,
    )
    .run(input.service, input.secretCodec.encode(JSON.stringify(input.value)), new Date().toISOString());
}

function readString(row: unknown, key: string): string {
  if (typeof row !== "object" || row == null) {
    throw new Error(`Expected SQLite row for ${key}.`);
  }

  const value = (row as Record<string, unknown>)[key];
  if (typeof value !== "string") {
    throw new Error(`Expected SQLite column ${key} to be a string.`);
  }

  return value;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}
