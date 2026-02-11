/**
 * Sitemap checker — fetch, parse, and compare sitemap.xml with crawled pages.
 */

import { safeFetch, validatePublicUrl } from "./safe-fetch.js";

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

export interface SitemapResult {
  url: string;
  found: boolean;
  urls: SitemapUrl[];
  errors: string[];
}

export interface SitemapComparison {
  /** URLs in sitemap that were also crawled */
  inBoth: string[];
  /** URLs in sitemap but not found during crawl */
  inSitemapOnly: string[];
  /** URLs found during crawl but missing from sitemap */
  inCrawlOnly: string[];
  /** Issues found */
  issues: string[];
}

const MAX_SITEMAP_DEPTH = 3;

/**
 * Fetch and parse a sitemap.xml from a URL.
 * Supports basic sitemap and sitemap index formats.
 * Includes SSRF protection and recursion limits.
 */
export async function fetchSitemap(
  baseUrl: string,
  path = "/sitemap.xml",
): Promise<SitemapResult> {
  return fetchSitemapInternal(baseUrl, path, 0, new Set());
}

async function fetchSitemapInternal(
  baseUrl: string,
  path: string,
  depth: number,
  visited: Set<string>,
): Promise<SitemapResult> {
  const base = new URL(baseUrl);
  const sitemapUrl = path && path.startsWith("http") ? path : new URL(path || "/sitemap.xml", base).href;
  const errors: string[] = [];
  let urls: SitemapUrl[] = [];

  // Circular reference detection
  if (visited.has(sitemapUrl)) {
    return { url: sitemapUrl, found: false, urls: [], errors: ["Circular sitemap reference detected"] };
  }
  visited.add(sitemapUrl);

  // Recursion depth limit
  if (depth > MAX_SITEMAP_DEPTH) {
    return { url: sitemapUrl, found: false, urls: [], errors: [`Sitemap nesting too deep (max ${MAX_SITEMAP_DEPTH})`] };
  }

  try {
    // SSRF protection
    validatePublicUrl(sitemapUrl);

    const response = await safeFetch(sitemapUrl, {
      headers: {
        "User-Agent": "Indxel/0.1 (SEO sitemap checker)",
        Accept: "application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        url: sitemapUrl,
        found: false,
        urls: [],
        errors: [`Sitemap returned HTTP ${response.status}`],
      };
    }

    const xml = await response.text();

    // Check for sitemap index
    if (xml.includes("<sitemapindex")) {
      const sitemapLocs = extractXmlValues(xml, "sitemap", "loc");
      for (const loc of sitemapLocs) {
        try {
          validatePublicUrl(loc);
          const childResult = await fetchSitemapInternal(loc, loc, depth + 1, visited);
          urls.push(...childResult.urls);
          errors.push(...childResult.errors);
        } catch (e) {
          errors.push(`Failed to fetch child sitemap ${loc}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } else {
      urls = parseSitemapXml(xml);
    }

    // Validate URLs
    for (const u of urls) {
      if (!u.loc) {
        errors.push("Found <url> entry without <loc>");
      }
    }

    return { url: sitemapUrl, found: true, urls, errors };
  } catch (err) {
    return {
      url: sitemapUrl,
      found: false,
      urls: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Compare sitemap URLs with crawled page URLs.
 */
export function compareSitemap(
  sitemapUrls: string[],
  crawledUrls: string[],
): SitemapComparison {
  const normalizedSitemap = new Set(sitemapUrls.map(normalizeCompareUrl));
  const normalizedCrawled = new Set(crawledUrls.map(normalizeCompareUrl));

  const inBoth: string[] = [];
  const inSitemapOnly: string[] = [];
  const inCrawlOnly: string[] = [];
  const issues: string[] = [];

  for (const url of normalizedSitemap) {
    if (normalizedCrawled.has(url)) {
      inBoth.push(url);
    } else {
      inSitemapOnly.push(url);
    }
  }

  for (const url of normalizedCrawled) {
    if (!normalizedSitemap.has(url)) {
      inCrawlOnly.push(url);
    }
  }

  if (inSitemapOnly.length > 0) {
    issues.push(
      `${inSitemapOnly.length} URL(s) in sitemap but not reachable during crawl — possible dead links or noindex pages`,
    );
  }

  if (inCrawlOnly.length > 0) {
    issues.push(
      `${inCrawlOnly.length} crawled URL(s) missing from sitemap — Google may not discover these pages efficiently`,
    );
  }

  return { inBoth, inSitemapOnly, inCrawlOnly, issues };
}

// -- Internal helpers --

function parseSitemapXml(xml: string): SitemapUrl[] {
  const urls: SitemapUrl[] = [];
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/gi;
  let match: RegExpExecArray | null;

  while ((match = urlBlockRegex.exec(xml)) !== null) {
    const block = match[1];
    const loc = extractXmlValue(block, "loc");
    if (loc) {
      urls.push({
        loc,
        lastmod: extractXmlValue(block, "lastmod") ?? undefined,
        changefreq: extractXmlValue(block, "changefreq") ?? undefined,
        priority: extractXmlValue(block, "priority") ?? undefined,
      });
    }
  }

  return urls;
}

function extractXmlValue(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim() ?? null;
}

function extractXmlValues(xml: string, parentTag: string, childTag: string): string[] {
  const values: string[] = [];
  const parentRegex = new RegExp(`<${parentTag}[^>]*>([\\s\\S]*?)</${parentTag}>`, "gi");
  let match: RegExpExecArray | null;

  while ((match = parentRegex.exec(xml)) !== null) {
    const value = extractXmlValue(match[1], childTag);
    if (value) values.push(value);
  }

  return values;
}

function normalizeCompareUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    // Normalize www/non-www so lecapybara.fr and www.lecapybara.fr match
    u.hostname = u.hostname.replace(/^www\./, "");
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
