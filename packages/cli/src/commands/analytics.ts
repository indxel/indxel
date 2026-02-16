import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { resolveApiKey, loadProjectConfig } from "../store.js";

interface QueryRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface Totals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SourceData {
  queries: QueryRow[];
  pages: QueryRow[];
  totals: Totals;
}

interface AnalyticsResponse {
  google: SourceData | null;
  bing: SourceData | null;
  period: string;
  startDate: string;
  endDate: string;
  error?: string;
}

// --- Helpers ---

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(1)}%`;
}

function fmtPos(pos: number): string {
  return pos.toFixed(1);
}

function posColor(pos: number) {
  if (pos <= 3) return chalk.green;
  if (pos <= 10) return chalk.yellow;
  return chalk.red;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function printTotals(label: string, totals: Totals) {
  const pc = posColor(totals.position);
  console.log(
    `  ${chalk.bold(label)}  ` +
      `${chalk.cyan(fmtNum(totals.clicks))} clicks  ` +
      `${chalk.dim(fmtNum(totals.impressions))} impr  ` +
      `${chalk.yellow(fmtCtr(totals.ctr))} CTR  ` +
      `${pc(fmtPos(totals.position))} avg pos`
  );
}

function printTable(rows: QueryRow[], limit: number) {
  const top = rows
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);

  if (top.length === 0) {
    console.log(chalk.dim("  No data"));
    return;
  }

  // Header
  console.log(
    chalk.dim(
      "  " +
        "Query / Page".padEnd(50) +
        "Clicks".padStart(8) +
        "Impr".padStart(8) +
        "CTR".padStart(8) +
        "Pos".padStart(6)
    )
  );

  for (const row of top) {
    const pc = posColor(row.position);
    console.log(
      "  " +
        truncate(row.key, 49).padEnd(50) +
        chalk.cyan(fmtNum(row.clicks).padStart(8)) +
        chalk.dim(fmtNum(row.impressions).padStart(8)) +
        chalk.yellow(fmtCtr(row.ctr).padStart(8)) +
        pc(fmtPos(row.position).padStart(6))
    );
  }
}

// --- Command ---

export const analyticsCommand = new Command("analytics")
  .description("View search analytics from Google Search Console and Bing Webmaster")
  .option("--source <source>", "Data source: google, bing, or all", "all")
  .option("--period <period>", "Time period: 7d, 28d, or 3m", "28d")
  .option("--top <n>", "Show top N queries and pages", "10")
  .option("--json", "Output raw JSON", false)
  .option("--api-key <key>", "Indxel API key (or set INDXEL_API_KEY)")
  .action(async (opts) => {
    const apiKey = await resolveApiKey(opts.apiKey);
    const config = await loadProjectConfig(process.cwd());

    if (!apiKey) {
      console.log("");
      console.log(chalk.red("  Not linked.") + " Run " + chalk.bold("npx indxel link") + " first.");
      console.log("");
      process.exit(1);
    }

    if (!config?.projectId) {
      console.log("");
      console.log(chalk.red("  No project linked.") + " Run " + chalk.bold("npx indxel link") + " first.");
      console.log("");
      process.exit(1);
    }

    const apiUrl = process.env.INDXEL_API_URL || "https://indxel.com";
    const spinner = ora("Fetching analytics...").start();

    try {
      const res = await fetch(`${apiUrl}/api/cli/analytics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          projectId: config.projectId,
          source: opts.source,
          period: opts.period,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        spinner.fail(data.error || `Failed (${res.status})`);
        console.log("");
        process.exit(1);
      }

      const data = (await res.json()) as AnalyticsResponse;
      spinner.stop();

      // JSON output
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const limit = parseInt(opts.top, 10) || 10;

      console.log("");
      console.log(
        chalk.bold("  indxel analytics") +
          chalk.dim(` — ${config.projectName} — ${data.startDate} → ${data.endDate}`)
      );
      console.log("");

      const hasGoogle = data.google && data.google.totals.impressions > 0;
      const hasBing = data.bing && data.bing.totals.impressions > 0;

      if (!hasGoogle && !hasBing) {
        console.log(chalk.dim("  No analytics data available."));
        if (!data.google) {
          console.log(chalk.dim("  Google: not connected — reconnect in Settings"));
        }
        if (!data.bing) {
          console.log(chalk.dim("  Bing: not connected — add API key in Settings"));
        }
        console.log("");
        return;
      }

      // ── Google ──
      if (hasGoogle) {
        printTotals("Google", data.google!.totals);
        console.log("");

        console.log(chalk.bold("  Top Queries"));
        printTable(data.google!.queries, limit);
        console.log("");

        console.log(chalk.bold("  Top Pages"));
        printTable(data.google!.pages, limit);
        console.log("");
      } else if (opts.source !== "bing") {
        console.log(chalk.dim("  Google: no data (not connected or no impressions)"));
        console.log("");
      }

      // ── Bing ──
      if (hasBing) {
        printTotals("Bing", data.bing!.totals);
        console.log("");

        console.log(chalk.bold("  Top Queries (Bing)"));
        printTable(data.bing!.queries, limit);
        console.log("");

        console.log(chalk.bold("  Top Pages (Bing)"));
        printTable(data.bing!.pages, limit);
        console.log("");
      } else if (opts.source !== "google") {
        console.log(chalk.dim("  Bing: no data (not connected or no impressions)"));
        console.log("");
      }

      // Nudge
      console.log(chalk.dim("  Dashboard → ") + chalk.bold(`${apiUrl}/dashboard/p/${config.projectId}/analytics`));
      console.log("");
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Connection failed");
      console.log("");
      process.exit(1);
    }
  });
