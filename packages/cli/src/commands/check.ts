import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { validateMetadata } from "indxel";
import { detectProject, frameworkLabel } from "../detect.js";
import { scanProject } from "../scan.js";
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
import { saveCheckResult, loadPreviousCheck, resolveApiKey } from "../store.js";
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
  .option("--push", "Push results to Indxel dashboard", false)
  .option("--api-key <key>", "API key for --push (or set INDXEL_API_KEY env var)")
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

    if (project.framework === "unknown") {
      spinner.fail("No supported framework detected");
      if (!jsonOutput) {
        console.log(chalk.dim("  Supported: Next.js, Nuxt, Remix, Astro, SvelteKit."));
        console.log(chalk.dim("  For any live site, use: npx indxel crawl <url>"));
      }
      process.exit(1);
    }

    if (!project.usesAppRouter) {
      spinner.fail(`No pages directory detected for ${frameworkLabel(project.framework)}`);
      if (!jsonOutput) {
        const hints: Record<string, string> = {
          nextjs: "indxel requires Next.js App Router (src/app or app directory).",
          nuxt: "indxel requires a pages/ directory for Nuxt.",
          remix: "indxel requires an app/routes/ directory for Remix.",
          astro: "indxel requires a src/pages/ directory for Astro.",
          sveltekit: "indxel requires a src/routes/ directory for SvelteKit.",
          unknown: "",
        };
        console.log(chalk.dim(`  ${hints[project.framework]}`));
      }
      process.exit(1);
    }

    const label = frameworkLabel(project.framework);
    const version = project.frameworkVersion ? ` ${project.frameworkVersion}` : "";
    spinner.succeed(`Detected ${label}${version}`);

    // 2. Scan pages
    const scanSpinner = ora("Scanning pages...").start();
    const allPages = await scanProject(project.framework, cwd, project.appDir);

    if (allPages.length === 0) {
      scanSpinner.fail("No pages found");
      if (!jsonOutput) {
        console.log(chalk.dim(`  No page files found in ${project.appDir}/`));
      }
      process.exit(1);
    }

    // Filter out ignored routes
    const ignoreRoutes = config.ignoreRoutes ?? [];
    const pages = ignoreRoutes.length > 0
      ? allPages.filter((p) => !ignoreRoutes.some((pattern) => matchRoute(p.route, pattern)))
      : allPages;
    const ignoredCount = allPages.length - pages.length;

    scanSpinner.succeed(`Found ${allPages.length} page${allPages.length > 1 ? "s" : ""}${ignoredCount > 0 ? ` (${ignoredCount} ignored)` : ""}`);

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

    // 10. Push to dashboard
    if (opts.push) {
      const apiKey = await resolveApiKey(opts.apiKey);
      if (!apiKey) {
        if (!jsonOutput) {
          console.log(chalk.yellow("  ⚠") + " To push results to your dashboard, link your project first:");
          console.log("");
          console.log(chalk.bold("    npx indxel link"));
          console.log("");
          console.log(chalk.dim("  Or use --api-key / set INDXEL_API_KEY."));
          console.log("");
        }
      } else {
        const pushSpinner = jsonOutput ? null : ora("Pushing results to Indxel...").start();
        try {
          const pushUrl = process.env.INDXEL_API_URL || "https://indxel.com";
          const res = await fetch(`${pushUrl}/api/cli/push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              type: "check",
              check: {
                score: summary.averageScore,
                grade: summary.grade,
                totalPages: summary.totalPages,
                passedPages: summary.passedPages,
                criticalErrors: summary.criticalErrors,
                optionalErrors: summary.optionalErrors,
                pages: summary.results.map((r) => ({
                  route: r.page.route,
                  score: r.validation.score,
                  errors: r.validation.errors.length,
                  warnings: r.validation.warnings.length,
                })),
              },
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { checkId?: string; usage?: { used: number; limit: number } };
            if (pushSpinner) pushSpinner.succeed(`Pushed to dashboard — check ${data.checkId}`);
            if (data.usage && !jsonOutput) {
              const pct = Math.round((data.usage.used / data.usage.limit) * 100);
              const usageColor = pct >= 80 ? chalk.yellow : chalk.dim;
              console.log(usageColor(`  Usage: ${data.usage.used}/${data.usage.limit} checks this month (${pct}%)`));
            }
          } else {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            if (pushSpinner) pushSpinner.fail(`Push failed: ${data.error || res.statusText}`);
          }
        } catch (err) {
          if (pushSpinner) pushSpinner.fail(`Push failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!jsonOutput) console.log("");
      }
    }

    // 11. Nudge toward continuous monitoring (interactive mode only, not CI)
    if (!jsonOutput && !isCI) {
      if (!opts.push) {
        console.log(chalk.dim("  Save to dashboard   → ") + chalk.bold("npx indxel check --push"));
      }
      console.log(chalk.dim("  Guard deploys       → ") + chalk.bold("npx indxel init --hook"));
      console.log("");
    }

    // 11. Exit code
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
