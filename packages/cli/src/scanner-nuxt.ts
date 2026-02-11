import { readFile } from "node:fs/promises";
import { join, dirname, sep } from "node:path";
import { glob } from "glob";
import type { ResolvedMetadata } from "indxel";
import type { PageInfo } from "./scanner.js";

/**
 * Scan a Nuxt 3 project's pages/ directory for SEO metadata.
 * Looks for useSeoMeta(), useHead(), and definePageMeta() in .vue files.
 */
export async function scanNuxtPages(
  projectRoot: string,
  appDir: string,
): Promise<PageInfo[]> {
  const appDirFull = join(projectRoot, appDir);

  // Find all .vue page files
  const pageFiles = await glob("**/*.vue", {
    cwd: appDirFull,
    ignore: ["**/node_modules/**", "**/components/**", "**/_*/**"],
  });

  const pages: PageInfo[] = [];

  for (const file of pageFiles) {
    const fullPath = join(appDirFull, file);
    const content = await readFile(fullPath, "utf-8");
    const route = vueFilePathToRoute(file);

    const page: PageInfo = {
      filePath: join(appDir, file),
      route,
      hasMetadata: false,
      hasDynamicMetadata: false,
      isClientComponent: false,
      titleIsAbsolute: false,
      extractedMetadata: createEmptyMetadata(),
    };

    // Detect useSeoMeta() — Nuxt 3 composable
    const hasUseSeoMeta = /useSeoMeta\s*\(/.test(content);
    // Detect useHead() — Nuxt 3 composable
    const hasUseHead = /useHead\s*\(/.test(content);
    // Detect definePageMeta() — Nuxt 3 macro
    const hasDefinePageMeta = /definePageMeta\s*\(/.test(content);

    page.hasMetadata = hasUseSeoMeta || hasUseHead || hasDefinePageMeta;

    // If useSeoMeta/useHead depend on computed/ref values, treat as dynamic
    if (page.hasMetadata) {
      const hasComputed = /computed\s*\(/.test(content) || /useAsyncData/.test(content) || /useFetch/.test(content);
      page.hasDynamicMetadata = hasComputed;
    }

    // Extract static metadata from useSeoMeta()
    if (hasUseSeoMeta) {
      page.extractedMetadata = extractNuxtSeoMeta(content);
    } else if (hasUseHead) {
      page.extractedMetadata = extractNuxtUseHead(content);
    }

    pages.push(page);
  }

  // Check app.vue + layouts/ directory for shared metadata
  // Nuxt resolves: app.vue → layouts/default.vue → pages/*.vue
  const layoutSources: Array<{ content: string; scope: "global" }> = [];

  // 1. app.vue (root wrapper)
  try {
    const appVueContent = await readFile(join(projectRoot, "app.vue"), "utf-8");
    layoutSources.push({ content: appVueContent, scope: "global" });
  } catch { /* no app.vue */ }

  // 2. layouts/ directory
  const layoutDir = join(projectRoot, "layouts");
  try {
    const layoutFiles = await glob("**/*.vue", {
      cwd: layoutDir,
      ignore: ["**/node_modules/**"],
    });
    for (const file of layoutFiles) {
      try {
        const content = await readFile(join(layoutDir, file), "utf-8");
        layoutSources.push({ content, scope: "global" });
      } catch { /* skip unreadable */ }
    }
  } catch { /* no layouts/ directory */ }

  // Apply layout metadata + titleTemplate as fallback
  for (const layout of layoutSources) {
    const hasUseSeoMeta = /useSeoMeta\s*\(/.test(layout.content);
    const hasUseHead = /useHead\s*\(/.test(layout.content);

    if (!hasUseSeoMeta && !hasUseHead) continue;

    const layoutMeta = hasUseSeoMeta
      ? extractNuxtSeoMeta(layout.content)
      : extractNuxtUseHead(layout.content);

    // Extract titleTemplate from useHead (Nuxt pattern: titleTemplate: '%s | My Site')
    const templateMatch = layout.content.match(/titleTemplate\s*:\s*["'`]([^"'`]+)["'`]/);
    const titleTemplate = templateMatch?.[1] ?? null;

    for (const page of pages) {
      // Apply titleTemplate if page has a raw title
      if (page.extractedMetadata.title && titleTemplate && !page.titleIsAbsolute
          && page.extractedMetadata.title !== "[detected]") {
        page.extractedMetadata.title = titleTemplate.replace("%s", page.extractedMetadata.title);
        page.titleIsAbsolute = true;
      }

      mergeMetadata(page.extractedMetadata, layoutMeta);
      if (!page.hasMetadata) page.hasMetadata = true;
    }
  }

  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

/** Convert Nuxt page file path to route (e.g., "blog/[slug].vue" → "/blog/[slug]") */
function vueFilePathToRoute(filePath: string): string {
  // Remove .vue extension
  let route = filePath.replace(/\.vue$/, "");
  // index → /
  route = route.replace(/\/index$/, "").replace(/^index$/, "");
  // Normalize separators
  route = "/" + route.split(sep).join("/");
  // Remove route groups
  route = route.replace(/\/\([^)]+\)/g, "") || "/";
  return route;
}

/** Extract metadata from useSeoMeta({ ... }) */
function extractNuxtSeoMeta(source: string): ResolvedMetadata {
  const meta = createEmptyMetadata();

  const block = findCallBlock(source, "useSeoMeta");
  if (!block) return meta;

  // useSeoMeta uses flat keys: title, description, ogTitle, ogDescription, ogImage, etc.
  // IMPORTANT: use word boundary or negative lookbehind to avoid ogDescription matching description
  const titleMatch = block.match(/(?<![a-zA-Z])title\s*:\s*["'`]([^"'`]+)["'`]/);
  if (titleMatch) meta.title = titleMatch[1];

  // Match "description" but NOT "ogDescription" or "twitterDescription"
  const descMatch = block.match(/(?<![a-zA-Z])description\s*:\s*["'`]([^"'`]+)["'`]/);
  if (descMatch) meta.description = descMatch[1];

  const ogTitleMatch = block.match(/ogTitle\s*:\s*["'`]([^"'`]+)["'`]/);
  if (ogTitleMatch) meta.ogTitle = ogTitleMatch[1];

  const ogDescMatch = block.match(/ogDescription\s*:\s*["'`]([^"'`]+)["'`]/);
  if (ogDescMatch) meta.ogDescription = ogDescMatch[1];

  const ogImageMatch = block.match(/ogImage\s*:\s*["'`]([^"'`]+)["'`]/);
  if (ogImageMatch) meta.ogImage = ogImageMatch[1];

  const twitterCardMatch = block.match(/twitterCard\s*:\s*["'`](summary|summary_large_image)["'`]/);
  if (twitterCardMatch) meta.twitterCard = twitterCardMatch[1];

  const robotsMatch = block.match(/(?<![a-zA-Z])robots\s*:\s*["'`]([^"'`]+)["'`]/);
  if (robotsMatch) meta.robots = robotsMatch[1];

  // Detect variable references as [detected]
  if (!meta.title && /(?<![a-zA-Z])title\s*:\s*[a-zA-Z_$]/.test(block)) meta.title = "[detected]";
  if (!meta.description && /(?<![a-zA-Z])description\s*:\s*[a-zA-Z_$]/.test(block)) meta.description = "[detected]";
  if (!meta.ogTitle && /ogTitle\s*:\s*[a-zA-Z_$]/.test(block)) meta.ogTitle = "[detected]";
  if (!meta.ogDescription && /ogDescription\s*:\s*[a-zA-Z_$]/.test(block)) meta.ogDescription = "[detected]";
  if (!meta.ogImage && /ogImage\s*:\s*[a-zA-Z_$]/.test(block)) meta.ogImage = "[detected]";

  return meta;
}

/** Extract metadata from useHead({ ... }) */
function extractNuxtUseHead(source: string): ResolvedMetadata {
  const meta = createEmptyMetadata();

  const block = findCallBlock(source, "useHead");
  if (!block) return meta;

  // title
  const titleMatch = block.match(/title\s*:\s*["'`]([^"'`]+)["'`]/);
  if (titleMatch) meta.title = titleMatch[1];

  // meta tags within useHead
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

  // JSON-LD
  if (/application\/ld\+json/.test(source)) {
    meta.structuredData = [{ "@context": "https://schema.org", "@type": "detected" }];
  }

  return meta;
}

/** Find the argument block of a function call (brace-matching) */
function findCallBlock(source: string, funcName: string): string | null {
  const regex = new RegExp(`${funcName}\\s*\\(`);
  const match = source.match(regex);
  if (!match || match.index === undefined) return null;

  const start = source.indexOf("(", match.index);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) return source.substring(start, i + 1);
    }
  }
  return null;
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
