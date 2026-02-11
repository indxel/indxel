import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { researchKeywords, crawlSite, analyzeContentGaps } from "indxel";
import { resolveApiKey } from "../store.js";

export const keywordsCommand = new Command("keywords")
  .description("Research keyword opportunities and find content gaps")
  .argument("<seed>", "Seed keyword or topic to research")
  .option("--locale <locale>", "Language locale", "en")
  .option("--country <country>", "Country code", "us")
  .option("--site <url>", "Site URL to analyze content gaps against")
  .option("--max-pages <n>", "Maximum pages to crawl for gap analysis", "30")
  .option("--api-key <key>", "Indxel API key (or set INDXEL_API_KEY / run npx indxel link)")
  .option("--json", "Output results as JSON", false)
  .action(async (seed: string, opts) => {
    const jsonOutput = opts.json;

    // Gate: keyword research requires a linked project (free account)
    const apiKey = await resolveApiKey(opts.apiKey);
    if (!apiKey) {
      console.log("");
      console.log(chalk.bold("  indxel keywords") + chalk.dim(" — requires a free account"));
      console.log("");
      console.log(chalk.dim("  Keyword research is free but requires a linked project."));
      console.log(chalk.dim("  Create a free account in 30 seconds:"));
      console.log("");
      console.log(chalk.bold("    npx indxel link"));
      console.log("");
      process.exit(1);
    }

    if (!jsonOutput) {
      console.log("");
      console.log(chalk.bold(`  indxel keywords`) + chalk.dim(` — "${seed}"`));
      console.log("");
    }

    // 1. Keyword research
    const kwSpinner = jsonOutput ? null : ora("Researching keywords...").start();
    const kwResult = await researchKeywords(seed, {
      locale: opts.locale,
      country: opts.country,
    });

    if (!jsonOutput) {
      kwSpinner!.succeed(`Found ${kwResult.totalKeywords} keywords`);
      console.log("");

      if (kwResult.suggestions.length > 0) {
        console.log(chalk.bold(`  Direct suggestions (${kwResult.suggestions.length})`));
        for (const s of kwResult.suggestions) {
          console.log(`  ${chalk.hex("#F4A261")(s.keyword)}`);
        }
        console.log("");
      }

      if (kwResult.questions.length > 0) {
        console.log(chalk.bold(`  Questions (${kwResult.questions.length})`));
        for (const q of kwResult.questions.slice(0, 20)) {
          console.log(`  ${chalk.cyan("?")} ${q.keyword}`);
        }
        console.log("");
      }

      if (kwResult.longTail.length > 0) {
        console.log(chalk.bold(`  Long-tail (${kwResult.longTail.length})`));
        for (const lt of kwResult.longTail.slice(0, 20)) {
          console.log(chalk.dim(`  ${lt.keyword}`));
        }
        if (kwResult.longTail.length > 20) {
          console.log(chalk.dim(`  ... and ${kwResult.longTail.length - 20} more`));
        }
        console.log("");
      }
    }

    // 2. Content gap analysis (if site URL provided)
    let gapResult = null;
    if (opts.site) {
      let siteUrl = opts.site;
      if (!siteUrl.startsWith("http://") && !siteUrl.startsWith("https://")) {
        siteUrl = `https://${siteUrl}`;
      }

      const crawlSpinner = jsonOutput ? null : ora(`Crawling ${siteUrl} for gap analysis...`).start();
      const crawlResult = await crawlSite(siteUrl, {
        maxPages: parseInt(opts.maxPages, 10),
        delay: 200,
      });

      if (!jsonOutput) {
        crawlSpinner!.succeed(`Crawled ${crawlResult.totalPages} pages`);
      }

      const allKeywords = [
        ...kwResult.suggestions,
        ...kwResult.questions,
        ...kwResult.longTail,
      ];

      const existingPages = crawlResult.pages
        .filter((p) => !p.error)
        .map((p) => ({ url: p.url, metadata: p.metadata }));

      gapResult = analyzeContentGaps(allKeywords, existingPages);

      if (!jsonOutput) {
        console.log("");
        console.log(
          chalk.bold(`  Content coverage: `) +
            `${gapResult.totalCovered}/${gapResult.totalKeywords} keywords (${gapResult.coveragePercent}%)`,
        );
        console.log("");

        if (gapResult.gaps.length > 0) {
          const highGaps = gapResult.gaps.filter((g) => g.relevance === "high");
          const medGaps = gapResult.gaps.filter((g) => g.relevance === "medium");

          if (highGaps.length > 0) {
            console.log(chalk.bold.red(`  High priority gaps (${highGaps.length})`));
            for (const gap of highGaps.slice(0, 15)) {
              console.log(
                chalk.red(`  ✗ `) +
                  `"${gap.keyword}" → ` +
                  chalk.dim(`${gap.suggestedType} at ${gap.suggestedPath}`),
              );
            }
            console.log("");
          }

          if (medGaps.length > 0) {
            console.log(chalk.bold.yellow(`  Medium priority gaps (${medGaps.length})`));
            for (const gap of medGaps.slice(0, 10)) {
              console.log(
                chalk.yellow(`  ⚠ `) +
                  `"${gap.keyword}" → ` +
                  chalk.dim(`${gap.suggestedType} at ${gap.suggestedPath}`),
              );
            }
            console.log("");
          }
        }

        if (gapResult.gaps.length === 0) {
          console.log(chalk.green(`  ✓ All keyword opportunities are covered`));
          console.log("");
        }
      }
    }

    // Nudge: content gap analysis if --site wasn't used
    if (!jsonOutput && !opts.site) {
      console.log(chalk.dim("  Find content gaps → ") + chalk.bold(`npx indxel keywords "${seed}" --site yoursite.com`));
      console.log("");
    }

    // JSON output
    if (jsonOutput) {
      console.log(
        JSON.stringify(
          { keywords: kwResult, contentGaps: gapResult },
          null,
          2,
        ),
      );
    }
  });
