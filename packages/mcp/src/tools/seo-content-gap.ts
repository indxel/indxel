import { z } from "zod";
import { researchKeywords, crawlSite, analyzeContentGaps } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta } from "./shared.js";

export function registerSeoContentGap(server: McpServer) {
  server.tool(
    "seo_content_gap",
    "Find content opportunities by comparing keyword research against existing pages on a site. Crawls the site, researches keywords for a topic, and shows which keywords are not covered by any existing page. Use this to plan new pages for SEO.",
    {
      url: z.string().url().describe("Site URL to analyze"),
      seed: z.string().describe("Seed keyword/topic for research"),
      locale: z.string().optional().describe("Language locale (default: 'en')"),
      country: z.string().optional().describe("Country code (default: 'us')"),
      max_pages: z.number().int().min(1).max(100).optional().describe("Max pages to crawl (default: 30)"),
    },
    async (args) => {
      try {
        // Run keyword research and crawl in parallel
        const [keywordResult, crawlResult] = await Promise.all([
          researchKeywords(args.seed, {
            locale: args.locale,
            country: args.country,
          }),
          crawlSite(args.url, {
            maxPages: args.max_pages ?? 30,
            delay: 200,
          }),
        ]);

        // Combine all keywords
        const allKeywords = [
          ...keywordResult.suggestions,
          ...keywordResult.questions,
          ...keywordResult.longTail,
        ];

        // Analyze gaps
        const existingPages = crawlResult.pages
          .filter((p) => !p.error)
          .map((p) => ({ url: p.url, metadata: p.metadata }));

        const gapResult = analyzeContentGaps(allKeywords, existingPages);

        const lines: string[] = [];
        lines.push(`Content Gap Analysis: "${args.seed}" on ${crawlResult.domain}`);
        lines.push(`Keywords researched: ${gapResult.totalKeywords}`);
        lines.push(`Already covered: ${gapResult.totalCovered} (${gapResult.coveragePercent}%)`);
        lines.push(`Opportunities: ${gapResult.totalGaps}`);
        lines.push("");

        if (gapResult.gaps.length > 0) {
          // Group by relevance
          const highGaps = gapResult.gaps.filter((g) => g.relevance === "high");
          const medGaps = gapResult.gaps.filter((g) => g.relevance === "medium");
          const lowGaps = gapResult.gaps.filter((g) => g.relevance === "low");

          if (highGaps.length > 0) {
            lines.push(`--- High Priority (${highGaps.length}) ---`);
            for (const gap of highGaps.slice(0, 20)) {
              lines.push(`  "${gap.keyword}" → ${gap.suggestedType} page at ${gap.suggestedPath}`);
            }
            lines.push("");
          }

          if (medGaps.length > 0) {
            lines.push(`--- Medium Priority (${medGaps.length}) ---`);
            for (const gap of medGaps.slice(0, 15)) {
              lines.push(`  "${gap.keyword}" → ${gap.suggestedType} page at ${gap.suggestedPath}`);
            }
            lines.push("");
          }

          if (lowGaps.length > 0) {
            lines.push(`--- Low Priority (${lowGaps.length}) ---`);
            for (const gap of lowGaps.slice(0, 10)) {
              lines.push(`  "${gap.keyword}" → ${gap.suggestedType} page at ${gap.suggestedPath}`);
            }
            lines.push("");
          }
        }

        if (gapResult.covered.length > 0) {
          lines.push(`--- Already Covered (${gapResult.covered.length}) ---`);
          for (const c of gapResult.covered.slice(0, 10)) {
            lines.push(`  "${c.keyword}" → ${c.coveredBy}`);
          }
          if (gapResult.covered.length > 10) {
            lines.push(`  ... and ${gapResult.covered.length - 10} more`);
          }
        }

        return {
          content: [{ type: "text" as const, text: withCta(lines.join("\n"), "research") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Content gap analysis failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
