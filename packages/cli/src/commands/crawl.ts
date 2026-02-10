import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  crawlSite,
  fetchSitemap,
  compareSitemap,
  fetchRobots,
  checkUrlsAgainstRobots,
  verifyAssets,
} from "indxel";
import type { CrawledPage } from "indxel";
import { resolveApiKey } from "../store.js";

function scoreColor(score: number): typeof chalk {
  if (score >= 90) return chalk.green;
  if (score >= 70) return chalk.yellow;
  return chalk.red;
}

export const crawlCommand = new Command("crawl")
  .description("Crawl a live site, audit every page, check sitemap, robots.txt, and assets")
  .argument("<url>", "URL to start crawling (e.g., https://yoursite.com)")
  .option("--max-pages <n>", "Maximum pages to crawl", "200")
  .option("--max-depth <n>", "Maximum link depth", "5")
  .option("--delay <ms>", "Delay between requests in ms", "200")
  .option("--json", "Output results as JSON", false)
  .option("--strict", "Treat warnings as errors", false)
  .option("--skip-assets", "Skip asset verification", false)
  .option("--skip-sitemap", "Skip sitemap check", false)
  .option("--skip-robots", "Skip robots.txt check", false)
  .option("--ignore <patterns>", "Comma-separated path patterns to exclude from analysis (e.g. /app/*,/admin/*)")
  .option("--push", "Push results to Indxel dashboard", false)
  .option("--api-key <key>", "API key for --push (or set INDXEL_API_KEY env var)")
  .action(async (url: string, opts) => {
    const jsonOutput = opts.json;
    const maxPages = parseInt(opts.maxPages, 10);
    const maxDepth = parseInt(opts.maxDepth, 10);
    const delay = parseInt(opts.delay, 10);

    // Ensure URL has protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    if (!jsonOutput) {
      console.log("");
      console.log(chalk.bold(`  indxel crawl`) + chalk.dim(` — ${url}`));
      console.log("");
    }

    // 1. Robots.txt
    let robotsResult = null;
    if (!opts.skipRobots) {
      const robotsSpinner = jsonOutput ? null : ora("Checking robots.txt...").start();
      robotsResult = await fetchRobots(url);

      if (!jsonOutput) {
        if (robotsResult.found) {
          robotsSpinner!.succeed("robots.txt found");
          for (const w of robotsResult.warnings) {
            console.log(chalk.yellow(`  ⚠ ${w}`));
          }
          if (robotsResult.sitemapUrls.length > 0) {
            console.log(chalk.dim(`  Sitemap references: ${robotsResult.sitemapUrls.join(", ")}`));
          }
        } else {
          robotsSpinner!.warn("robots.txt not found");
          for (const e of robotsResult.errors) {
            console.log(chalk.dim(`  ${e}`));
          }
        }
        console.log("");
      }
    }

    // 2. Crawl
    const crawlSpinner = jsonOutput ? null : ora("Crawling...").start();
    let crawledCount = 0;

    // Parse ignore patterns
    const ignorePatterns: string[] = opts.ignore
      ? opts.ignore.split(",").map((p: string) => p.trim()).filter(Boolean)
      : [];

    const crawlResult = await crawlSite(url, {
      maxPages,
      maxDepth,
      delay,
      strict: opts.strict,
      ignorePatterns,
      onPageCrawled: (page: CrawledPage) => {
        crawledCount++;
        if (crawlSpinner) {
          crawlSpinner.text = `Crawling... ${crawledCount} pages (current: ${page.url})`;
        }
      },
    });

    if (!jsonOutput) {
      crawlSpinner!.succeed(`Crawled ${crawlResult.totalPages} pages in ${(crawlResult.durationMs / 1000).toFixed(1)}s`);
      console.log("");

      // Page results
      for (const page of crawlResult.pages) {
        if (page.error) {
          console.log(chalk.red(`  ✗ ${page.url}`) + chalk.dim(` — ${page.error}`));
          continue;
        }

        const pageColor = scoreColor(page.validation.score);
        const icon =
          page.validation.errors.length > 0 ? chalk.red("✗") : chalk.green("✓");

        console.log(
          `  ${icon} ${page.url} ${pageColor(`${page.validation.score}/100`)}`,
        );

        for (const error of page.validation.errors) {
          console.log(chalk.red(`    ✗ ${error.message ?? error.description}`));
        }
        for (const warning of page.validation.warnings) {
          console.log(chalk.yellow(`    ⚠ ${warning.message ?? warning.description}`));
        }
      }

      console.log("");
    }

    // 3. Sitemap check
    let sitemapComparison = null;
    if (!opts.skipSitemap) {
      const sitemapSpinner = jsonOutput ? null : ora("Checking sitemap.xml...").start();
      const sitemapResult = await fetchSitemap(url);

      if (!jsonOutput) {
        if (sitemapResult.found) {
          sitemapSpinner!.succeed(`sitemap.xml found — ${sitemapResult.urls.length} URLs`);

          // Compare with crawled pages
          const crawledUrls = crawlResult.pages
            .filter((p) => !p.error)
            .map((p) => p.url);
          sitemapComparison = compareSitemap(
            sitemapResult.urls.map((u) => u.loc),
            crawledUrls,
          );

          if (sitemapComparison.inCrawlOnly.length > 0) {
            console.log(chalk.yellow(`  ⚠ ${sitemapComparison.inCrawlOnly.length} crawled pages missing from sitemap:`));
            for (const u of sitemapComparison.inCrawlOnly.slice(0, 10)) {
              console.log(chalk.dim(`    - ${u}`));
            }
          }
          if (sitemapComparison.inSitemapOnly.length > 0) {
            const hitLimit = crawlResult.totalPages >= maxPages;
            const label = hitLimit
              ? `${sitemapComparison.inSitemapOnly.length} sitemap URLs not crawled (limit: ${maxPages} — use --max-pages to increase)`
              : `${sitemapComparison.inSitemapOnly.length} sitemap URLs not reachable`;
            console.log(chalk.yellow(`  ⚠ ${label}:`));
            for (const u of sitemapComparison.inSitemapOnly.slice(0, 10)) {
              console.log(chalk.dim(`    - ${u}`));
            }
          }
          if (sitemapComparison.issues.length === 0) {
            console.log(chalk.green(`  ✓ Sitemap matches crawled pages`));
          }
        } else {
          sitemapSpinner!.warn("sitemap.xml not found");
          for (const e of sitemapResult.errors) {
            console.log(chalk.dim(`  ${e}`));
          }
        }
        console.log("");
      }
    }

    // 4. Robots.txt URL check
    let robotsBlockedPages = null;
    if (robotsResult?.found && robotsResult.directives.length > 0) {
      const crawledUrls = crawlResult.pages.filter((p) => !p.error).map((p) => p.url);
      robotsBlockedPages = checkUrlsAgainstRobots(
        robotsResult.directives,
        crawledUrls,
      );
      const blocked = robotsBlockedPages.filter((c) => c.blocked);

      if (!jsonOutput && blocked.length > 0) {
        console.log(chalk.yellow(`  ⚠ ${blocked.length} crawled pages are blocked by robots.txt:`));
        for (const b of blocked) {
          console.log(chalk.dim(`    - ${b.path} (${b.blockedBy})`));
        }
        console.log("");
      }
    }

    // 5. Asset verification
    let assetResult = null;
    if (!opts.skipAssets) {
      const assetSpinner = jsonOutput ? null : ora("Verifying assets (og:image, favicon, ...)...").start();

      const pagesForAssetCheck = crawlResult.pages
        .filter((p) => !p.error)
        .map((p) => ({ url: p.url, metadata: p.metadata }));
      assetResult = await verifyAssets(pagesForAssetCheck);

      if (!jsonOutput) {
        assetSpinner!.succeed(`Verified ${assetResult.totalChecked} assets`);

        const brokenAssets = assetResult.checks.filter((c) => !c.ok);
        const warningAssets = assetResult.checks.filter((c) => c.warning);

        for (const asset of brokenAssets) {
          console.log(
            chalk.red(`  ✗ ${asset.type}`) +
            chalk.dim(` ${asset.url}`) +
            chalk.red(` — ${asset.error ?? `HTTP ${asset.status}`}`),
          );
        }
        for (const asset of warningAssets) {
          console.log(
            chalk.yellow(`  ⚠ ${asset.type}`) +
            chalk.dim(` ${asset.url}`) +
            chalk.yellow(` — ${asset.warning}`),
          );
        }
        if (brokenAssets.length === 0 && warningAssets.length === 0) {
          console.log(chalk.green(`  ✓ All assets respond correctly`));
        }
        console.log("");
      }
    }

    // 6. Cross-page analysis
    if (!jsonOutput) {
      const a = crawlResult.analysis;

      // Duplicate titles
      if (a.duplicateTitles.length > 0) {
        console.log(chalk.bold("- Duplicate titles"));
        for (const dup of a.duplicateTitles.slice(0, 5)) {
          console.log(chalk.red(`  ✗ "${dup.title.length > 60 ? dup.title.slice(0, 57) + "..." : dup.title}"`) + chalk.dim(` (${dup.urls.length} pages)`));
          for (const u of dup.urls.slice(0, 3)) console.log(chalk.dim(`    ${u}`));
          if (dup.urls.length > 3) console.log(chalk.dim(`    ...and ${dup.urls.length - 3} more`));
        }
        if (a.duplicateTitles.length > 5) console.log(chalk.dim(`  ...and ${a.duplicateTitles.length - 5} more groups`));
        console.log("");
      }

      // Duplicate descriptions
      if (a.duplicateDescriptions.length > 0) {
        console.log(chalk.bold("- Duplicate descriptions"));
        for (const dup of a.duplicateDescriptions.slice(0, 5)) {
          const desc = dup.description.length > 60 ? dup.description.slice(0, 57) + "..." : dup.description;
          console.log(chalk.red(`  ✗ "${desc}"`) + chalk.dim(` (${dup.urls.length} pages)`));
          for (const u of dup.urls.slice(0, 3)) console.log(chalk.dim(`    ${u}`));
          if (dup.urls.length > 3) console.log(chalk.dim(`    ...and ${dup.urls.length - 3} more`));
        }
        if (a.duplicateDescriptions.length > 5) console.log(chalk.dim(`  ...and ${a.duplicateDescriptions.length - 5} more groups`));
        console.log("");
      }

      // H1 issues
      if (a.h1Issues.length > 0) {
        const missing = a.h1Issues.filter(h => h.issue === "missing");
        const multiple = a.h1Issues.filter(h => h.issue === "multiple");
        console.log(chalk.bold("- H1 heading issues"));
        if (missing.length > 0) {
          console.log(chalk.red(`  ✗ ${missing.length} pages missing H1`));
          for (const h of missing.slice(0, 5)) console.log(chalk.dim(`    ${h.url}`));
          if (missing.length > 5) console.log(chalk.dim(`    ...and ${missing.length - 5} more`));
        }
        if (multiple.length > 0) {
          console.log(chalk.yellow(`  ⚠ ${multiple.length} pages with multiple H1s`));
          for (const h of multiple.slice(0, 5)) console.log(chalk.dim(`    ${h.url} (${h.count} H1s)`));
          if (multiple.length > 5) console.log(chalk.dim(`    ...and ${multiple.length - 5} more`));
        }
        console.log("");
      }

      // Broken internal links
      if (a.brokenInternalLinks.length > 0) {
        console.log(chalk.bold("- Broken internal links"));
        for (const bl of a.brokenInternalLinks.slice(0, 10)) {
          console.log(chalk.red(`  ✗ ${bl.to}`) + chalk.dim(` ← linked from ${bl.from} (${bl.status})`));
        }
        if (a.brokenInternalLinks.length > 10) console.log(chalk.dim(`  ...and ${a.brokenInternalLinks.length - 10} more`));
        console.log("");
      }

      // Broken external links
      if (a.brokenExternalLinks.length > 0) {
        console.log(chalk.bold("- Broken external links"));
        for (const bl of a.brokenExternalLinks.slice(0, 10)) {
          console.log(chalk.red(`  ✗ ${bl.to}`) + chalk.dim(` ← linked from ${bl.from} (${bl.status})`));
        }
        if (a.brokenExternalLinks.length > 10) console.log(chalk.dim(`  ...and ${a.brokenExternalLinks.length - 10} more`));
        console.log("");
      }

      // Redirects
      if (a.redirects.length > 0) {
        console.log(chalk.bold("- Redirect chains"));
        for (const r of a.redirects.slice(0, 10)) {
          console.log(chalk.yellow(`  ⚠ ${r.url}`));
          for (const step of r.chain) console.log(chalk.dim(`    ${step}`));
        }
        if (a.redirects.length > 10) console.log(chalk.dim(`  ...and ${a.redirects.length - 10} more`));
        console.log("");
      }

      // Thin content
      if (a.thinContentPages.length > 0) {
        const realThin = a.thinContentPages.filter(tc => !tc.isAppPage);
        const appThin = a.thinContentPages.filter(tc => tc.isAppPage);

        if (realThin.length > 0) {
          console.log(chalk.bold("- Thin content") + chalk.dim(" (< 200 words)"));
          for (const tc of realThin.slice(0, 10)) {
            console.log(chalk.yellow(`  ⚠ ${tc.url}`) + chalk.dim(` — ${tc.wordCount} words`));
          }
          if (realThin.length > 10) console.log(chalk.dim(`  ...and ${realThin.length - 10} more`));
          console.log("");
        }
        if (appThin.length > 0) {
          console.log(chalk.bold("- App/wizard pages") + chalk.dim(" (client-rendered, low word count expected)"));
          for (const tc of appThin.slice(0, 5)) {
            console.log(chalk.dim(`  ℹ ${tc.url} — ${tc.wordCount} words`));
          }
          if (appThin.length > 5) console.log(chalk.dim(`  ...and ${appThin.length - 5} more`));
          console.log("");
        }
      }

      // Orphan pages
      if (a.orphanPages.length > 0) {
        console.log(chalk.bold("- Orphan pages") + chalk.dim(" (0 internal links pointing to them)"));
        for (const o of a.orphanPages.slice(0, 10)) console.log(chalk.yellow(`  ⚠ ${o}`));
        if (a.orphanPages.length > 10) console.log(chalk.dim(`  ...and ${a.orphanPages.length - 10} more`));
        console.log("");
      }

      // Slowest pages
      if (a.slowestPages.length > 0 && a.slowestPages[0].responseTimeMs > 1000) {
        console.log(chalk.bold("- Slowest pages"));
        for (const sp of a.slowestPages.filter(p => p.responseTimeMs > 1000).slice(0, 5)) {
          const color = sp.responseTimeMs > 3000 ? chalk.red : chalk.yellow;
          console.log(color(`  ⚠ ${sp.url}`) + chalk.dim(` — ${(sp.responseTimeMs / 1000).toFixed(1)}s`));
        }
        console.log("");
      }

      // Structured data summary
      if (a.structuredDataSummary.length > 0) {
        console.log(chalk.bold("- Structured data (JSON-LD)"));
        for (const sd of a.structuredDataSummary) {
          console.log(chalk.green(`  ✓ ${sd.type}`) + chalk.dim(` — ${sd.count} page${sd.count > 1 ? "s" : ""}`));
        }
        const pagesWithSD = crawlResult.pages.filter(p => !p.error && p.structuredDataTypes.length > 0).length;
        const pagesWithout = crawlResult.pages.filter(p => !p.error).length - pagesWithSD;
        if (pagesWithout > 0) {
          console.log(chalk.yellow(`  ⚠ ${pagesWithout} pages without any structured data`));
        }
        console.log("");
      } else {
        console.log(chalk.bold("- Structured data (JSON-LD)"));
        console.log(chalk.red(`  ✗ No structured data found on any page`));
        console.log("");
      }

      // Image alt text issues
      if (a.imageAltIssues.length > 0) {
        console.log(chalk.bold("- Image alt text"));
        for (const img of a.imageAltIssues.slice(0, 10)) {
          const color = img.missingAlt / img.total >= 0.5 ? chalk.red : chalk.yellow;
          const icon = img.missingAlt / img.total >= 0.5 ? "✗" : "⚠";
          console.log(color(`  ${icon} ${img.url}`) + chalk.dim(` — ${img.missingAlt}/${img.total} images missing alt`));
        }
        if (a.imageAltIssues.length > 10) console.log(chalk.dim(`  ...and ${a.imageAltIssues.length - 10} more`));
        console.log("");
      }

      // Broken images
      if (a.brokenImages.length > 0) {
        console.log(chalk.bold("- Broken images"));
        for (const img of a.brokenImages.slice(0, 10)) {
          const src = img.src.length > 80 ? img.src.slice(0, 77) + "..." : img.src;
          console.log(chalk.red(`  ✗ ${src}`) + chalk.dim(` (${img.status}) — on ${img.pages.length} page${img.pages.length > 1 ? "s" : ""}`));
          for (const page of img.pages.slice(0, 3)) console.log(chalk.dim(`    ${page}`));
          if (img.pages.length > 3) console.log(chalk.dim(`    ...and ${img.pages.length - 3} more`));
        }
        if (a.brokenImages.length > 10) console.log(chalk.dim(`  ...and ${a.brokenImages.length - 10} more`));
        console.log("");
      }
    }

    // 7. Summary
    if (jsonOutput) {
      console.log(
        JSON.stringify(
          {
            crawl: crawlResult,
            robots: robotsResult,
            sitemap: sitemapComparison,
            assets: assetResult,
          },
          null,
          2,
        ),
      );
    } else {
      const summaryColor = scoreColor(crawlResult.averageScore);

      console.log(chalk.bold("  ─── Summary ───"));
      console.log("");
      const hitLimit = crawlResult.totalPages >= maxPages;
      console.log(`  Pages crawled:  ${chalk.bold(String(crawlResult.totalPages))}${hitLimit ? chalk.dim(` (limit: ${maxPages} — use --max-pages to crawl more)`) : ""}`);
      console.log(`  Average score:  ${summaryColor(chalk.bold(`${crawlResult.averageScore}/100`))} (${crawlResult.grade})`);
      console.log(`  Errors:         ${crawlResult.totalErrors > 0 ? chalk.red(String(crawlResult.totalErrors)) : chalk.green("0")}`);
      console.log(`  Warnings:       ${crawlResult.totalWarnings > 0 ? chalk.yellow(String(crawlResult.totalWarnings)) : chalk.green("0")}`);
      if (assetResult) {
        console.log(`  Broken assets:  ${assetResult.totalBroken > 0 ? chalk.red(String(assetResult.totalBroken)) : chalk.green("0")}`);
      }
      if (crawlResult.skippedUrls.length > 0) {
        console.log(chalk.dim(`  Skipped:        ${crawlResult.skippedUrls.length} URLs (over limit)`));
      }
      console.log("");
    }

    // 8. Push to dashboard
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
          const pushUrl = process.env.INDXEL_API_URL || "https://www.indxel.com";
          const res = await fetch(`${pushUrl}/api/cli/push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              crawl: crawlResult,
              robots: robotsResult,
              sitemap: sitemapComparison,
              assets: assetResult,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { checkId?: string };
            if (pushSpinner) pushSpinner.succeed(`Pushed to dashboard — check ${data.checkId}`);
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

    // Exit code
    if (crawlResult.totalErrors > 0) {
      process.exit(1);
    }
  });
