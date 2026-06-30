import type { RuntimeDataBackup } from "../src/server/runtime-data-backup.ts";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { decodeRuntimeDataBackup, encodeRuntimeDataBackup } from "../src/server/runtime-data-backup.ts";
import { createSecretCodec } from "../src/server/secret-codec.ts";
import { SqliteRuntimeDatabase } from "../src/server/sqlite-runtime-store.ts";

const command = process.argv[2];
const options = parseOptions(process.argv.slice(3));
const dataDir = resolve(options.dataDir ?? process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data"));
const databasePath = join(dataDir, "connect.sqlite");
const secretCodec = createSecretCodec(process.env.OOMOL_CONNECT_ENCRYPTION_KEY);

if (!command || !["export", "import", "reset", "rotate-key"].includes(command)) {
  printUsageAndExit();
}

await mkdir(dataDir, { recursive: true });

if (command === "rotate-key") {
  const nextEncryptionKey = process.env.OOMOL_CONNECT_NEW_ENCRYPTION_KEY;
  if (!nextEncryptionKey && options.plain !== "true") {
    throw new Error("rotate-key requires OOMOL_CONNECT_NEW_ENCRYPTION_KEY unless --plain is set.");
  }
  const source = new SqliteRuntimeDatabase(databasePath, { secretCodec });
  const snapshot = await source.exportSnapshot().finally(() => source.close());
  const target = new SqliteRuntimeDatabase(databasePath, {
    secretCodec: createSecretCodec(nextEncryptionKey),
  });
  try {
    target.restoreSnapshot(snapshot);
    console.log(`Rotated runtime data encryption in ${databasePath}.`);
  } finally {
    target.close();
  }
} else {
  const database = new SqliteRuntimeDatabase(databasePath, { secretCodec });
  try {
    if (command === "export") {
      const output = requireOption(options.output, "--output is required for export.");
      if (!process.env.OOMOL_CONNECT_BACKUP_KEY && options.plain !== "true") {
        throw new Error("export requires OOMOL_CONNECT_BACKUP_KEY unless --plain is set.");
      }
      const snapshot = await database.exportSnapshot();
      const backup = encodeRuntimeDataBackup({
        snapshot,
        backupKey: process.env.OOMOL_CONNECT_BACKUP_KEY,
      });
      await mkdir(dirname(resolve(output)), { recursive: true });
      await writeFile(resolve(output), `${JSON.stringify(backup, null, 2)}\n`);
      console.log(`Exported runtime data to ${resolve(output)}.`);
    } else if (command === "import") {
      const input = requireOption(options.input, "--input is required for import.");
      const backup = JSON.parse(await readFile(resolve(input), "utf8")) as RuntimeDataBackup;
      const snapshot = decodeRuntimeDataBackup({
        backup,
        backupKey: process.env.OOMOL_CONNECT_BACKUP_KEY,
      });
      database.restoreSnapshot(snapshot);
      console.log(`Imported runtime data from ${resolve(input)}.`);
    } else {
      if (options.yes !== "true") {
        throw new Error("reset requires --yes.");
      }
      database.resetRuntimeData();
      console.log(`Reset runtime data in ${databasePath}.`);
    }
  } finally {
    database.close();
  }
}

type RuntimeDataCommandOptions = {
  dataDir?: string;
  input?: string;
  output?: string;
  plain?: string;
  yes?: string;
};

function parseOptions(args: string[]): RuntimeDataCommandOptions {
  const options: RuntimeDataCommandOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--yes") {
      options.yes = "true";
      continue;
    }
    if (arg === "--plain") {
      options.plain = "true";
      continue;
    }

    const value = args[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value.`);
    }

    if (arg === "--data-dir") {
      options.dataDir = value;
    } else if (arg === "--input") {
      options.input = value;
    } else if (arg === "--output") {
      options.output = value;
    } else {
      throw new Error(`Unknown option: ${arg}.`);
    }
    index += 1;
  }

  return options;
}

function requireOption(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function printUsageAndExit(): never {
  console.error(`Usage:
  node scripts/runtime-data.ts export --output backup.json [--data-dir ./data]
  node scripts/runtime-data.ts export --output backup.json --plain [--data-dir ./data]
  node scripts/runtime-data.ts import --input backup.json [--data-dir ./data]
  node scripts/runtime-data.ts reset --yes [--data-dir ./data]
  node scripts/runtime-data.ts rotate-key [--data-dir ./data]
  node scripts/runtime-data.ts rotate-key --plain [--data-dir ./data]

Set OOMOL_CONNECT_ENCRYPTION_KEY to read/write encrypted local credential records.
Set OOMOL_CONNECT_NEW_ENCRYPTION_KEY when rotating to a new encryption key.
Set OOMOL_CONNECT_BACKUP_KEY to encrypt or decrypt backup files.`);
  process.exit(1);
}
