import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const rootDir = process.cwd();
const registryPath = join(process.cwd(), "src/providers/registry.generated.ts");
const catalogDir = join(process.cwd(), "catalog/apps");
const sourcePaths = [
  join(rootDir, "src/core"),
  join(rootDir, "src/providers"),
  join(rootDir, "scripts/generate-catalog.ts"),
  join(rootDir, "scripts/generate-provider-registry.ts"),
];
const generatedPaths = new Set([registryPath]);

const sourceMtimeMs = await newestMtimeMs(sourcePaths);

if (!(await isFreshFile(registryPath, sourceMtimeMs))) {
  runNodeScript("scripts/generate-provider-registry.ts");
}

if (!(await isFreshCatalog(sourceMtimeMs))) {
  runNodeScript("scripts/generate-catalog.ts");
}

function runNodeScript(script: string): void {
  const result = spawnSync("node", [script], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function isFreshFile(path: string, sourceMtimeMs: number): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile() && stats.mtimeMs >= sourceMtimeMs;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

async function isFreshCatalog(sourceMtimeMs: number): Promise<boolean> {
  try {
    const entries = await readdir(catalogDir, { withFileTypes: true });
    const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    if (jsonFiles.length === 0) {
      return false;
    }

    const mtimes = await Promise.all(
      jsonFiles.map(async (entry) => (await stat(join(catalogDir, entry.name))).mtimeMs),
    );
    return Math.min(...mtimes) >= sourceMtimeMs;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

async function newestMtimeMs(paths: string[]): Promise<number> {
  const mtimes = await Promise.all(paths.map((path) => newestPathMtimeMs(path)));
  return Math.max(...mtimes);
}

async function newestPathMtimeMs(path: string): Promise<number> {
  if (generatedPaths.has(path)) {
    return 0;
  }

  let stats;
  try {
    stats = await stat(path);
  } catch (error) {
    if (isNotFoundError(error)) {
      return 0;
    }

    throw error;
  }

  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  const entries = await readdir(path, { withFileTypes: true });
  const childMtimes = await Promise.all(entries.map((entry) => newestPathMtimeMs(join(path, entry.name))));
  return Math.max(stats.mtimeMs, ...childMtimes);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
