import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface IndxelConfig {
  /** Minimum score to pass (0-100). Overrides --min-score flag. */
  minScore?: number;
  /** Rule IDs to disable (won't count toward score). */
  disabledRules?: string[];
  /** Base URL for canonical URLs. */
  baseUrl?: string;
  /** Route patterns to exclude from checks (e.g., "/dashboard/*", "/auth/*"). */
  ignoreRoutes?: string[];
}

const CONFIG_FILES = [".indxelrc.json", ".indxelrc", "indxel.config.json"];

/**
 * Load indxel config from the project root.
 * Searches for .indxelrc.json, .indxelrc, or indxel.config.json.
 */
export async function loadConfig(cwd: string): Promise<IndxelConfig> {
  for (const file of CONFIG_FILES) {
    const path = join(cwd, file);
    if (existsSync(path)) {
      try {
        const content = await readFile(path, "utf-8");
        return JSON.parse(content) as IndxelConfig;
      } catch {
        // Invalid JSON — ignore silently
      }
    }
  }
  return {};
}
