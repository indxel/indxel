import { readFile } from "node:fs/promises";
import { join, relative, dirname, sep } from "node:path";
import { glob } from "glob";
import type { ResolvedMetadata } from "indxel";

export interface PageInfo {
  /** File path relative to project root */
  filePath: string;
  /** Route path (e.g., "/blog/[slug]") */
  route: string;
  /** Whether the page exports metadata or generateMetadata */
  hasMetadata: boolean;
  /** Whether the page exports generateMetadata (dynamic) */
  hasDynamicMetadata: boolean;
  /** Whether the page is a client component ('use client') */
  isClientComponent: boolean;
  /** Whether the title uses absolute: (skip template) */
  titleIsAbsolute: boolean;
  /** Extracted static metadata fields (best effort from source parsing) */
  extractedMetadata: ResolvedMetadata;
}

/**
 * Scan the app directory for all page files and extract metadata info.
 * This does static analysis of the source code (no build required).
 */
export async function scanPages(
  projectRoot: string,
  appDir: string,
): Promise<PageInfo[]> {
  const appDirFull = join(projectRoot, appDir);

  // Find all page.tsx/page.ts/page.jsx/page.js files
  const pageFiles = await glob("**/page.{tsx,ts,jsx,js}", {
    cwd: appDirFull,
    ignore: ["**/node_modules/**", "**/_*/**"],
  });

  const pages: PageInfo[] = [];

  for (const file of pageFiles) {
    const fullPath = join(appDirFull, file);
    const content = await readFile(fullPath, "utf-8");
    const route = filePathToRoute(file);
    const isClient = isClientComponent(content);

    const page: PageInfo = {
      filePath: join(appDir, file),
      route,
      hasMetadata: false,
      hasDynamicMetadata: false,
      isClientComponent: isClient,
      titleIsAbsolute: false,
      extractedMetadata: createEmptyMetadata(),
    };

    // Check for metadata exports
    page.hasDynamicMetadata = hasExport(content, "generateMetadata");
    page.hasMetadata = page.hasDynamicMetadata || hasExport(content, "metadata");

    // Extract static metadata (best effort)
    if (page.hasDynamicMetadata) {
      // generateMetadata() pages can't be analyzed statically — regex can't
      // parse function bodies. Leave metadata empty; `indxel crawl` handles these.
    } else if (!isClient || page.hasMetadata) {
      // Skip extraction for client components without metadata export —
      // regex would match JSX content instead of actual metadata
      page.extractedMetadata = extractStaticMetadata(content);
      // Check if the title was from absolute: (no template should be applied)
      const metaBlock = findMetadataBlock(content);
      if (metaBlock && /absolute\s*:\s*["'`]/.test(metaBlock)) {
        page.titleIsAbsolute = true;
      }
    }

    pages.push(page);
  }

  // Also check layout files for metadata
  const layoutFiles = await glob("**/layout.{tsx,ts,jsx,js}", {
    cwd: appDirFull,
    ignore: ["**/node_modules/**", "**/_*/**"],
  });

  // Sort layouts by depth descending — deeper layouts get merge priority,
  // root layout fills remaining gaps last
  const sortedLayouts = layoutFiles.sort((a, b) => {
    const depthA = a.split(sep).length;
    const depthB = b.split(sep).length;
    return depthB - depthA;
  });

  for (const file of sortedLayouts) {
    const fullPath = join(appDirFull, file);
    const content = await readFile(fullPath, "utf-8");
    const route = filePathToRoute(file).replace(/\/layout$/, "") || "/";

    const hasMetadataExport = hasExport(content, "metadata") || hasExport(content, "generateMetadata");
    if (hasMetadataExport) {
      const layoutMeta = extractStaticMetadata(content);

      // Extract title template from layout for title resolution
      const templateMatch = content.match(/template\s*:\s*["'`]([^"'`]+)["'`]/);
      const titleTemplate = templateMatch?.[1] ?? null;

      for (const page of pages) {
        if (page.route.startsWith(route) || route === "/") {
          // If the page has its own title (not absolute) and layout has a template, resolve it
          if (page.extractedMetadata.title && titleTemplate && !page.titleIsAbsolute) {
            page.extractedMetadata.title = titleTemplate.replace("%s", page.extractedMetadata.title);
            page.titleIsAbsolute = true; // prevent double-templating from parent layouts
          }

          // Merge layout metadata as fallback (page-level takes precedence)
          mergeMetadata(page.extractedMetadata, layoutMeta);
          if (!page.hasMetadata) {
            page.hasMetadata = true;
          }
        }
      }
    }
  }

  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

/** Convert a file path like "blog/[slug]/page.tsx" to route "/blog/[slug]" */
function filePathToRoute(filePath: string): string {
  const dir = dirname(filePath);
  if (dir === ".") return "/";
  // Normalize separators and add leading slash
  const route = "/" + dir.split(sep).join("/");
  // Remove route groups like (marketing)
  return route.replace(/\/\([^)]+\)/g, "") || "/";
}

/** Check if the source starts with 'use client' directive */
function isClientComponent(source: string): boolean {
  // Match 'use client' or "use client" at the start of the file (ignoring whitespace/comments)
  return /^[\s]*(['"])use client\1/.test(source);
}

/** Check if source code exports a given name */
function hasExport(source: string, name: string): boolean {
  // Match: export const metadata, export async function generateMetadata, export function generateMetadata
  const patterns = [
    new RegExp(`export\\s+(const|let|var)\\s+${name}\\b`),
    new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`),
    new RegExp(`export\\s+\\{[^}]*\\b${name}\\b[^}]*\\}`),
  ];
  return patterns.some((p) => p.test(source));
}

/**
 * Find the metadata export block in source code using brace-matching.
 * Returns the block content or null if not found.
 */
function findMetadataBlock(source: string): string | null {
  const match = source.match(/export\s+(const|let|var)\s+metadata[\s:]/);
  if (!match || match.index === undefined) return null;

  const start = source.indexOf("{", match.index);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.substring(start, i + 1);
    }
  }
  return null;
}

/**
 * Extract metadata from static `export const metadata = { ... }` patterns.
 * This is best-effort source code parsing (not AST — fast and simple).
 */
function extractStaticMetadata(source: string): ResolvedMetadata {
  const meta = createEmptyMetadata();

  // Scope extraction to the metadata export block when possible
  // This prevents matching JSX content or unrelated objects
  const metaBlock = findMetadataBlock(source) ?? source;

  // Extract title — handle multiple patterns:
  // 1. title: "simple string"
  // 2. title: { absolute: "..." }
  // 3. title: { default: "..." }
  const absoluteMatch = metaBlock.match(
    /absolute\s*:\s*["'`]([^"'`]+)["'`]/,
  );
  if (absoluteMatch) {
    meta.title = absoluteMatch[1];
  } else {
    const defaultMatch = metaBlock.match(
      /default\s*:\s*["'`]([^"'`]+)["'`]/,
    );
    if (defaultMatch) {
      meta.title = defaultMatch[1];
    } else {
      // Simple title: "string" — but only match top-level title, not nested ones
      const titleMatch = metaBlock.match(
        /(?:^|[,{\n])\s*title\s*:\s*["'`]([^"'`]+)["'`]/,
      );
      if (titleMatch) {
        meta.title = titleMatch[1];
      }
    }
  }

  // Extract description — scope to metadata block
  const descMatch = metaBlock.match(
    /(?:^|[,{\n])\s*description\s*:\s*\n?\s*["'`]([^"'`]+)["'`]/,
  );
  if (descMatch) {
    meta.description = descMatch[1];
  }

  // Check for openGraph object (scoped to metadata block)
  if (/openGraph\s*:\s*\{/.test(metaBlock)) {
    const ogTitleMatch = metaBlock.match(
      /openGraph\s*:\s*\{[^}]*title\s*:\s*["'`]([^"'`]+)["'`]/s,
    );
    if (ogTitleMatch) meta.ogTitle = ogTitleMatch[1];

    const ogDescMatch = metaBlock.match(
      /openGraph\s*:\s*\{[^}]*description\s*:\s*["'`]([^"'`]+)["'`]/s,
    );
    if (ogDescMatch) meta.ogDescription = ogDescMatch[1];

    if (/images\s*:\s*\[/.test(metaBlock)) {
      meta.ogImage = "[detected]";
    }
  }

  // Check for twitter config (scoped to metadata block)
  if (/twitter\s*:\s*\{/.test(metaBlock)) {
    const cardMatch = metaBlock.match(
      /card\s*:\s*["'`](summary|summary_large_image)["'`]/,
    );
    if (cardMatch) meta.twitterCard = cardMatch[1];
  }

  // Check for robots (scoped to metadata block)
  if (/robots\s*:\s*\{/.test(metaBlock) || /robots\s*:\s*["'`]/.test(metaBlock)) {
    const robotsMatch = metaBlock.match(
      /robots\s*:\s*["'`]([^"'`]+)["'`]/,
    );
    if (robotsMatch) meta.robots = robotsMatch[1];
  }

  // Check for alternates/canonical (scoped to metadata block)
  if (/alternates\s*:\s*\{/.test(metaBlock)) {
    const canonicalMatch = metaBlock.match(
      /canonical\s*:\s*["'`]([^"'`]+)["'`]/,
    );
    if (canonicalMatch) meta.canonical = canonicalMatch[1];

    // Detect hreflang / languages declarations
    if (/languages\s*:\s*\{/.test(metaBlock)) {
      const langs: Record<string, string> = {};
      const langMatches = metaBlock.matchAll(
        /["'`](\w{2}(?:-\w{2})?)["'`]\s*:\s*["'`]([^"'`]+)["'`]/g,
      );
      for (const m of langMatches) {
        if (m[1] && m[2] && m[2].startsWith("http")) {
          langs[m[1]] = m[2];
        }
      }
      if (Object.keys(langs).length > 0) {
        meta.alternates = langs;
      }
    }
  }

  // --- Fallback: detect fields set via variable references ---
  // When metadata values come from imported config (e.g., siteConfig.xxx),
  // regex can't extract the string value, but we know the field is present.
  // This is critical for layout-to-page merge to cascade correctly.
  if (!meta.title && /(?:^|[,{\n])\s*title\s*:\s*(?:\{|[a-zA-Z_$])/.test(metaBlock)) {
    meta.title = "[detected]";
  }
  if (!meta.description && /(?:^|[,{\n])\s*description\s*:\s*[a-zA-Z_$]/.test(metaBlock)) {
    meta.description = "[detected]";
  }
  if (/openGraph\s*:\s*\{/.test(metaBlock)) {
    if (!meta.ogTitle) meta.ogTitle = "[detected]";
    if (!meta.ogDescription) meta.ogDescription = "[detected]";
    if (!meta.ogImage) meta.ogImage = "[detected]";
  }
  if (/twitter\s*:\s*\{/.test(metaBlock)) {
    if (!meta.twitterCard) meta.twitterCard = "[detected]";
  }
  if (/alternates\s*:\s*\{/.test(metaBlock) && !meta.canonical) {
    if (/canonical\s*:/.test(metaBlock)) meta.canonical = "[detected]";
  }

  // Check for structured data — search full source (JSON-LD can be in JSX, not metadata)
  if (/application\/ld\+json/.test(source) || /generateLD/.test(source) || /JsonLD/.test(source)) {
    meta.structuredData = [{ "@context": "https://schema.org", "@type": "detected" }];
  }

  // Check for viewport — search full source (can be a separate export)
  if (/viewport\s*[:=]/.test(source)) {
    meta.viewport = "detected";
  }

  // Check for icons/favicon (scoped to metadata block)
  if (/icons\s*:\s*\{/.test(metaBlock) || /favicon/.test(metaBlock)) {
    meta.favicon = "detected";
  }

  return meta;
}

function createEmptyMetadata(): ResolvedMetadata {
  return {
    title: null,
    description: null,
    canonical: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    ogType: null,
    twitterCard: null,
    twitterTitle: null,
    twitterDescription: null,
    robots: null,
    alternates: null,
    structuredData: null,
    viewport: null,
    favicon: null,
  };
}

/** Merge source metadata into target (target takes precedence if already set) */
function mergeMetadata(target: ResolvedMetadata, source: ResolvedMetadata): void {
  for (const key of Object.keys(source) as (keyof ResolvedMetadata)[]) {
    if (target[key] === null || target[key] === undefined) {
      (target as Record<string, unknown>)[key] = source[key];
    }
  }
}
