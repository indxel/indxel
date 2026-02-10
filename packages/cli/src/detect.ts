import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ProjectInfo {
  /** Root directory of the project */
  root: string;
  /** Whether this is a Next.js project */
  isNextJs: boolean;
  /** Next.js version if detected */
  nextVersion?: string;
  /** Whether it uses App Router (has src/app or app directory) */
  usesAppRouter: boolean;
  /** The app directory path (relative) */
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
    isNextJs: false,
    usesAppRouter: false,
    appDir: "app",
    isTypeScript: false,
    hasSeoConfig: false,
    hasSitemap: false,
    hasRobots: false,
  };

  // Check for Next.js config files
  const nextConfigs = [
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "next.config.cjs",
  ];
  info.isNextJs = nextConfigs.some((f) => existsSync(join(cwd, f)));

  // Read Next.js version from package.json
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      const nextDep = pkg.dependencies?.next ?? pkg.devDependencies?.next;
      if (nextDep) {
        info.isNextJs = true;
        info.nextVersion = nextDep.replace(/[\^~>=<]/g, "").trim();
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for TypeScript
  info.isTypeScript =
    existsSync(join(cwd, "tsconfig.json")) ||
    existsSync(join(cwd, "tsconfig.ts"));

  // Detect App Router directory
  if (existsSync(join(cwd, "src", "app"))) {
    info.usesAppRouter = true;
    info.appDir = "src/app";
  } else if (existsSync(join(cwd, "app"))) {
    info.usesAppRouter = true;
    info.appDir = "app";
  }

  // Check for existing SEO files (check both .ts and .js regardless of project type)
  info.hasSeoConfig =
    existsSync(join(cwd, "seo.config.ts")) ||
    existsSync(join(cwd, "seo.config.js"));

  info.hasSitemap =
    existsSync(join(cwd, info.appDir, "sitemap.ts")) ||
    existsSync(join(cwd, info.appDir, "sitemap.js")) ||
    existsSync(join(cwd, info.appDir, "sitemap.xml"));

  info.hasRobots =
    existsSync(join(cwd, info.appDir, "robots.ts")) ||
    existsSync(join(cwd, info.appDir, "robots.js")) ||
    existsSync(join(cwd, info.appDir, "robots.txt"));

  return info;
}
