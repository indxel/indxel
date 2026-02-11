import { readFile } from "node:fs/promises";
import { join, dirname, sep } from "node:path";
import { glob } from "glob";
import type { ResolvedMetadata } from "indxel";
import type { PageInfo } from "./scanner.js";

/**
 * Scan a Remix project's routes/ directory for SEO metadata.
 * Looks for export const meta / export function meta in route files.
 */
export async function scanRemixPages(
  projectRoot: string,
  appDir: string,
): Promise<PageInfo[]> {
  const appDirFull = join(projectRoot, appDir);

  // Remix route files: .tsx, .ts, .jsx, .js
  const routeFiles = await glob("**/*.{tsx,ts,jsx,js}", {
    cwd: appDirFull,
    ignore: ["**/node_modules/**", "**/__*/**", "**/*.server.*", "**/*.client.*"],
  });

  const pages: PageInfo[] = [];

  for (const file of routeFiles) {
    const fullPath = join(appDirFull, file);
    const content = await readFile(fullPath, "utf-8");
    const route = remixFilePathToRoute(file);

    const page: PageInfo = {
      filePath: join(appDir, file),
      route,
      hasMetadata: false,
      hasDynamicMetadata: false,
      isClientComponent: false,
      titleIsAbsolute: false,
      extractedMetadata: createEmptyMetadata(),
    };

    // Remix v2: export const meta = () => [...]
    // Remix v1: export const meta = () => ({...})
    const hasMetaExport = hasExport(content, "meta");
    page.hasMetadata = hasMetaExport;

    // Check if meta actually uses loader data in its body (not just the signature).
    // In Remix v2, `({ data })` is the standard signature even when unused.
    // Only mark as dynamic if the meta body references `data.` or uses matches/params.
    if (hasMetaExport) {
      const metaBody = extractMetaBody(content);
      if (metaBody) {
        const usesData = /\bdata\./.test(metaBody) || /\bdata\[/.test(metaBody);
        const usesMatches = /\bmatches\b/.test(metaBody);
        const usesParams = /\bparams\./.test(metaBody);
        page.hasDynamicMetadata = usesData || usesMatches || usesParams;
      }
    }

    // Always try to extract what we can, even for dynamic pages
    if (hasMetaExport) {
      page.extractedMetadata = extractRemixMeta(content);
    }

    // JSON-LD detection
    if (/application\/ld\+json/.test(content)) {
      page.extractedMetadata.structuredData = [{ "@context": "https://schema.org", "@type": "detected" }];
    }

    pages.push(page);
  }

  // Check root.tsx for layout-level meta
  for (const rootFile of ["root.tsx", "root.jsx", "root.ts", "root.js"]) {
    const rootPath = join(projectRoot, "app", rootFile);
    try {
      const rootContent = await readFile(rootPath, "utf-8");
      if (hasExport(rootContent, "meta")) {
        const rootMeta = extractRemixMeta(rootContent);
        for (const page of pages) {
          mergeMetadata(page.extractedMetadata, rootMeta);
          if (!page.hasMetadata) page.hasMetadata = true;
        }
      }
    } catch {
      // No root file — continue
    }
  }

  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Convert Remix route file path to route.
 * Remix v2 flat routes: "blog.$slug.tsx" → "/blog/:slug"
 * Nested routes: "blog/index.tsx" → "/blog"
 */
function remixFilePathToRoute(filePath: string): string {
  let route = filePath
    .replace(/\.(tsx|ts|jsx|js)$/, "")
    .replace(/\/index$/, "")
    .replace(/^index$/, "");

  // Remix v2 flat route convention: dots become slashes
  // but _index stays as index route
  route = route.replace(/\._index$/, "");
  // $param → :param (but we keep [] for consistency with other scanners)
  route = route.replace(/\$/g, "[").replace(/\./g, "/");

  // Fix bracket matching for params
  route = route.replace(/\[([^/]+)/g, (_, name) => `[${name}]`);

  // Normalize
  route = "/" + route.split(sep).join("/");
  // Remove layout prefix _
  route = route.replace(/\/_[^/]+/g, "");

  return route || "/";
}

/** Extract metadata from Remix v2 meta export: export const meta = () => [...] */
function extractRemixMeta(source: string): ResolvedMetadata {
  const meta = createEmptyMetadata();

  // Find the meta export block
  const metaMatch = source.match(/export\s+(?:const|function)\s+meta\s*=?\s*(?:\([^)]*\)\s*(?:=>)?\s*)?[\[({]/);
  if (!metaMatch || metaMatch.index === undefined) return meta;

  // Get a reasonable chunk after the match for parsing
  const startIdx = metaMatch.index;
  const block = source.substring(startIdx, Math.min(startIdx + 2000, source.length));

  // Remix v2 meta returns an array of objects: [{ title: "..." }, { name: "description", content: "..." }]
  const titleMatch = block.match(/\{\s*title\s*:\s*["'`]([^"'`]+)["'`]/);
  if (titleMatch) meta.title = titleMatch[1];

  const descMatch = block.match(/name\s*:\s*["'`]description["'`]\s*,\s*content\s*:\s*["'`]([^"'`]+)["'`]/);
  if (descMatch) meta.description = descMatch[1];

  const ogTitleMatch = block.match(/property\s*:\s*["'`]og:title["'`]\s*,\s*content\s*:\s*["'`]([^"'`]+)["'`]/);
  if (ogTitleMatch) meta.ogTitle = ogTitleMatch[1];

  const ogDescMatch = block.match(/property\s*:\s*["'`]og:description["'`]\s*,\s*content\s*:\s*["'`]([^"'`]+)["'`]/);
  if (ogDescMatch) meta.ogDescription = ogDescMatch[1];

  const ogImageMatch = block.match(/property\s*:\s*["'`]og:image["'`]\s*,\s*content\s*:\s*["'`]([^"'`]+)["'`]/);
  if (ogImageMatch) meta.ogImage = ogImageMatch[1];

  // Detect variable references
  if (!meta.title && /title\s*:\s*[a-zA-Z_$]/.test(block)) meta.title = "[detected]";

  return meta;
}

/** Extract the body of the meta function (after the arrow/opening brace) */
function extractMetaBody(source: string): string | null {
  // Match: export const meta = (...) => { ... } or export const meta = (...) => [...]
  const arrowMatch = source.match(/export\s+(?:const|let|var)\s+meta\s*=\s*\([^)]*\)\s*(?::\s*[^=]*?)?\s*=>\s*/);
  if (arrowMatch && arrowMatch.index !== undefined) {
    const bodyStart = arrowMatch.index + arrowMatch[0].length;
    return source.substring(bodyStart, Math.min(bodyStart + 3000, source.length));
  }
  // Match: export function meta(...) { ... }
  const funcMatch = source.match(/export\s+function\s+meta\s*\([^)]*\)\s*(?::\s*[^{]*)?\s*\{/);
  if (funcMatch && funcMatch.index !== undefined) {
    const bodyStart = funcMatch.index + funcMatch[0].length;
    return source.substring(bodyStart, Math.min(bodyStart + 3000, source.length));
  }
  return null;
}

function hasExport(source: string, name: string): boolean {
  const patterns = [
    new RegExp(`export\\s+(const|let|var)\\s+${name}\\b`),
    new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`),
    new RegExp(`export\\s+\\{[^}]*\\b${name}\\b[^}]*\\}`),
  ];
  return patterns.some((p) => p.test(source));
}

function createEmptyMetadata(): ResolvedMetadata {
  return {
    title: null, description: null, canonical: null,
    ogTitle: null, ogDescription: null, ogImage: null, ogType: null,
    twitterCard: null, twitterTitle: null, twitterDescription: null,
    robots: null, alternates: null, structuredData: null,
    viewport: null, favicon: null,
  };
}

function mergeMetadata(target: ResolvedMetadata, source: ResolvedMetadata): void {
  for (const key of Object.keys(source) as (keyof ResolvedMetadata)[]) {
    if (target[key] === null || target[key] === undefined) {
      (target as Record<string, unknown>)[key] = source[key];
    }
  }
}
