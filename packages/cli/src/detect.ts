import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type Framework = "nextjs" | "nuxt" | "remix" | "astro" | "sveltekit" | "unknown";

export interface ProjectInfo {
  /** Root directory of the project */
  root: string;
  /** Detected framework */
  framework: Framework;
  /** Framework version if detected */
  frameworkVersion?: string;
  /** Whether this is a Next.js project */
  isNextJs: boolean;
  /** Next.js version if detected */
  nextVersion?: string;
  /** Whether it uses App Router (has src/app or app directory) */
  usesAppRouter: boolean;
  /** The app directory path (relative) — framework-specific pages/routes directory */
  appDir: string;
  /** Whether TypeScript is used */
  isTypeScript: boolean;
  /** Whether seo.config.ts/js already exists */
  hasSeoConfig: boolean;
  /** Whether sitemap.ts/js exists */
  hasSitemap: boolean;
  /** Whether robots.ts/js exists */
  hasRobots: boolean;
}

/** Detect project type and configuration from the given directory. */
export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const info: ProjectInfo = {
    root: cwd,
    framework: "unknown",
    isNextJs: false,
    usesAppRouter: false,
    appDir: "app",
    isTypeScript: false,
    hasSeoConfig: false,
    hasSitemap: false,
    hasRobots: false,
  };

  // Check for TypeScript
  info.isTypeScript =
    existsSync(join(cwd, "tsconfig.json")) ||
    existsSync(join(cwd, "tsconfig.ts"));

  // Read package.json once for all framework detection
  let pkg: Record<string, unknown> | null = null;
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    } catch {
      // Ignore parse errors
    }
  }

  const deps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  };

  // -- Next.js --
  const nextConfigs = [
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "next.config.cjs",
  ];
  info.isNextJs = nextConfigs.some((f) => existsSync(join(cwd, f)));

  if (deps.next) {
    info.isNextJs = true;
    info.nextVersion = deps.next.replace(/[\^~>=<]/g, "").trim();
  }

  if (info.isNextJs) {
    info.framework = "nextjs";
    info.frameworkVersion = info.nextVersion;

    // Detect App Router directory
    if (existsSync(join(cwd, "src", "app"))) {
      info.usesAppRouter = true;
      info.appDir = "src/app";
    } else if (existsSync(join(cwd, "app"))) {
      info.usesAppRouter = true;
      info.appDir = "app";
    }
  }

  // -- Nuxt 3 --
  if (!info.isNextJs) {
    const nuxtConfigs = ["nuxt.config.ts", "nuxt.config.js"];
    const hasNuxtConfig = nuxtConfigs.some((f) => existsSync(join(cwd, f)));
    if (hasNuxtConfig || deps.nuxt) {
      info.framework = "nuxt";
      info.frameworkVersion = deps.nuxt?.replace(/[\^~>=<]/g, "").trim();
      // Nuxt uses pages/ for file-based routing
      if (existsSync(join(cwd, "pages"))) {
        info.usesAppRouter = true;
        info.appDir = "pages";
      }
    }
  }

  // -- Remix --
  if (info.framework === "unknown") {
    const remixDep = deps["@remix-run/react"] ?? deps["@remix-run/node"] ?? deps["@remix-run/cloudflare"];
    const hasRemixConfig = existsSync(join(cwd, "remix.config.js")) || existsSync(join(cwd, "remix.config.ts"));
    if (hasRemixConfig || remixDep) {
      info.framework = "remix";
      info.frameworkVersion = remixDep?.replace(/[\^~>=<]/g, "").trim();
      // Remix uses app/routes/
      if (existsSync(join(cwd, "app", "routes"))) {
        info.usesAppRouter = true;
        info.appDir = "app/routes";
      } else if (existsSync(join(cwd, "app"))) {
        info.usesAppRouter = true;
        info.appDir = "app";
      }
    }
  }

  // -- Astro --
  if (info.framework === "unknown") {
    const astroConfigs = ["astro.config.mjs", "astro.config.ts", "astro.config.js"];
    const hasAstroConfig = astroConfigs.some((f) => existsSync(join(cwd, f)));
    if (hasAstroConfig || deps.astro) {
      info.framework = "astro";
      info.frameworkVersion = deps.astro?.replace(/[\^~>=<]/g, "").trim();
      // Astro uses src/pages/
      if (existsSync(join(cwd, "src", "pages"))) {
        info.usesAppRouter = true;
        info.appDir = "src/pages";
      }
    }
  }

  // -- SvelteKit --
  if (info.framework === "unknown") {
    const hasSvelteConfig = existsSync(join(cwd, "svelte.config.js")) || existsSync(join(cwd, "svelte.config.ts"));
    if ((hasSvelteConfig && deps["@sveltejs/kit"]) || deps["@sveltejs/kit"]) {
      info.framework = "sveltekit";
      info.frameworkVersion = deps["@sveltejs/kit"]?.replace(/[\^~>=<]/g, "").trim();
      // SvelteKit uses src/routes/
      if (existsSync(join(cwd, "src", "routes"))) {
        info.usesAppRouter = true;
        info.appDir = "src/routes";
      }
    }
  }

  // Check for existing SEO files (check both .ts and .js regardless of project type)
  info.hasSeoConfig =
    existsSync(join(cwd, "seo.config.ts")) ||
    existsSync(join(cwd, "seo.config.js"));

  // Sitemap/robots detection adapts to framework
  const sitemapDirs = info.framework === "nextjs" ? [info.appDir] : [info.appDir, "public", "."];
  const robotsDirs = info.framework === "nextjs" ? [info.appDir] : [info.appDir, "public", "."];

  info.hasSitemap = sitemapDirs.some((dir) =>
    existsSync(join(cwd, dir, "sitemap.ts")) ||
    existsSync(join(cwd, dir, "sitemap.js")) ||
    existsSync(join(cwd, dir, "sitemap.xml")),
  );

  info.hasRobots = robotsDirs.some((dir) =>
    existsSync(join(cwd, dir, "robots.ts")) ||
    existsSync(join(cwd, dir, "robots.js")) ||
    existsSync(join(cwd, dir, "robots.txt")),
  );

  return info;
}

/** Human-readable framework name */
export function frameworkLabel(fw: Framework): string {
  const labels: Record<Framework, string> = {
    nextjs: "Next.js",
    nuxt: "Nuxt",
    remix: "Remix",
    astro: "Astro",
    sveltekit: "SvelteKit",
    unknown: "Unknown",
  };
  return labels[fw];
}
