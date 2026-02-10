/**
 * Asset verifier — check that URLs referenced in metadata actually respond.
 * Checks og:image, favicon, canonical, and other referenced URLs.
 */

import type { ResolvedMetadata } from "./types.js";
import { safeFetch, validatePublicUrl } from "./safe-fetch.js";

export interface AssetCheck {
  url: string;
  type: "og:image" | "favicon" | "canonical" | "alternate" | "structured-data-image";
  status: number;
  ok: boolean;
  contentType?: string;
  error?: string;
  /** For images: warns if content-type is not an image */
  warning?: string;
}

export interface AssetCheckResult {
  checks: AssetCheck[];
  totalChecked: number;
  totalOk: number;
  totalBroken: number;
  totalWarnings: number;
}

export interface AssetCheckOptions {
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** User-Agent string */
  userAgent?: string;
}

/**
 * Verify that all assets referenced in page metadata are accessible.
 * Uses HEAD requests for efficiency.
 */
export async function verifyAssets(
  pages: Array<{ url: string; metadata: ResolvedMetadata }>,
  options?: AssetCheckOptions,
): Promise<AssetCheckResult> {
  const timeout = options?.timeout ?? 10000;
  const userAgent = options?.userAgent ?? "Indxel/0.1 (SEO asset checker)";

  // Collect all URLs to check (deduplicate)
  const urlsToCheck = new Map<string, AssetCheck["type"]>();

  for (const page of pages) {
    const { metadata } = page;
    const baseUrl = page.url;

    if (metadata.ogImage) {
      const resolved = resolveUrl(metadata.ogImage, baseUrl);
      if (resolved) urlsToCheck.set(resolved, "og:image");
    }

    if (metadata.favicon) {
      const resolved = resolveUrl(metadata.favicon, baseUrl);
      if (resolved) urlsToCheck.set(resolved, "favicon");
    }

    if (metadata.canonical) {
      urlsToCheck.set(metadata.canonical, "canonical");
    }

    if (metadata.alternates) {
      for (const url of Object.values(metadata.alternates)) {
        urlsToCheck.set(url, "alternate");
      }
    }

    if (metadata.structuredData) {
      for (const sd of metadata.structuredData) {
        const imageUrl = (sd as Record<string, unknown>).image;
        if (typeof imageUrl === "string") {
          const resolved = resolveUrl(imageUrl, baseUrl);
          if (resolved) urlsToCheck.set(resolved, "structured-data-image");
        }
      }
    }
  }

  // Check all URLs concurrently (in batches of 10)
  const entries = [...urlsToCheck.entries()];
  const checks: AssetCheck[] = [];
  const batchSize = 10;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(([url, type]) => checkAsset(url, type, timeout, userAgent)),
    );
    checks.push(...results);
  }

  const totalOk = checks.filter((c) => c.ok).length;
  const totalBroken = checks.filter((c) => !c.ok).length;
  const totalWarnings = checks.filter((c) => c.warning).length;

  return {
    checks,
    totalChecked: checks.length,
    totalOk,
    totalBroken,
    totalWarnings,
  };
}

async function checkAsset(
  url: string,
  type: AssetCheck["type"],
  timeout: number,
  userAgent: string,
): Promise<AssetCheck> {
  try {
    validatePublicUrl(url);
    const response = await safeFetch(url, {
      method: "HEAD",
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(timeout),
    });

    const contentType = response.headers.get("content-type") ?? undefined;
    let warning: string | undefined;

    // Check content-type for image assets
    if (
      (type === "og:image" || type === "favicon" || type === "structured-data-image") &&
      response.ok &&
      contentType &&
      !contentType.startsWith("image/")
    ) {
      warning = `Expected image content-type, got '${contentType}'`;
    }

    return {
      url,
      type,
      status: response.status,
      ok: response.ok,
      contentType,
      warning,
    };
  } catch (err) {
    return {
      url,
      type,
      status: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function resolveUrl(url: string, baseUrl: string): string | null {
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}
