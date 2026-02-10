import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { validateMetadata } from "indxel";
import { detectProject } from "../detect.js";
import { scanPages } from "../scanner.js";
import { loadConfig } from "../config.js";
import {
  formatPageResult,
  formatSkippedPage,
  formatSummary,
  formatJSON,
  formatDiff,
  computeSummary,
  type CheckResult,
} from "../formatter.js";
import { saveCheckResult, loadPreviousCheck } from "../store.js";
import { generateFixSuggestions } from "../fixer.js";

export const checkCommand = new Command("check")
  .description("Audit SEO metadata for all pages in your project")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--ci", "CI/CD mode — strict, exit 1 on any error", false)
  .option("--diff", "Compare with previous check run", false)
  .option("--json", "Output results as JSON", false)
  .option("--strict", "Treat warnings as errors", false)
  .option("--min-score <score>", "Minimum score to pass (0-100, default: exit on any error)")
  .option("--fix", "Show suggested metadata code to fix errors", false)
  .action(async (opts) => {
    const cwd = opts.cwd;
    const isCI = opts.ci;
    const isStrict = opts.strict || isCI;
    const showDiff = opts.diff;
    const jsonOutput = opts.json;
    const showFix = opts.fix;

    // Load config file (.indxelrc.json, etc.)
    const config = await loadConfig(cwd);

    // --min-score flag overrides config, config overrides default
    const minScore = opts.minScore
      ? parseInt(opts.minScore, 10)
      : config.minScore ?? null;

    // 1. Detect project
    const spinner = ora("Detecting project...").start();
    const project = await detectProject(cwd);

    if (!project.isNextJs) {
      spinner.fail("Not a Next.js project");
      if (!jsonOutput) {
        console.log(chalk.dim("  Run this command from a Next.js project root."));
      }
      process.exit(1);
    }

    if (!project.usesAppRouter) {
      spinner.fail("App Router not detected");
      if (!jsonOutput) {
        console.log(chalk.dim("  indxel requires Next.js App Router (src/app or app directory)."));
      }
      process.exit(1);
    }

    // 2. Scan pages
    spinner.text = "Scanning pages...";
    const allPages = await scanPages(cwd, project.appDir);

    if (allPages.length === 0) {
      spinner.fail("No pages found");
      if (!jsonOutput) {
        console.log(chalk.dim(`  No page.tsx/ts files found in ${project.appDir}/`));
      }
      process.exit(1);
    }

    // Filter out ignored routes
    const ignoreRoutes = config.ignoreRoutes ?? [];
    const pages = ignoreRoutes.length > 0
      ? allPages.filter((p) => !ignoreRoutes.some((pattern) => matchRoute(p.route, pattern)))
      : allPages;
    const ignoredCount = allPages.length - pages.length;

    spinner.succeed(`Found ${allPages.length} page${allPages.length > 1 ? "s" : ""}${ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ""}`);

    // 3. Separate static vs dynamic pages
    const staticPages = pages.filter((p) => !p.hasDynamicMetadata);
    const dynamicPages = pages.filter((p) => p.hasDynamicMetadata);

    if (!jsonOutput) {
      console.log("");
      console.log(chalk.bold(`  Checking ${staticPages.length} page${staticPages.length !== 1 ? "s" : ""}...`));
      if (dynamicPages.length > 0) {
        console.log(chalk.dim(`  (${dynamicPages.length} dynamic page${dynamicPages.length !== 1 ? "s" : ""} skipped)`));
      }
      if (ignoredCount > 0) {
        console.log(chalk.dim(`  (${ignoredCount} page${ignoredCount !== 1 ? "s" : ""} excluded by ignoreRoutes)`));
      }
      console.log("");
    }

    // 4. Validate static pages only
    const results: CheckResult[] = [];

    for (const page of staticPages) {
      const validation = validateMetadata(page.extractedMetadata, {
        strict: isStrict,
        disabledRules: config.disabledRules,
      });

      const result: CheckResult = { page, validation };
      results.push(result);

      if (!jsonOutput) {
        console.log(formatPageResult(result));
      }
    }

    // Show skipped dynamic pages
    if (!jsonOutput && dynamicPages.length > 0) {
      console.log("");
      for (const page of dynamicPages) {
        console.log(formatSkippedPage(page));
      }
    }

    // 5. Compute summary (score only counts static pages)
    const summary = computeSummary(results, dynamicPages.length);

    // 6. Save results for future diff
    await saveCheckResult(cwd, summary);

    // 7. Show diff if requested
    if (showDiff && !jsonOutput) {
      const previous = await loadPreviousCheck(cwd);
      if (previous) {
        console.log(formatDiff(summary, previous.summary));
      } else {
        console.log(chalk.dim("\n  No previous check found. Run again to see a diff.\n"));
      }
    }

    // 8. Output
    if (jsonOutput) {
      console.log(formatJSON(summary));
    } else {
      console.log(formatSummary(summary));
    }

    // 9. Show fix suggestions if requested
    if (showFix && !jsonOutput) {
      const fixes = generateFixSuggestions(results, config.baseUrl);
      if (fixes.length > 0) {
        console.log(chalk.bold("  Suggested fixes:\n"));
        for (const fix of fixes) {
          console.log(fix);
        }
      }
    }

    // 10. Exit code
    if (minScore !== null) {
      // --min-score mode: fail only if score is below threshold
      if (summary.averageScore < minScore) {
        if (!jsonOutput) {
          console.log(
            chalk.red(`  Score ${summary.averageScore} is below minimum ${minScore}.`),
          );
        }
        process.exit(1);
      }
    } else if (summary.criticalErrors > 0) {
      // Default mode: fail on any error
      process.exit(1);
    }
  });

/** Match a route against a pattern with simple glob support.
 *  Supports trailing /* for prefix matching (e.g., "/dashboard/*" matches "/dashboard/settings"). */
function matchRoute(route: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return route === prefix || route.startsWith(prefix + "/");
  }
  return route === pattern;
}
