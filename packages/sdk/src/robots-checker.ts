/**
 * Robots.txt checker — fetch, parse, and check URL access.
 */

import { safeFetch, validatePublicUrl } from "./safe-fetch.js";

export interface RobotsDirective {
  userAgent: string;
  allow: string[];
  disallow: string[];
}

export interface RobotsResult {
  url: string;
  found: boolean;
  raw: string;
  directives: RobotsDirective[];
  sitemapUrls: string[];
  errors: string[];
  warnings: string[];
}

export interface RobotsUrlCheck {
  url: string;
  path: string;
  blocked: boolean;
  blockedBy?: string;
}

/**
 * Fetch and parse robots.txt from a site.
 */
export async function fetchRobots(baseUrl: string): Promise<RobotsResult> {
  const base = new URL(baseUrl);
  const robotsUrl = new URL("/robots.txt", base).href;
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    validatePublicUrl(robotsUrl);
    const response = await safeFetch(robotsUrl, {
      headers: {
        "User-Agent": "Indxel/0.1 (SEO robots checker)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        url: robotsUrl,
        found: false,
        raw: "",
        directives: [],
        sitemapUrls: [],
        errors: [`robots.txt returned HTTP ${response.status} — site may be fully crawlable or misconfigured`],
        warnings: [],
      };
    }

    const raw = await response.text();
    const { directives, sitemapUrls } = parseRobotsTxt(raw);

    // Check for common issues
    for (const d of directives) {
      if (d.userAgent === "*" && d.disallow.includes("/")) {
        warnings.push("robots.txt blocks ALL crawlers with 'Disallow: /' — entire site is invisible to search engines");
      }
      for (const path of d.disallow) {
        if (path === "/api" || path === "/api/") {
          // This is fine, skip
        } else if (path.includes("sitemap")) {
          warnings.push(`robots.txt blocks '${path}' — this may prevent search engines from finding your sitemap`);
        }
      }
    }

    if (sitemapUrls.length === 0) {
      warnings.push("No Sitemap directive in robots.txt — add 'Sitemap: https://yoursite.com/sitemap.xml' to help search engines find your pages");
    }

    return { url: robotsUrl, found: true, raw, directives, sitemapUrls, errors, warnings };
  } catch (err) {
    return {
      url: robotsUrl,
      found: false,
      raw: "",
      directives: [],
      sitemapUrls: [],
      errors: [err instanceof Error ? err.message : String(err)],
      warnings: [],
    };
  }
}

/**
 * Check if specific URLs are blocked by robots.txt directives.
 */
export function checkUrlsAgainstRobots(
  directives: RobotsDirective[],
  urls: string[],
  userAgent = "*",
): RobotsUrlCheck[] {
  // Find matching directives (specific UA first, then *)
  const matchingDirectives = directives.filter(
    (d) => d.userAgent === userAgent || d.userAgent === "*",
  );

  return urls.map((url) => {
    const path = new URL(url).pathname;
    let blocked = false;
    let blockedBy: string | undefined;

    for (const directive of matchingDirectives) {
      // Check disallow rules
      for (const disallowPath of directive.disallow) {
        if (disallowPath && pathMatches(path, disallowPath)) {
          blocked = true;
          blockedBy = `Disallow: ${disallowPath} (User-agent: ${directive.userAgent})`;
        }
      }
      // Check allow rules (allow overrides disallow for same specificity)
      for (const allowPath of directive.allow) {
        if (allowPath && pathMatches(path, allowPath) && allowPath.length >= (blockedBy?.length ?? 0)) {
          blocked = false;
          blockedBy = undefined;
        }
      }
    }

    return { url, path, blocked, blockedBy };
  });
}

// -- Internal helpers --

interface ParsedRobots {
  directives: RobotsDirective[];
  sitemapUrls: string[];
}

function parseRobotsTxt(raw: string): ParsedRobots {
  const lines = raw.split("\n").map((l) => l.trim());
  const directives: RobotsDirective[] = [];
  const sitemapUrls: string[] = [];
  let current: RobotsDirective | null = null;

  for (const line of lines) {
    // Skip comments and empty lines
    if (!line || line.startsWith("#")) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (key === "user-agent") {
      current = { userAgent: value, allow: [], disallow: [] };
      directives.push(current);
    } else if (key === "disallow" && current) {
      current.disallow.push(value);
    } else if (key === "allow" && current) {
      current.allow.push(value);
    } else if (key === "sitemap") {
      sitemapUrls.push(value);
    }
  }

  return { directives, sitemapUrls };
}

function pathMatches(path: string, pattern: string): boolean {
  if (!pattern) return false;

  // Handle wildcard patterns with iterative glob matching (no regex — prevents ReDoS)
  if (pattern.includes("*")) {
    const mustEndExact = pattern.endsWith("$");
    const cleanPattern = mustEndExact ? pattern.slice(0, -1) : pattern;
    const parts = cleanPattern.split("*");

    let pos = 0;
    // First part must match from the start
    if (!path.startsWith(parts[0])) return false;
    pos = parts[0].length;

    // Middle parts must appear in order
    for (let i = 1; i < parts.length; i++) {
      const idx = path.indexOf(parts[i], pos);
      if (idx === -1) return false;
      pos = idx + parts[i].length;
    }

    // If pattern ends with $, path must end exactly where matching ended
    if (mustEndExact && pos !== path.length) return false;

    return true;
  }

  // Simple prefix match
  return path.startsWith(pattern);
}
