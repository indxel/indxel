import { readFile } from "node:fs/promises";
import { join, dirname, sep } from "node:path";
import { glob } from "glob";
import type { ResolvedMetadata } from "indxel";
import type { PageInfo } from "./scanner.js";

/**
 * Scan a SvelteKit project's src/routes/ directory for SEO metadata.
 * Looks for <svelte:head> in +page.svelte and +layout.svelte files.
 */
export async function scanSvelteKitPages(
  projectRoot: string,
  appDir: string,
): Promise<PageInfo[]> {
  const appDirFull = join(projectRoot, appDir);

  // SvelteKit page files: +page.svelte
  const pageFiles = await glob("**/+page.svelte", {
    cwd: appDirFull,
    ignore: ["**/node_modules/**"],
  });

  const pages: PageInfo[] = [];

  for (const file of pageFiles) {
    const fullPath = join(appDirFull, file);
    const content = await readFile(fullPath, "utf-8");
    const route = svelteKitFilePathToRoute(file);

    const page: PageInfo = {
      filePath: join(appDir, file),
      route,
      hasMetadata: false,
      hasDynamicMetadata: false,
      isClientComponent: false,
      titleIsAbsolute: false,
      extractedMetadata: createEmptyMetadata(),
    };

    // Check for <svelte:head> block
    const hasSvelteHead = /<svelte:head[\s>]/.test(content);
    page.hasMetadata = hasSvelteHead;

    // Only mark as dynamic if the <svelte:head> actually uses `data.` from the load function.
    // A page can have a load function for list data while having static <svelte:head>.
    if (hasSvelteHead) {
      page.extractedMetadata = extractSvelteHeadMeta(content);

      // Check if the head block references reactive data (data.xxx, $page, etc.)
      const headBlock = content.match(/<svelte:head[\s>]([\s\S]*?)<\/svelte:head>/)?.[1] ?? "";
      const headUsesData = /\bdata\./.test(headBlock) || /\$page/.test(headBlock) || /\{#each/.test(headBlock);
      page.hasDynamicMetadata = headUsesData;
    }

    // JSON-LD detection
    if (/application\/ld\+json/.test(content)) {
      page.extractedMetadata.structuredData = [{ "@context": "https://schema.org", "@type": "detected" }];
    }

    pages.push(page);
  }

  // Check +layout.svelte files for shared <svelte:head>
  const layoutFiles = await glob("**/+layout.svelte", {
    cwd: appDirFull,
    ignore: ["**/node_modules/**"],
  });

  // Sort layouts by depth descending (deeper layouts first)
  const sortedLayouts = layoutFiles.sort((a, b) => {
    const depthA = a.split(sep).length;
    const depthB = b.split(sep).length;
    return depthB - depthA;
  });

  for (const file of sortedLayouts) {
    try {
      const content = await readFile(join(appDirFull, file), "utf-8");
      if (!/<svelte:head[\s>]/.test(content)) continue;

      const layoutMeta = extractSvelteHeadMeta(content);
      const layoutRoute = svelteKitFilePathToRoute(file).replace(/\/\+layout$/, "") || "/";

      for (const page of pages) {
        if (page.route.startsWith(layoutRoute) || layoutRoute === "/") {
          mergeMetadata(page.extractedMetadata, layoutMeta);
          if (!page.hasMetadata) page.hasMetadata = true;
        }
      }
    } catch {
      // Skip unreadable layouts
    }
  }

  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

/** Convert SvelteKit file path to route (e.g., "blog/[slug]/+page.svelte" → "/blog/[slug]") */
function svelteKitFilePathToRoute(filePath: string): string {
  const dir = dirname(filePath);
  if (dir === ".") return "/";
  let route = "/" + dir.split(sep).join("/");
  // Remove route groups like (marketing)
  route = route.replace(/\/\([^)]+\)/g, "") || "/";
  return route;
}

/** Extract metadata from <svelte:head> block */
function extractSvelteHeadMeta(source: string): ResolvedMetadata {
  const meta = createEmptyMetadata();

  // Extract <svelte:head>...</svelte:head> block
  const headMatch = source.match(/<svelte:head[\s>]([\s\S]*?)<\/svelte:head>/);
  if (!headMatch) return meta;

  const head = headMatch[1];

  // <title>
  const titleMatch = head.match(/<title[^>]*>([^<{]+)<\/title>/);
  if (titleMatch) meta.title = titleMatch[1].trim();

  // Detect dynamic title: <title>{data.title}</title>
  if (!meta.title && /<title[^>]*>\{/.test(head)) meta.title = "[detected]";

  // <meta> tags — handle both attribute orders (name/property before or after content)
  meta.description = extractMetaTag(head, "name", "description");
  meta.ogTitle = extractMetaTag(head, "property", "og:title");
  meta.ogDescription = extractMetaTag(head, "property", "og:description");
  meta.ogImage = extractMetaTag(head, "property", "og:image");
  meta.robots = extractMetaTag(head, "name", "robots");

  const canonicalMatch = head.match(/<link\s[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/)
    || head.match(/<link\s[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/);
  if (canonicalMatch) meta.canonical = canonicalMatch[1];

  // Detect dynamic values ({variable}) for all SEO-relevant meta tags
  if (!meta.description && hasDynamicMeta(head, "name", "description")) meta.description = "[detected]";
  if (!meta.ogTitle && hasDynamicMeta(head, "property", "og:title")) meta.ogTitle = "[detected]";
  if (!meta.ogDescription && hasDynamicMeta(head, "property", "og:description")) meta.ogDescription = "[detected]";
  if (!meta.ogImage && hasDynamicMeta(head, "property", "og:image")) meta.ogImage = "[detected]";
  if (!meta.robots && hasDynamicMeta(head, "name", "robots")) meta.robots = "[detected]";

  // JSON-LD
  if (/application\/ld\+json/.test(head)) {
    meta.structuredData = [{ "@context": "https://schema.org", "@type": "detected" }];
  }

  return meta;
}

/** Extract a meta tag value, handling both attribute orders */
function extractMetaTag(html: string, attr: "name" | "property", name: string): string | null {
  const r1 = new RegExp(`<meta\\s[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']+)["']`);
  const m1 = html.match(r1);
  if (m1) return m1[1];
  const r2 = new RegExp(`<meta\\s[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${name}["']`);
  const m2 = html.match(r2);
  if (m2) return m2[1];
  return null;
}

/** Check if a meta tag has a dynamic {value} for the given attr/name combo */
function hasDynamicMeta(html: string, attr: "name" | "property", name: string): boolean {
  // content={var} with name/property before or after
  const r1 = new RegExp(`<meta\\s[^>]*${attr}=["']${name}["'][^>]*content=\\{`);
  const r2 = new RegExp(`<meta\\s[^>]*content=\\{[^}]*\\}[^>]*${attr}=["']${name}["']`);
  return r1.test(html) || r2.test(html);
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
