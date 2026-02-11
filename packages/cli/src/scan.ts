import type { Framework } from "./detect.js";
import type { PageInfo } from "./scanner.js";
import { scanPages } from "./scanner.js";
import { scanNuxtPages } from "./scanner-nuxt.js";
import { scanRemixPages } from "./scanner-remix.js";
import { scanAstroPages } from "./scanner-astro.js";
import { scanSvelteKitPages } from "./scanner-sveltekit.js";

/**
 * Dispatch to the correct scanner based on detected framework.
 * All scanners return the same PageInfo[] interface.
 */
export async function scanProject(
  framework: Framework,
  projectRoot: string,
  appDir: string,
): Promise<PageInfo[]> {
  switch (framework) {
    case "nextjs":
      return scanPages(projectRoot, appDir);
    case "nuxt":
      return scanNuxtPages(projectRoot, appDir);
    case "remix":
      return scanRemixPages(projectRoot, appDir);
    case "astro":
      return scanAstroPages(projectRoot, appDir);
    case "sveltekit":
      return scanSvelteKitPages(projectRoot, appDir);
    default:
      return [];
  }
}
