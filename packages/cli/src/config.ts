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

// --- URL Detection ---

interface DetectedUrl {
  url: string;
  source: string;
  /** Higher = more trustworthy. Explicit config > env > inferred. */
  weight: number;
}

export interface UrlDetectionResult {
  /** Best URL candidate (null if nothing found) */
  url: string | null;
  /** Where it came from */
  source: string;
  /** High confidence = multiple sources agree or explicit config. No confirmation needed. */
  confident: boolean;
  /** All detected URLs with sources (for debugging / displaying alternatives) */
  all: DetectedUrl[];
}

/** Env var names per framework that typically hold the production URL */
const URL_ENV_VARS: Record<string, string[]> = {
  // Framework-specific
  nextjs: ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BASE_URL", "NEXT_PUBLIC_URL"],
  nuxt: ["NUXT_PUBLIC_SITE_URL", "NUXT_PUBLIC_APP_URL", "NUXT_SITE_URL"],
  remix: ["APP_URL", "BASE_URL"],
  astro: ["SITE_URL", "PUBLIC_SITE_URL", "ASTRO_SITE"],
  sveltekit: ["PUBLIC_SITE_URL", "VITE_SITE_URL"],
  // Generic (works for all)
  generic: ["SITE_URL", "BASE_URL", "APP_URL", "DEPLOY_URL", "URL"],
};

/**
 * Detect all possible URLs from every source, with confidence scoring.
 * Use this for `init` — returns all candidates + confidence level.
 */
export async function detectProjectUrl(cwd: string, framework?: string): Promise<UrlDetectionResult> {
  const candidates: DetectedUrl[] = [];

  // 1. Explicit indxel config (highest trust)
  const config = await loadConfig(cwd);
  if (config.baseUrl) {
    candidates.push({ url: normalize(config.baseUrl), source: ".indxelrc.json", weight: 10 });
  }

  // 2. seo.config.ts/js (explicit user config)
  for (const ext of ["ts", "js"]) {
    const configPath = join(cwd, `seo.config.${ext}`);
    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, "utf-8");
        const match = content.match(/siteUrl\s*:\s*['"`]([^'"`]+)['"`]/);
        if (match?.[1] && match[1] !== "https://example.com") {
          candidates.push({ url: normalize(match[1]), source: `seo.config.${ext}`, weight: 10 });
        }
      } catch { /* ignore */ }
    }
  }

  // 3. Env files — framework-specific + generic vars
  const envVars = [
    ...(framework && URL_ENV_VARS[framework] ? URL_ENV_VARS[framework] : []),
    ...URL_ENV_VARS.generic,
  ];
  // Deduplicate
  const uniqueVars = [...new Set(envVars)];
  const envFiles = [".env.production", ".env.production.local", ".env.local", ".env"];

  for (const file of envFiles) {
    const envPath = join(cwd, file);
    if (!existsSync(envPath)) continue;
    try {
      const content = await readFile(envPath, "utf-8");
      for (const varName of uniqueVars) {
        const match = content.match(new RegExp(`^${varName}\\s*=\\s*['"]?([^'"\n]+)['"]?`, "m"));
        if (match?.[1]) {
          const url = match[1].trim();
          if (isProductionUrl(url)) {
            // .env.production gets higher weight
            const weight = file.includes("production") ? 7 : 5;
            candidates.push({ url: normalize(url), source: `${file} (${varName})`, weight });
          }
        }
      }
    } catch { /* ignore */ }
  }

  // 4. Framework-specific config files
  const fwUrl = await detectFromFrameworkConfig(cwd, framework);
  if (fwUrl) {
    candidates.push(fwUrl);
  }

  // 5. Vercel project config
  const vercelUrl = await detectFromVercel(cwd);
  if (vercelUrl) {
    candidates.push(vercelUrl);
  }

  // 6. Netlify config
  const netlifyUrl = await detectFromNetlify(cwd);
  if (netlifyUrl) {
    candidates.push(netlifyUrl);
  }

  // 7. package.json homepage
  try {
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf-8"));
    if (pkg.homepage && isProductionUrl(pkg.homepage)) {
      candidates.push({ url: normalize(pkg.homepage), source: "package.json (homepage)", weight: 4 });
    }
  } catch { /* ignore */ }

  if (candidates.length === 0) {
    return { url: null, source: "", confident: false, all: [] };
  }

  // Cross-reference: count how many sources agree on the same origin
  const originCounts = new Map<string, { count: number; best: DetectedUrl }>();
  for (const c of candidates) {
    const origin = new URL(c.url).origin;
    const existing = originCounts.get(origin);
    if (!existing || c.weight > existing.best.weight) {
      originCounts.set(origin, {
        count: (existing?.count ?? 0) + 1,
        best: c,
      });
    } else {
      existing.count++;
    }
  }

  // Pick the origin with highest (count * best weight)
  let best: { origin: string; count: number; best: DetectedUrl } | null = null;
  for (const [origin, data] of originCounts) {
    const score = data.count * data.best.weight;
    if (!best || score > best.count * best.best.weight) {
      best = { origin, ...data };
    }
  }

  const result = best!.best;
  // Confident if: explicit config (weight >= 10) OR multiple sources agree
  const confident = result.weight >= 10 || best!.count >= 2;

  return {
    url: result.url,
    source: result.source,
    confident,
    all: candidates,
  };
}

/**
 * Simple resolve for CLI commands (perf, crawl, index).
 * Returns the best URL or null. No confidence info needed.
 */
export async function resolveProjectUrl(cwd: string): Promise<string | null> {
  const result = await detectProjectUrl(cwd);
  return result.url;
}

// --- Detection helpers ---

function normalize(url: string): string {
  if (!url.startsWith("http")) url = `https://${url}`;
  // Remove trailing slash
  return url.replace(/\/+$/, "");
}

function isProductionUrl(url: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  if (url.includes("localhost")) return false;
  if (url.includes("127.0.0.1")) return false;
  if (url.includes("0.0.0.0")) return false;
  return true;
}

/** Read framework-specific config files (next.config, nuxt.config, astro.config, etc.) */
async function detectFromFrameworkConfig(cwd: string, framework?: string): Promise<DetectedUrl | null> {
  // Astro: site field in astro.config.mjs
  if (!framework || framework === "astro") {
    for (const file of ["astro.config.mjs", "astro.config.ts", "astro.config.js"]) {
      const configPath = join(cwd, file);
      if (existsSync(configPath)) {
        try {
          const content = await readFile(configPath, "utf-8");
          const match = content.match(/site\s*:\s*['"`]([^'"`]+)['"`]/);
          if (match?.[1] && isProductionUrl(match[1])) {
            return { url: normalize(match[1]), source: `${file} (site)`, weight: 8 };
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Nuxt: app.baseURL or site.url in nuxt.config
  if (!framework || framework === "nuxt") {
    for (const file of ["nuxt.config.ts", "nuxt.config.js"]) {
      const configPath = join(cwd, file);
      if (existsSync(configPath)) {
        try {
          const content = await readFile(configPath, "utf-8");
          const match = content.match(/url\s*:\s*['"`]([^'"`]+)['"`]/);
          if (match?.[1] && isProductionUrl(match[1])) {
            return { url: normalize(match[1]), source: `${file} (site.url)`, weight: 8 };
          }
        } catch { /* ignore */ }
      }
    }
  }

  return null;
}

/** Detect from .vercel/project.json */
async function detectFromVercel(cwd: string): Promise<DetectedUrl | null> {
  const vercelPath = join(cwd, ".vercel", "project.json");
  if (!existsSync(vercelPath)) return null;
  try {
    const content = JSON.parse(await readFile(vercelPath, "utf-8"));
    if (content.projectName) {
      return {
        url: `https://${content.projectName}.vercel.app`,
        source: ".vercel/project.json",
        weight: 3, // Low weight — *.vercel.app is often not the real domain
      };
    }
  } catch { /* ignore */ }
  return null;
}

/** Detect from netlify.toml or .netlify/state.json */
async function detectFromNetlify(cwd: string): Promise<DetectedUrl | null> {
  // netlify.toml — may have [context.production] environment URL
  const tomlPath = join(cwd, "netlify.toml");
  if (existsSync(tomlPath)) {
    try {
      const content = await readFile(tomlPath, "utf-8");
      const match = content.match(/URL\s*=\s*['"]([^'"]+)['"]/i);
      if (match?.[1] && isProductionUrl(match[1])) {
        return { url: normalize(match[1]), source: "netlify.toml", weight: 6 };
      }
    } catch { /* ignore */ }
  }

  // .netlify/state.json — siteId can map to *.netlify.app
  const statePath = join(cwd, ".netlify", "state.json");
  if (existsSync(statePath)) {
    try {
      const content = JSON.parse(await readFile(statePath, "utf-8"));
      if (content.siteId) {
        // Can't resolve real domain without Netlify API, but name maps to *.netlify.app
        // Low weight — probably not the production domain
        return {
          url: `https://${content.siteId}.netlify.app`,
          source: ".netlify/state.json",
          weight: 2,
        };
      }
    } catch { /* ignore */ }
  }

  return null;
}
