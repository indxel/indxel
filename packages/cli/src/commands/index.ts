import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { fetchSitemap, fetchRobots } from "indxel";
import { checkPlan } from "../auth.js";
import { loadIndexNowKey, resolveApiKey } from "../store.js";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const indexCommand = new Command("index")
  .description("Submit your pages to search engines and check indexation status")
  .argument("<url>", "Site URL (e.g., https://yoursite.com)")
  .option("--check", "Check which pages appear indexed (Pro+)", false)
  .option("--indexnow-key <key>", "IndexNow key (auto-detected from .indxel/ if not specified)")
  .option("--api-key <key>", "Indxel API key (required for --check and IndexNow submission)")
  .option("--json", "Output results as JSON", false)
  .action(async (url: string, opts) => {
    const jsonOutput = opts.json;
    const needsPaid = opts.check;

    // Helper: only log in human-readable mode
    function log(...args: unknown[]) {
      if (!jsonOutput) console.log(...args);
    }

    // Helper: create spinner only in human-readable mode
    function spin(text: string) {
      return jsonOutput ? null : ora(text).start();
    }

    // Ensure URL has protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    let baseUrl: URL;
    try {
      baseUrl = new URL(url);
    } catch {
      console.error(chalk.red("  Invalid URL."));
      process.exit(1);
    }

    const origin = baseUrl.origin;
    const host = baseUrl.hostname;

    log("");
    log(chalk.bold("  indxel index") + chalk.dim(` — ${origin}`));
    log("");

    // Gate paid features behind API key + plan check
    if (needsPaid) {
      const apiKey = await resolveApiKey(opts.apiKey);
      if (!apiKey) {
        log(chalk.red("  ✗ --check requires a linked project (Plus plan)."));
        log(chalk.dim("    Run: ") + chalk.bold("npx indxel link"));
        log(chalk.dim("    Or use --api-key / set INDXEL_API_KEY."));
        log("");
        process.exit(1);
      }

      const plan = await checkPlan(apiKey);
      if (!plan) {
        log(chalk.red("  ✗ Invalid API key."));
        log("");
        process.exit(1);
      }

      if (plan === "FREE") {
        log(chalk.red("  ✗ Indexation check requires a Pro plan."));
        log(chalk.dim("    Upgrade at https://indxel.com/pricing"));
        log("");
        process.exit(1);
      }
    }

    // 1. Fetch sitemap
    const sitemapSpinner = spin("Fetching sitemap...");
    const sitemapResult = await fetchSitemap(origin);
    const sitemapUrl = `${origin}/sitemap.xml`;

    if (!sitemapResult.found || sitemapResult.urls.length === 0) {
      sitemapSpinner?.fail("No sitemap found");
      log(chalk.dim("  Create a sitemap first: ") + chalk.bold("npx indxel init"));
      log("");
      if (jsonOutput) {
        console.log(JSON.stringify({ error: "No sitemap found" }, null, 2));
      }
      process.exit(1);
    }

    sitemapSpinner?.succeed(`Found sitemap — ${sitemapResult.urls.length} URLs`);

    // 2. Check robots.txt references sitemap
    const robotsSpinner = spin("Checking robots.txt...");
    const robotsResult = await fetchRobots(origin);
    let sitemapInRobots = false;

    if (robotsResult.found) {
      sitemapInRobots = robotsResult.sitemapUrls.some((s) =>
        s.toLowerCase().includes("sitemap"),
      );
      if (sitemapInRobots) {
        robotsSpinner?.succeed("robots.txt references sitemap");
      } else {
        robotsSpinner?.warn("robots.txt found but doesn't reference sitemap");
        log(chalk.dim(`  Add this to your robots.txt:`));
        log(chalk.dim(`  Sitemap: ${sitemapUrl}`));
      }
    } else {
      robotsSpinner?.warn("No robots.txt found");
      log(chalk.dim("  Create one with: ") + chalk.bold("npx indxel init"));
    }

    log("");

    // 3. IndexNow submission (Bing, Yandex, DuckDuckGo, etc.)
    // IndexNow is an open protocol — one-shot submission works without an account.
    const indexNowKey = opts.indexnowKey || process.env.INDEXNOW_KEY || await loadIndexNowKey(process.cwd());
    const indexNowResult: { submitted: boolean; engine: string; status?: number }[] = [];

    if (indexNowKey) {
      const urls = sitemapResult.urls.map((u) => u.loc);
      const indexNowSpinner = spin("Submitting via IndexNow...");

      const indexNowEngines = [
        { name: "Bing/Yandex", endpoint: "https://api.indexnow.org/indexnow" },
      ];

      for (const engine of indexNowEngines) {
        try {
          const res = await fetch(engine.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              host,
              key: indexNowKey,
              keyLocation: `${origin}/${indexNowKey}.txt`,
              urlList: urls.slice(0, 10000), // IndexNow limit
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (res.ok || res.status === 202) {
            indexNowResult.push({ submitted: true, engine: engine.name, status: res.status });
            indexNowSpinner?.succeed(`IndexNow — ${urls.length} URLs submitted to ${engine.name}`);
          } else {
            indexNowResult.push({ submitted: false, engine: engine.name, status: res.status });
            indexNowSpinner?.warn(`IndexNow — ${engine.name} returned HTTP ${res.status}`);
          }
        } catch (err) {
          indexNowResult.push({ submitted: false, engine: engine.name });
          indexNowSpinner?.fail(`IndexNow — ${err instanceof Error ? err.message : "failed"}`);
        }
      }
    } else {
      log(chalk.bold("  IndexNow") + chalk.dim(" (Bing, Yandex, DuckDuckGo)"));
      log(chalk.dim("  Not configured. Run ") + chalk.bold("npx indxel init") + chalk.dim(" to set it up automatically."));
      log("");
    }

    log(chalk.bold("  Google Search Console"));
    log(chalk.dim("  Google requires manual setup via Search Console:"));
    log(chalk.dim("    1. Go to ") + chalk.underline("https://search.google.com/search-console"));
    log(chalk.dim(`    2. Add & verify ${host}`));
    log(chalk.dim("    3. Submit your sitemap: Sitemaps > Add > sitemap.xml"));
    log("");

    // 4. Check indexation status (optional)
    let indexationResults: Array<{ url: string; indexed: boolean }> | null = null;

    if (opts.check) {
      const checkSpinner = spin("Checking indexation status...");
      indexationResults = [];
      const urls = sitemapResult.urls.map((u) => u.loc);
      let indexedCount = 0;

      for (let i = 0; i < urls.length; i++) {
        const pageUrl = urls[i];
        if (checkSpinner) {
          checkSpinner.text = `Checking indexation... ${i + 1}/${urls.length}`;
        }

        try {
          const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(pageUrl)}`;
          const res = await fetch(cacheUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
            redirect: "manual",
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; Indxel/0.1; +https://indxel.com)",
            },
          });

          const indexed = res.status === 200 || res.status === 301 || res.status === 302;
          indexationResults.push({ url: pageUrl, indexed });
          if (indexed) indexedCount++;
        } catch {
          indexationResults.push({ url: pageUrl, indexed: false });
        }

        await delay(300);
      }

      checkSpinner?.succeed(`Indexation: ${indexedCount}/${urls.length} pages found in Google cache`);

      if (!jsonOutput) {
        console.log("");
        const notIndexed = indexationResults.filter((r) => !r.indexed);

        if (notIndexed.length > 0) {
          console.log(chalk.bold(`  Not indexed (${notIndexed.length})`));
          for (const r of notIndexed.slice(0, 20)) {
            console.log(chalk.red("  ✗ ") + r.url);
          }
          if (notIndexed.length > 20) {
            console.log(chalk.dim(`  ... and ${notIndexed.length - 20} more`));
          }
          console.log("");
        } else {
          console.log(chalk.green("  ✓ All pages appear indexed"));
          console.log("");
        }
      }
    }

    // 5. Summary
    if (jsonOutput) {
      console.log(JSON.stringify({
        sitemap: { url: sitemapUrl, urls: sitemapResult.urls.length },
        robotsTxt: { found: robotsResult.found, referencesSitemap: sitemapInRobots },
        indexNow: indexNowResult.length > 0 ? indexNowResult : null,
        indexation: indexationResults,
      }, null, 2));
    } else {
      console.log(chalk.bold("  ─── Summary ───"));
      console.log("");
      console.log(`  Sitemap:        ${sitemapResult.urls.length} URLs`);

      let robotsStatus: string;
      if (!robotsResult.found) {
        robotsStatus = chalk.red("✗ not found");
      } else if (sitemapInRobots) {
        robotsStatus = chalk.green("✓ references sitemap");
      } else {
        robotsStatus = chalk.yellow("⚠ missing sitemap ref");
      }
      console.log(`  robots.txt:     ${robotsStatus}`);

      if (indexNowResult.length > 0) {
        for (const r of indexNowResult) {
          const status = r.submitted ? chalk.green("✓ submitted") : chalk.red("✗ failed");
          console.log(`  IndexNow:       ${status} (${r.engine})`);
        }
      } else {
        console.log(`  IndexNow:       ${chalk.dim("not configured (run npx indxel init)")}`);
      }
      if (indexationResults) {
        const indexedCount = indexationResults.filter((r) => r.indexed).length;
        console.log(`  Google cache:   ${indexedCount}/${indexationResults.length} indexed`);
      }
      console.log("");
    }
  });
