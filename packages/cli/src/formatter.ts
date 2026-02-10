import chalk from "chalk";
import type { ValidationResult } from "indxel";
import type { PageInfo } from "./scanner.js";

export interface CheckResult {
  page: PageInfo;
  validation: ValidationResult;
}

export interface CheckSummary {
  results: CheckResult[];
  totalPages: number;
  passedPages: number;
  averageScore: number;
  grade: string;
  /** Errors from critical-severity rules (blocks CI) */
  criticalErrors: number;
  /** Errors from optional-severity rules (score only) */
  optionalErrors: number;
  /** Pages with generateMetadata() skipped from static analysis */
  skippedDynamic: number;
}

/** Format a single page check result for terminal output */
export function formatPageResult(result: CheckResult): string {
  const { page, validation } = result;
  const lines: string[] = [];

  const scoreColor = getScoreColor(validation.score);
  const icon = validation.errors.length > 0 ? chalk.red("x") : chalk.green("✓");

  lines.push(
    `  ${icon} ${chalk.bold(page.route)}  ${scoreColor(`${validation.score}/100`)}`,
  );

  // Show errors
  for (const error of validation.errors) {
    lines.push(`    ${chalk.red("x")} ${error.message ?? error.name}`);
  }

  // Show warnings (only if there are also errors, to reduce noise)
  if (validation.errors.length > 0) {
    for (const warning of validation.warnings) {
      lines.push(`    ${chalk.yellow("!")} ${warning.message ?? warning.name}`);
    }
  }

  return lines.join("\n");
}

/** Format the complete check summary for terminal output */
export function formatSummary(summary: CheckSummary): string {
  const lines: string[] = [];
  const { totalPages, passedPages, averageScore, criticalErrors } = summary;

  lines.push("");
  lines.push(chalk.dim("  ─────────────────────────────────────"));
  lines.push("");

  // Overall score
  const scoreColor = getScoreColor(averageScore);
  lines.push(
    `  Score: ${scoreColor(chalk.bold(`${averageScore}/100`))} (${summary.grade})`,
  );

  // Pages summary
  const pagesColor = passedPages === totalPages ? chalk.green : chalk.yellow;
  lines.push(
    `  Pages: ${pagesColor(`${passedPages}/${totalPages}`)} pass SEO validation`,
  );

  // Error count
  if (criticalErrors > 0) {
    lines.push("");
    lines.push(
      chalk.red(`  ${criticalErrors} critical issue${criticalErrors > 1 ? "s" : ""}. Fix before deploying.`),
    );
    if (summary.optionalErrors > 0) {
      lines.push(
        chalk.yellow(`  ${summary.optionalErrors} optional issue${summary.optionalErrors > 1 ? "s" : ""} (won't block CI).`),
      );
    }
  } else if (summary.optionalErrors > 0) {
    lines.push("");
    lines.push(chalk.yellow(`  ${summary.optionalErrors} optional issue${summary.optionalErrors > 1 ? "s" : ""} (won't block CI).`));
  } else {
    lines.push("");
    lines.push(chalk.green("  All pages pass. Ship it."));
  }

  // Dynamic pages hint
  if (summary.skippedDynamic > 0) {
    lines.push("");
    lines.push(
      chalk.cyan(
        `  ${summary.skippedDynamic} dynamic page${summary.skippedDynamic > 1 ? "s" : ""} skipped (generateMetadata).`,
      ),
    );
    lines.push(chalk.dim("  Run `indxel crawl <url>` for accurate scores on dynamic pages."));
  }

  lines.push("");
  return lines.join("\n");
}

/** Format results for --json output */
export function formatJSON(summary: CheckSummary): string {
  return JSON.stringify(
    {
      score: summary.averageScore,
      grade: summary.grade,
      totalPages: summary.totalPages,
      passedPages: summary.passedPages,
      criticalErrors: summary.criticalErrors,
      optionalErrors: summary.optionalErrors,
      skippedDynamic: summary.skippedDynamic,
      pages: summary.results.map((r) => ({
        route: r.page.route,
        file: r.page.filePath,
        score: r.validation.score,
        grade: r.validation.grade,
        errors: r.validation.errors.map((e) => ({
          id: e.id,
          message: e.message,
        })),
        warnings: r.validation.warnings.map((w) => ({
          id: w.id,
          message: w.message,
        })),
      })),
    },
    null,
    2,
  );
}

/** Format a diff between two check runs */
export function formatDiff(
  current: CheckSummary,
  previous: CheckSummary,
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(chalk.bold("  SEO Diff:"));
  lines.push("");

  const scoreDelta = current.averageScore - previous.averageScore;
  const scoreArrow = scoreDelta > 0 ? chalk.green(`+${scoreDelta}`) : scoreDelta < 0 ? chalk.red(`${scoreDelta}`) : chalk.dim("0");
  lines.push(
    `  Score: ${previous.averageScore} -> ${current.averageScore} (${scoreArrow})`,
  );
  lines.push("");

  // Build route maps
  const prevMap = new Map(previous.results.map((r) => [r.page.route, r]));
  const currMap = new Map(current.results.map((r) => [r.page.route, r]));

  // Regressions
  const regressions: string[] = [];
  for (const [route, curr] of currMap) {
    const prev = prevMap.get(route);
    if (!prev) continue;
    if (curr.validation.score < prev.validation.score) {
      regressions.push(
        `    ${chalk.red("-")} ${route}  ${prev.validation.score} -> ${curr.validation.score}`,
      );
    }
  }

  // Improvements
  const improvements: string[] = [];
  for (const [route, curr] of currMap) {
    const prev = prevMap.get(route);
    if (!prev) continue;
    if (curr.validation.score > prev.validation.score) {
      improvements.push(
        `    ${chalk.green("+")} ${route}  ${prev.validation.score} -> ${curr.validation.score}`,
      );
    }
  }

  // New pages
  const newPages: string[] = [];
  for (const route of currMap.keys()) {
    if (!prevMap.has(route)) {
      newPages.push(`    ${chalk.blue("+")} ${route}  ${chalk.dim("[new]")}`);
    }
  }

  // Removed pages
  const removed: string[] = [];
  for (const route of prevMap.keys()) {
    if (!currMap.has(route)) {
      removed.push(`    ${chalk.dim("-")} ${route}  ${chalk.dim("[removed]")}`);
    }
  }

  if (regressions.length > 0) {
    lines.push(chalk.red(`  REGRESSIONS (${regressions.length}):`));
    lines.push(...regressions);
    lines.push("");
  }

  if (improvements.length > 0) {
    lines.push(chalk.green(`  IMPROVEMENTS (${improvements.length}):`));
    lines.push(...improvements);
    lines.push("");
  }

  if (newPages.length > 0) {
    lines.push(chalk.blue(`  NEW PAGES (${newPages.length}):`));
    lines.push(...newPages);
    lines.push("");
  }

  if (removed.length > 0) {
    lines.push(chalk.dim(`  REMOVED (${removed.length}):`));
    lines.push(...removed);
    lines.push("");
  }

  if (regressions.length === 0 && improvements.length === 0 && newPages.length === 0 && removed.length === 0) {
    lines.push(chalk.dim("  No changes detected."));
    lines.push("");
  }

  return lines.join("\n");
}

/** Format a dynamic page that was skipped from static analysis */
export function formatSkippedPage(page: import("./scanner.js").PageInfo): string {
  return `  ${chalk.cyan("~")} ${chalk.bold(page.route)}  ${chalk.dim("skipped — generateMetadata()")}`;
}

/** Color a score value based on its range */
function getScoreColor(score: number): (text: string) => string {
  if (score >= 90) return chalk.green;
  if (score >= 70) return chalk.yellow;
  return chalk.red;
}

/** Compute summary from results */
export function computeSummary(results: CheckResult[], skippedDynamic = 0): CheckSummary {
  const totalPages = results.length + skippedDynamic;
  const passedPages = results.filter((r) => r.validation.errors.length === 0).length;
  const averageScore =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.validation.score, 0) / results.length)
      : 0;

  let criticalErrors = 0;
  let optionalErrors = 0;
  for (const r of results) {
    for (const e of r.validation.errors) {
      if (e.severity === "critical") criticalErrors++;
      else optionalErrors++;
    }
  }

  let grade: string;
  if (averageScore >= 90) grade = "A";
  else if (averageScore >= 80) grade = "B";
  else if (averageScore >= 70) grade = "C";
  else if (averageScore >= 60) grade = "D";
  else grade = "F";

  return { results, totalPages, passedPages, averageScore, grade, criticalErrors, optionalErrors, skippedDynamic };
}
