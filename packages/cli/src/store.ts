import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { CheckSummary } from "./formatter.js";

const STORE_DIR = ".indxel";
const LAST_CHECK_FILE = "last-check.json";
const INDEXNOW_KEY_FILE = "indexnow-key.txt";
const CONFIG_FILE = "config.json";

export interface StoredCheck {
  timestamp: string;
  summary: CheckSummary;
}

/** Save the current check results for future diff comparison */
export async function saveCheckResult(
  cwd: string,
  summary: CheckSummary,
): Promise<void> {
  const storeDir = join(cwd, STORE_DIR);

  if (!existsSync(storeDir)) {
    await mkdir(storeDir, { recursive: true });
  }

  const stored: StoredCheck = {
    timestamp: new Date().toISOString(),
    summary: {
      ...summary,
      // Serialize results with minimal data needed for diff
      results: summary.results.map((r) => ({
        page: {
          filePath: r.page.filePath,
          route: r.page.route,
          hasMetadata: r.page.hasMetadata,
          hasDynamicMetadata: r.page.hasDynamicMetadata,
          isClientComponent: r.page.isClientComponent,
          titleIsAbsolute: r.page.titleIsAbsolute,
          extractedMetadata: r.page.extractedMetadata,
        },
        validation: r.validation,
      })),
    },
  };

  await writeFile(
    join(storeDir, LAST_CHECK_FILE),
    JSON.stringify(stored, null, 2),
    "utf-8",
  );
}

/** Load the previous check result (or null if none exists) */
export async function loadPreviousCheck(
  cwd: string,
): Promise<StoredCheck | null> {
  const filePath = join(cwd, STORE_DIR, LAST_CHECK_FILE);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const data = await readFile(filePath, "utf-8");
    return JSON.parse(data) as StoredCheck;
  } catch {
    return null;
  }
}

/** Get the .indxel directory path */
export function getStoreDir(cwd: string): string {
  return join(cwd, STORE_DIR);
}

/** Generate a 32-character hex IndexNow key */
export function generateIndexNowKey(): string {
  return randomBytes(16).toString("hex");
}

/** Save an IndexNow key to the .indxel store */
export async function saveIndexNowKey(cwd: string, key: string): Promise<void> {
  const storeDir = join(cwd, STORE_DIR);
  if (!existsSync(storeDir)) {
    await mkdir(storeDir, { recursive: true });
  }
  await writeFile(join(storeDir, INDEXNOW_KEY_FILE), key, "utf-8");
}

/** Load the IndexNow key from the .indxel store (or null if not set up) */
export async function loadIndexNowKey(cwd: string): Promise<string | null> {
  const filePath = join(cwd, STORE_DIR, INDEXNOW_KEY_FILE);
  if (!existsSync(filePath)) return null;
  try {
    const key = (await readFile(filePath, "utf-8")).trim();
    return key || null;
  } catch {
    return null;
  }
}

// --- Project config (set by `npx indxel link`) ---

export interface ProjectConfig {
  apiKey: string;
  projectId: string;
  projectName: string;
  linkedAt: string;
}

/** Save project config after linking */
export async function saveProjectConfig(
  cwd: string,
  config: ProjectConfig,
): Promise<void> {
  const storeDir = join(cwd, STORE_DIR);
  if (!existsSync(storeDir)) {
    await mkdir(storeDir, { recursive: true });
  }
  await writeFile(
    join(storeDir, CONFIG_FILE),
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

/** Load project config (or null if not linked) */
export async function loadProjectConfig(
  cwd: string,
): Promise<ProjectConfig | null> {
  const filePath = join(cwd, STORE_DIR, CONFIG_FILE);
  if (!existsSync(filePath)) return null;
  try {
    const data = await readFile(filePath, "utf-8");
    return JSON.parse(data) as ProjectConfig;
  } catch {
    return null;
  }
}

/**
 * Resolve API key from multiple sources (in priority order):
 * 1. Explicit --api-key flag
 * 2. INDXEL_API_KEY environment variable
 * 3. .indxel/config.json (set by `npx indxel link`)
 */
export async function resolveApiKey(
  explicit?: string,
): Promise<string | null> {
  if (explicit) return explicit;
  if (process.env.INDXEL_API_KEY) return process.env.INDXEL_API_KEY;
  const config = await loadProjectConfig(process.cwd());
  return config?.apiKey ?? null;
}
