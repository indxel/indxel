import type { ResolvedMetadata } from "./types.js";

/**
 * Extract SEO-relevant metadata from raw HTML.
 * Uses regex parsing — fast, no dependencies, works on any HTML.
 */
export function extractMetadataFromHtml(html: string): ResolvedMetadata {
  const getTag = (pattern: RegExp): string | null => {
    const match = html.match(pattern);
    return match?.[1]?.trim() ?? null;
  };

  const title = getTag(/<title[^>]*>([^<]+)<\/title>/i);
  const description = getMetaContent(html, "description");
  const robots = getMetaContent(html, "robots");
  const viewport = getMetaContent(html, "viewport");

  const ogTitle = getMetaProperty(html, "og:title");
  const ogDescription = getMetaProperty(html, "og:description");
  const ogImage = getMetaProperty(html, "og:image");
  const ogType = getMetaProperty(html, "og:type");

  const twitterCard = getMetaName(html, "twitter:card");
  const twitterTitle = getMetaName(html, "twitter:title");
  const twitterDescription = getMetaName(html, "twitter:description");

  const canonical =
    getTag(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
    getTag(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);

  const favicon =
    getTag(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i) ??
    getTag(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i);

  const structuredData: object[] = [];
  const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldRegex.exec(html)) !== null) {
    try {
      structuredData.push(JSON.parse(ldMatch[1]));
    } catch {
      // Skip invalid JSON-LD
    }
  }

  const alternates: Record<string, string> = {};
  const hreflangRegex =
    /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["']/gi;
  let hreflangMatch: RegExpExecArray | null;
  while ((hreflangMatch = hreflangRegex.exec(html)) !== null) {
    alternates[hreflangMatch[1]] = hreflangMatch[2];
  }

  const images = extractImages(html);

  return {
    title,
    description,
    canonical,
    ogTitle,
    ogDescription,
    ogImage,
    ogType,
    twitterCard,
    twitterTitle,
    twitterDescription,
    robots,
    alternates: Object.keys(alternates).length > 0 ? alternates : null,
    structuredData: structuredData.length > 0 ? structuredData : null,
    viewport,
    favicon,
    images: images.length > 0 ? images : null,
  };
}

/**
 * Extract all internal links from HTML for a given base URL.
 * Returns deduplicated absolute URLs on the same domain.
 */
export function extractInternalLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();

  const hrefRegex = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1].trim();
    try {
      const resolved = new URL(href, baseUrl);
      // Same origin only
      if (resolved.origin === base.origin) {
        // Normalize: strip hash, strip trailing slash (except root)
        resolved.hash = "";
        let pathname = resolved.pathname;
        if (pathname !== "/" && pathname.endsWith("/")) {
          pathname = pathname.slice(0, -1);
        }
        resolved.pathname = pathname;
        links.add(resolved.href);
      }
    } catch {
      // Skip invalid URLs
    }
  }

  return [...links];
}

/**
 * Extract all external links from HTML for a given base URL.
 * Returns deduplicated absolute URLs on different domains.
 */
export function extractExternalLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();

  const hrefRegex = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1].trim();
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        if (resolved.origin !== base.origin) {
          links.add(resolved.href);
        }
      }
    } catch {
      // Skip invalid URLs
    }
  }

  return [...links];
}

export interface ImageInfo {
  src: string;
  alt: string | null;
}

/**
 * Extract all images from HTML with their alt attributes.
 */
export function extractImages(html: string): ImageInfo[] {
  const images: ImageInfo[] = [];
  const imgRegex = /<img[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) continue;

    const src = srcMatch[1].trim();
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);
    const alt = altMatch ? altMatch[1] : null;

    images.push({ src, alt });
  }

  return images;
}

/**
 * Extract all H1 tags from HTML.
 */
export function extractH1s(html: string): string[] {
  const h1s: string[] = [];
  const regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    // Strip inner HTML tags, decode entities, trim
    const text = match[1].replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, " ").trim();
    if (text) h1s.push(text);
  }
  return h1s;
}

/**
 * Extract approximate word count from visible page body text.
 */
export function extractWordCount(html: string): number {
  // Remove script, style, noscript tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  // Try to isolate <main> or <body> content
  const mainMatch = text.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (mainMatch) text = mainMatch[1];
  // Strip all HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common entities
  text = text.replace(/&nbsp;/g, " ").replace(/&[^;]+;/g, " ");
  // Count words
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}

/**
 * Extract JSON-LD @type values from structured data.
 */
export function extractStructuredDataTypes(structuredData: object[] | null): string[] {
  if (!structuredData) return [];
  const types: string[] = [];
  for (const entry of structuredData) {
    const obj = entry as Record<string, unknown>;
    if (typeof obj["@type"] === "string") {
      types.push(obj["@type"]);
    } else if (Array.isArray(obj["@type"])) {
      types.push(...(obj["@type"] as string[]));
    }
    // Check @graph entries
    if (Array.isArray(obj["@graph"])) {
      for (const item of obj["@graph"] as Record<string, unknown>[]) {
        if (typeof item["@type"] === "string") types.push(item["@type"]);
      }
    }
  }
  return [...new Set(types)];
}

// -- Internal helpers --

function getMetaContent(html: string, name: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+name=["']${escapeRegex(name)}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(pattern);
  if (match) return match[1].trim() || null;

  const patternRev = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escapeRegex(name)}["']`,
    "i",
  );
  const matchRev = html.match(patternRev);
  return matchRev?.[1]?.trim() || null;
}

function getMetaProperty(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+property=["']${escapeRegex(property)}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(pattern);
  if (match) return match[1].trim() || null;

  const patternRev = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escapeRegex(property)}["']`,
    "i",
  );
  const matchRev = html.match(patternRev);
  return matchRev?.[1]?.trim() || null;
}

function getMetaName(html: string, name: string): string | null {
  return getMetaContent(html, name) ?? getMetaProperty(html, name);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
