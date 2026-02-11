import { readFile } from "node:fs/promises";
import { join, dirname, sep } from "node:path";
import { glob } from "glob";
import type { ResolvedMetadata } from "indxel";
import type { PageInfo } from "./scanner.js";

/**
 * Scan an Astro project's src/pages/ directory for SEO metadata.
 * Looks for <head> content in .astro files and frontmatter SEO props.
 */
export async function scanAstroPages(
  projectRoot: string,
  appDir: string,
): Promise<PageInfo[]> {
  const appDirFull = join(projectRoot, appDir);

  // Astro pages: .astro, .md, .mdx files in src/pages/
  const pageFiles = await glob("**/*.{astro,md,mdx}", {
    cwd: appDirFull,
    ignore: ["**/node_modules/**", "**/_*/**", "**/components/**"],
  });

  const pages: PageInfo[] = [];

  for (const file of pageFiles) {
    const fullPath = join(appDirFull, file);
    const content = await readFile(fullPath, "utf-8");
    const route = astroFilePathToRoute(file);

    const page: PageInfo = {
      filePath: join(appDir, file),
      route,
      hasMetadata: false,
      hasDynamicMetadata: false,
      isClientComponent: false,
      titleIsAbsolute: false,
      extractedMetadata: createEmptyMetadata(),
    };

    if (file.endsWith(".md") || file.endsWith(".mdx")) {
      // Markdown/MDX: extract frontmatter
      page.extractedMetadata = extractMarkdownMeta(content);
      page.hasMetadata = page.extractedMetadata.title !== null || page.extractedMetadata.description !== null;
    } else {
      // .astro file: check for <head> tags or SEO component usage
      page.extractedMetadata = extractAstroMeta(content);
      page.hasMetadata = hasAstroSeoSetup(content);

      // Dynamic if using Astro.props or getStaticPaths with spread
      page.hasDynamicMetadata = /Astro\.props/.test(content) || /getStaticPaths/.test(content);
    }

    // JSON-LD detection
    if (/application\/ld\+json/.test(content)) {
      page.extractedMetadata.structuredData = [{ "@context": "https://schema.org", "@type": "detected" }];
    }

    pages.push(page);
  }

  // Check for Layout components that accept SEO props (the most common Astro pattern).
  // If a layout has <title>{Astro.props.title}</title>, and a page uses that layout,
  // check if the page passes title/description as props via the layout component.
  const layoutFiles = await glob("**/layouts/**/*.astro", {
    cwd: join(projectRoot, "src"),
    ignore: ["**/node_modules/**"],
  });

  const layoutNames = new Set<string>();
  for (const file of layoutFiles) {
    try {
      const content = await readFile(join(projectRoot, "src", file), "utf-8");
      // If the layout has any SEO setup (even via props), record it
      if (hasAstroSeoSetup(content) || /Astro\.props/.test(content)) {
        // Extract layout component name from filename (e.g., "layouts/Layout.astro" → "Layout")
        const name = file.replace(/.*\//, "").replace(/\.astro$/, "");
        layoutNames.add(name);

        const layoutMeta = extractAstroMeta(content);
        // Only merge static values (not [detected] from props) as fallback
        const staticLayoutMeta = { ...layoutMeta };
        if (staticLayoutMeta.title === "[detected]") staticLayoutMeta.title = null;
        if (staticLayoutMeta.description === "[detected]") staticLayoutMeta.description = null;

        for (const page of pages) {
          mergeMetadata(page.extractedMetadata, staticLayoutMeta as ResolvedMetadata);
        }
      }
    } catch {
      // Skip unreadable layouts
    }
  }

  // Now check if pages pass SEO props to known layout components.
  // Pattern: <Layout title="Page Title" description="Page desc" />
  if (layoutNames.size > 0) {
    const layoutPattern = new RegExp(
      `<(?:${[...layoutNames].join("|")})\\s([^>]*)`,
      "g",
    );

    for (const page of pages) {
      const fullPath = join(appDirFull, page.filePath.replace(appDir + "/", ""));
      try {
        const content = await readFile(fullPath, "utf-8");
        const matches = content.matchAll(layoutPattern);
        for (const m of matches) {
          const attrs = m[1];
          if (!page.extractedMetadata.title) {
            const titleProp = attrs.match(/title=["']([^"']+)["']/);
            if (titleProp) page.extractedMetadata.title = titleProp[1];
            else if (/title=\{/.test(attrs)) page.extractedMetadata.title = "[detected]";
          }
          if (!page.extractedMetadata.description) {
            const descProp = attrs.match(/description=["']([^"']+)["']/);
            if (descProp) page.extractedMetadata.description = descProp[1];
            else if (/description=\{/.test(attrs)) page.extractedMetadata.description = "[detected]";
          }
          if (page.extractedMetadata.title || page.extractedMetadata.description) {
            page.hasMetadata = true;
          }
        }
      } catch {
        // Skip unreadable pages
      }
    }
  }

  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

/** Convert Astro page path to route (e.g., "blog/[slug].astro" → "/blog/[slug]") */
function astroFilePathToRoute(filePath: string): string {
  let route = filePath
    .replace(/\.(astro|md|mdx)$/, "")
    .replace(/\/index$/, "")
    .replace(/^index$/, "");

  route = "/" + route.split(sep).join("/");
  // [...slug] → Astro catch-all
  return route || "/";
}

/** Check if .astro file has any SEO-specific setup (not just <meta charset>) */
function hasAstroSeoSetup(source: string): boolean {
  // Match only SEO-relevant meta tags, not charset/viewport/etc.
  const hasSeoMeta =
    /<meta\s[^>]*name=["']description["']/.test(source) ||
    /<meta\s[^>]*property=["']og:/.test(source) ||
    /<meta\s[^>]*name=["']robots["']/.test(source) ||
    /<meta\s[^>]*name=["']twitter:/.test(source) ||
    /<meta\s[^>]*content=["'][^"']*["'][^>]*name=["']description["']/.test(source) ||
    /<meta\s[^>]*content=["'][^"']*["'][^>]*property=["']og:/.test(source);

  return (
    /<title[\s>]/.test(source) ||
    hasSeoMeta ||
    /<SEO[\s/>]/.test(source) ||         // Common Astro SEO component
    /<BaseHead[\s/>]/.test(source) ||     // Common Astro pattern
    /@astrojs\/seo/.test(source) ||
    /astro-seo/.test(source) ||
    /Astro\.props\.title/.test(source)
  );
}

/**
 * Extract a meta tag value, handling both attribute orders:
 *   <meta name="description" content="...">
 *   <meta content="..." name="description">
 */
function extractMetaTag(source: string, attr: "name" | "property", name: string): string | null {
  // Order 1: name/property first, content second
  const r1 = new RegExp(`<meta\\s[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']+)["']`, "i");
  const m1 = source.match(r1);
  if (m1) return m1[1];
  // Order 2: content first, name/property second
  const r2 = new RegExp(`<meta\\s[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${name}["']`, "i");
  const m2 = source.match(r2);
  if (m2) return m2[1];
  return null;
}

/** Check if a meta tag exists with a dynamic value ({variable}) */
function hasMetaTagDynamic(source: string, attr: "name" | "property", name: string): boolean {
  const r1 = new RegExp(`<meta\\s[^>]*${attr}=["']${name}["'][^>]*content=\\{`);
  const r2 = new RegExp(`<meta\\s[^>]*content=\\{[^}]*\\}[^>]*${attr}=["']${name}["']`);
  return r1.test(source) || r2.test(source);
}

/** Extract metadata from .astro files (frontmatter + <head> content) */
function extractAstroMeta(source: string): ResolvedMetadata {
  const meta = createEmptyMetadata();

  // Extract from <title> tag
  const titleTagMatch = source.match(/<title[^>]*>([^<{]+)<\/title>/);
  if (titleTagMatch) meta.title = titleTagMatch[1].trim();

  // Extract from <meta> tags (handles both attribute orders)
  meta.description = extractMetaTag(source, "name", "description");
  meta.ogTitle = extractMetaTag(source, "property", "og:title");
  meta.ogDescription = extractMetaTag(source, "property", "og:description");
  meta.ogImage = extractMetaTag(source, "property", "og:image");
  meta.robots = extractMetaTag(source, "name", "robots");

  // <link rel="canonical">
  const canonicalMatch = source.match(/<link\s[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/)
    || source.match(/<link\s[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/);
  if (canonicalMatch) meta.canonical = canonicalMatch[1];

  // Detect dynamic title: <title>{title}</title> or <title>{Astro.props.title}</title>
  if (!meta.title) {
    const titleContent = source.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "";
    if (/\{/.test(titleContent)) meta.title = "[detected]";
  }

  // Detect dynamic meta tags → [detected]
  if (!meta.description && hasMetaTagDynamic(source, "name", "description")) meta.description = "[detected]";
  if (!meta.ogTitle && hasMetaTagDynamic(source, "property", "og:title")) meta.ogTitle = "[detected]";
  if (!meta.ogDescription && hasMetaTagDynamic(source, "property", "og:description")) meta.ogDescription = "[detected]";
  if (!meta.ogImage && hasMetaTagDynamic(source, "property", "og:image")) meta.ogImage = "[detected]";

  // Check for SEO component usage: <SEO title="..." />, <BaseHead title="..." />
  if (!meta.title) {
    const seoComponentMatch = source.match(/<(?:SEO|BaseHead|Head)\s[^>]*title=["']([^"']+)["']/);
    if (seoComponentMatch) meta.title = seoComponentMatch[1];
  }
  if (!meta.title) {
    // Dynamic SEO component: <SEO title={title} />
    if (/<(?:SEO|BaseHead|Head)\s[^>]*title=\{/.test(source)) meta.title = "[detected]";
  }
  if (!meta.description) {
    const seoDescMatch = source.match(/<(?:SEO|BaseHead|Head)\s[^>]*description=["']([^"']+)["']/);
    if (seoDescMatch) meta.description = seoDescMatch[1];
    else if (/<(?:SEO|BaseHead|Head)\s[^>]*description=\{/.test(source)) meta.description = "[detected]";
  }

  // JSON-LD
  if (/application\/ld\+json/.test(source)) {
    meta.structuredData = [{ "@context": "https://schema.org", "@type": "detected" }];
  }

  return meta;
}

/** Extract metadata from Markdown/MDX frontmatter */
function extractMarkdownMeta(source: string): ResolvedMetadata {
  const meta = createEmptyMetadata();

  // Extract YAML frontmatter between ---
  const fmMatch = source.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return meta;

  const fm = fmMatch[1];

  const titleMatch = fm.match(/^title\s*:\s*["']?(.+?)["']?\s*$/m);
  if (titleMatch) meta.title = titleMatch[1];

  const descMatch = fm.match(/^description\s*:\s*["']?(.+?)["']?\s*$/m);
  if (descMatch) meta.description = descMatch[1];

  const ogImageMatch = fm.match(/^(?:ogImage|image|og_image)\s*:\s*["']?(.+?)["']?\s*$/m);
  if (ogImageMatch) meta.ogImage = ogImageMatch[1];

  return meta;
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
