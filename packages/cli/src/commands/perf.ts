import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { fetchSitemap } from "indxel";
import { resolveProjectUrl } from "../config.js";
import { resolveApiKey } from "../store.js";

// --- Types ---

interface PsiDiagnostic {
  id: string;
  title: string;
  displayValue?: string;
  savingsMs?: number;
}

interface PsiMetrics {
  performanceScore: number;
  lcp: number;
  cls: number;
  inp: number;
  fcp: number;
  si: number;
  tbt: number;
  diagnostics: PsiDiagnostic[];
}

interface PageResult {
  url: string;
  strategy: string;
  metrics: PsiMetrics | null;
  error?: string;
}

// --- CWV thresholds (Google's) ---

const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
} as const;

// --- Helpers ---

function ratingFor(
  metric: "lcp" | "cls" | "inp",
  value: number,
): "good" | "needs-work" | "poor" {
  const t = THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-work";
  return "poor";
}

function colorForRating(rating: "good" | "needs-work" | "poor") {
  if (rating === "good") return chalk.green;
  if (rating === "needs-work") return chalk.yellow;
  return chalk.red;
}

function iconForRating(rating: "good" | "needs-work" | "poor") {
  if (rating === "good") return chalk.green("✓");
  if (rating === "needs-work") return chalk.yellow("⚠");
  return chalk.red("✗");
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatCls(value: number): string {
  return value.toFixed(2);
}

function scoreColor(score: number) {
  if (score >= 90) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- PSI API ---

/**
 * Fetch PSI metrics. Tries indxel backend first (uses our API key),
 * falls back to direct Google PSI API if no indxel API key.
 */
export async function fetchPsi(
  url: string,
  strategy: "mobile" | "desktop",
  apiKey?: string | null,
): Promise<PsiMetrics> {
  // 1. Try via indxel backend (proxied, no user API key needed for Google)
  if (apiKey) {
    const backendUrl = process.env.INDXEL_API_URL || "https://indxel.com";
    const res = await fetch(`${backendUrl}/api/cli/perf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url, strategy }),
      signal: AbortSignal.timeout(60000),
    });

    if (res.ok) {
      return await res.json() as PsiMetrics;
    }

    // If backend fails with auth error, don't fallback
    if (res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({ error: "Auth failed" })) as { error?: string };
      throw new Error(data.error || `Backend returned ${res.status}`);
    }
    // Other errors (502, etc.) → fallback to direct
  }

  // 2. Fallback: direct Google PSI API
  return fetchPsiDirect(url, strategy);
}

/** Direct call to Google PSI API (rate-limited by IP or user's own key) */
export async function fetchPsiDirect(
  url: string,
  strategy: "mobile" | "desktop",
): Promise<PsiMetrics> {
  const params = new URLSearchParams({
    url,
    strategy,
    category: "performance",
  });

  const apiKey = process.env.PSI_API_KEY;
  if (apiKey) params.set("key", apiKey);

  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
    { signal: AbortSignal.timeout(60000) },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PSI API returned HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return parsePsiResponse(data);
}

export function parsePsiResponse(data: any): PsiMetrics {
  const lr = data.lighthouseResult;
  if (!lr) throw new Error("No lighthouseResult in PSI response");

  const perfScore = lr.categories?.performance?.score;
  if (perfScore == null) throw new Error("No performance score in PSI response");

  // Extract opportunities & diagnostics
  const diagnostics: PsiDiagnostic[] = [];
  const auditRefs: Array<{ id: string; group?: string }> =
    lr.categories?.performance?.auditRefs ?? [];
  const metricIds = new Set([
    "largest-contentful-paint", "cumulative-layout-shift", "interaction-to-next-paint",
    "first-contentful-paint", "speed-index", "total-blocking-time",
  ]);

  for (const ref of auditRefs) {
    if (metricIds.has(ref.id)) continue;
    if (ref.group !== "diagnostics" && ref.group !== "load-opportunities" && ref.group !== "budgets") continue;
    const audit = lr.audits?.[ref.id];
    if (!audit || audit.score === 1 || audit.scoreDisplayMode === "notApplicable") continue;

    diagnostics.push({
      id: ref.id,
      title: audit.title ?? ref.id,
      displayValue: audit.displayValue || undefined,
      savingsMs: audit.details?.overallSavingsMs as number | undefined,
    });
  }

  diagnostics.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0));

  return {
    performanceScore: Math.round(perfScore * 100),
    lcp: lr.audits?.["largest-contentful-paint"]?.numericValue ?? 0,
    cls: lr.audits?.["cumulative-layout-shift"]?.numericValue ?? 0,
    inp: lr.audits?.["interaction-to-next-paint"]?.numericValue ?? 0,
    fcp: lr.audits?.["first-contentful-paint"]?.numericValue ?? 0,
    si: lr.audits?.["speed-index"]?.numericValue ?? 0,
    tbt: lr.audits?.["total-blocking-time"]?.numericValue ?? 0,
    diagnostics,
  };
}

export function checkBudgets(
  metrics: PsiMetrics,
  budgets: { lcp?: number; cls?: number; score?: number },
): string[] {
  const failures: string[] = [];

  if (budgets.score != null && metrics.performanceScore < budgets.score) {
    failures.push(
      `Performance score ${metrics.performanceScore} is below budget ${budgets.score}`,
    );
  }
  if (budgets.lcp != null && metrics.lcp > budgets.lcp) {
    failures.push(
      `LCP ${formatMs(metrics.lcp)} exceeds budget ${formatMs(budgets.lcp)}`,
    );
  }
  if (budgets.cls != null && metrics.cls > budgets.cls) {
    failures.push(
      `CLS ${formatCls(metrics.cls)} exceeds budget ${formatCls(budgets.cls)}`,
    );
  }

  return failures;
}

// --- Output formatting ---

function printPageResult(result: PageResult) {
  const { url, strategy, metrics, error } = result;

  console.log(
    chalk.bold("  indxel perf") + chalk.dim(` — ${url} (${strategy})`),
  );
  console.log("");

  if (error || !metrics) {
    console.log(chalk.red(`  ✗ ${error ?? "Unknown error"}`));
    console.log("");
    return;
  }

  const sc = scoreColor(metrics.performanceScore);
  const perfIcon =
    metrics.performanceScore >= 90
      ? chalk.green("✓")
      : metrics.performanceScore >= 50
        ? chalk.yellow("⚠")
        : chalk.red("✗");
  console.log(
    `  ${perfIcon} ${chalk.bold("Performance")}  ${sc(chalk.bold(`${metrics.performanceScore}/100`))}`,
  );
  console.log("");

  // Core Web Vitals
  console.log(chalk.bold("  Core Web Vitals"));

  const lcpRating = ratingFor("lcp", metrics.lcp);
  const clsRating = ratingFor("cls", metrics.cls);
  const inpRating = ratingFor("inp", metrics.inp);

  console.log(
    `  ${iconForRating(lcpRating)} ${colorForRating(lcpRating)(formatMs(metrics.lcp).padEnd(9))} ${chalk.dim("LCP  Largest Contentful Paint")}`,
  );
  console.log(
    `  ${iconForRating(clsRating)} ${colorForRating(clsRating)(formatCls(metrics.cls).padEnd(9))} ${chalk.dim("CLS  Cumulative Layout Shift")}`,
  );
  console.log(
    `  ${iconForRating(inpRating)} ${colorForRating(inpRating)(formatMs(metrics.inp).padEnd(9))} ${chalk.dim("INP  Interaction to Next Paint")}`,
  );
  console.log("");

  // Other metrics
  console.log(chalk.bold("  Other metrics"));
  console.log(
    `    ${formatMs(metrics.fcp).padEnd(9)} ${chalk.dim("FCP  First Contentful Paint")}`,
  );
  console.log(
    `    ${formatMs(metrics.si).padEnd(9)} ${chalk.dim("SI   Speed Index")}`,
  );
  console.log(
    `    ${formatMs(metrics.tbt).padEnd(9)} ${chalk.dim("TBT  Total Blocking Time")}`,
  );
  console.log("");

  // Diagnostics
  if (metrics.diagnostics.length > 0) {
    console.log(chalk.bold("  Diagnostics"));
    for (const d of metrics.diagnostics) {
      const icon = d.savingsMs != null && d.savingsMs > 0
        ? chalk.yellow("⚡")
        : chalk.dim("ℹ");
      const savings = d.savingsMs != null && d.savingsMs > 0
        ? chalk.yellow(` -${formatMs(d.savingsMs)}`)
        : "";
      const display = d.displayValue ? chalk.dim(` (${d.displayValue})`) : "";
      console.log(`  ${icon} ${d.title}${display}${savings}`);
    }
    console.log("");
  }
}

function printMultiPageSummary(results: PageResult[]) {
  const valid = results.filter((r) => r.metrics);
  if (valid.length === 0) return;

  const avgScore = Math.round(
    valid.reduce((s, r) => s + r.metrics!.performanceScore, 0) / valid.length,
  );
  const worstLcp = Math.max(...valid.map((r) => r.metrics!.lcp));
  const worstCls = Math.max(...valid.map((r) => r.metrics!.cls));
  const worstInp = Math.max(...valid.map((r) => r.metrics!.inp));

  console.log(chalk.bold("  ─── Summary ───"));
  console.log("");
  console.log(`  Pages tested:   ${chalk.bold(String(results.length))}`);
  console.log(
    `  Avg score:      ${scoreColor(avgScore)(chalk.bold(`${avgScore}/100`))}`,
  );

  const lcpR = ratingFor("lcp", worstLcp);
  const clsR = ratingFor("cls", worstCls);
  const inpR = ratingFor("inp", worstInp);

  console.log(
    `  Worst LCP:      ${colorForRating(lcpR)(formatMs(worstLcp))}`,
  );
  console.log(
    `  Worst CLS:      ${colorForRating(clsR)(formatCls(worstCls))}`,
  );
  console.log(
    `  Worst INP:      ${colorForRating(inpR)(formatMs(worstInp))}`,
  );
  console.log("");
}

// --- Command ---

export const perfCommand = new Command("perf")
  .description("Test Core Web Vitals and performance via PageSpeed Insights")
  .argument("[url]", "URL to test (auto-detected from seo.config if omitted)")
  .option(
    "--strategy <strategy>",
    "Testing strategy: mobile or desktop",
    "mobile",
  )
  .option(
    "--pages <n>",
    "Test top N pages from sitemap (default: 1 = just the URL)",
    "1",
  )
  .option("--json", "Output results as JSON", false)
  .option("--budget-lcp <ms>", "Fail if LCP exceeds threshold (ms)")
  .option("--budget-cls <score>", "Fail if CLS exceeds threshold")
  .option("--budget-score <n>", "Fail if perf score below threshold")
  .option("--api-key <key>", "Indxel API key (uses our backend for PSI, or set INDXEL_API_KEY)")
  .action(async (urlArg: string | undefined, opts) => {
    const jsonOutput = opts.json;
    const strategy = opts.strategy as "mobile" | "desktop";
    const pageCount = parseInt(opts.pages, 10);

    // Resolve API key for proxied PSI calls
    const apiKey = await resolveApiKey(opts.apiKey);

    if (strategy !== "mobile" && strategy !== "desktop") {
      console.error(
        chalk.red("  --strategy must be 'mobile' or 'desktop'"),
      );
      process.exit(1);
    }

    // Resolve URL: argument > seo.config > .indxelrc > package.json
    let url = urlArg;
    if (!url) {
      const detected = await resolveProjectUrl(process.cwd());
      if (detected) {
        url = detected;
        if (!jsonOutput) {
          console.log(chalk.dim(`  Using URL from project config: ${url}`));
          console.log("");
        }
      } else {
        console.error(chalk.red("  No URL provided and none found in seo.config or .indxelrc.json."));
        console.error(chalk.dim("  Usage: npx indxel perf [url]"));
        process.exit(1);
      }
    }

    // Ensure URL has protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    try {
      new URL(url);
    } catch {
      console.error(chalk.red("  Invalid URL."));
      process.exit(1);
    }

    // Collect URLs to test
    let urls: string[] = [url];

    if (pageCount > 1) {
      const sitemapSpinner = jsonOutput ? null : ora("Fetching sitemap...").start();
      const sitemap = await fetchSitemap(url);

      if (sitemap.found && sitemap.urls.length > 0) {
        urls = sitemap.urls.slice(0, pageCount).map((u) => u.loc);
        sitemapSpinner?.succeed(
          `Found ${sitemap.urls.length} URLs, testing top ${urls.length}`,
        );
      } else {
        sitemapSpinner?.warn("No sitemap found, testing single URL");
      }
      if (!jsonOutput) console.log("");
    }

    // Run PSI for each URL
    const results: PageResult[] = [];

    for (let i = 0; i < urls.length; i++) {
      const targetUrl = urls[i];
      const spinner = jsonOutput
        ? null
        : ora(
            urls.length > 1
              ? `Testing ${i + 1}/${urls.length}: ${targetUrl}`
              : `Testing ${targetUrl} (${strategy})...`,
          ).start();

      try {
        const metrics = await fetchPsi(targetUrl, strategy, apiKey);
        spinner?.stop();
        results.push({ url: targetUrl, strategy, metrics });

        if (!jsonOutput) {
          printPageResult({ url: targetUrl, strategy, metrics });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        spinner?.fail(`Failed: ${targetUrl}`);
        results.push({ url: targetUrl, strategy, metrics: null, error: errMsg });

        if (!jsonOutput) {
          console.log(chalk.red(`  ${errMsg}`));
          console.log("");
        }
      }

      // Rate-limit delay between calls
      if (i < urls.length - 1) {
        await delay(2000);
      }
    }

    // Multi-page summary
    if (!jsonOutput && results.length > 1) {
      printMultiPageSummary(results);
    }

    // JSON output
    if (jsonOutput) {
      const output =
        results.length === 1
          ? {
              url: results[0].url,
              strategy: results[0].strategy,
              ...(results[0].metrics ?? {}),
              error: results[0].error ?? undefined,
            }
          : {
              strategy,
              pages: results.map((r) => ({
                url: r.url,
                ...(r.metrics ?? {}),
                error: r.error ?? undefined,
              })),
              summary: (() => {
                const valid = results.filter((r) => r.metrics);
                if (valid.length === 0) return null;
                return {
                  avgScore: Math.round(
                    valid.reduce(
                      (s, r) => s + r.metrics!.performanceScore,
                      0,
                    ) / valid.length,
                  ),
                  worstLcp: Math.max(
                    ...valid.map((r) => r.metrics!.lcp),
                  ),
                  worstCls: Math.max(
                    ...valid.map((r) => r.metrics!.cls),
                  ),
                  worstInp: Math.max(
                    ...valid.map((r) => r.metrics!.inp),
                  ),
                };
              })(),
            };
      console.log(JSON.stringify(output, null, 2));
    }

    // Budget enforcement
    const budgets = {
      lcp: opts.budgetLcp ? parseFloat(opts.budgetLcp) : undefined,
      cls: opts.budgetCls ? parseFloat(opts.budgetCls) : undefined,
      score: opts.budgetScore ? parseInt(opts.budgetScore, 10) : undefined,
    };

    const hasBudgets =
      budgets.lcp != null || budgets.cls != null || budgets.score != null;

    if (hasBudgets) {
      const allFailures: string[] = [];

      for (const r of results) {
        if (!r.metrics) continue;
        const failures = checkBudgets(r.metrics, budgets);
        if (failures.length > 0) {
          allFailures.push(...failures.map((f) => `${r.url}: ${f}`));
        }
      }

      if (allFailures.length > 0) {
        if (!jsonOutput) {
          console.log(chalk.red(chalk.bold("  Budget exceeded:")));
          for (const f of allFailures) {
            console.log(chalk.red(`  ✗ ${f}`));
          }
          console.log("");
        }
        process.exit(1);
      }
    }

    // Nudge: CI guard for performance budgets
    if (!jsonOutput && !hasBudgets) {
      console.log(chalk.dim("  Enforce budgets in CI → ") + chalk.bold("npx indxel perf --budget-score 80 --budget-lcp 2500"));
      console.log(chalk.dim("  Full SEO + perf audit → ") + chalk.bold("npx indxel crawl"));
      console.log("");
    }
  });
