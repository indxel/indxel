import { z } from "zod";
import { crawlSite } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta } from "./shared.js";

export function registerSeoCrawl(server: McpServer) {
  server.tool(
    "seo_crawl",
    "Crawl a website starting from a URL, following internal links. Audits SEO metadata on every page found. Returns per-page scores, errors, and a site-wide summary.",
    {
      url: z.string().url().describe("Start URL to crawl"),
      max_pages: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum pages to crawl (default: 30, max: 500)"),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum link depth (default: 5)"),
      strict: z.boolean().optional().describe("Treat warnings as errors"),
    },
    async (args) => {
      try {
        const result = await crawlSite(args.url, {
          maxPages: args.max_pages ?? 30,
          maxDepth: args.max_depth ?? 5,
          delay: 200,
          strict: args.strict,
        });

        const lines: string[] = [];
        lines.push(`Crawl Report: ${result.domain}`);
        lines.push(`Pages: ${result.totalPages} | Score: ${result.averageScore}/100 (${result.grade}) | Errors: ${result.totalErrors} | Warnings: ${result.totalWarnings}`);
        lines.push(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
        lines.push("");

        for (const page of result.pages) {
          if (page.error) {
            lines.push(`[ERROR] ${page.url} — ${page.error}`);
            continue;
          }

          const status = page.validation.errors.length > 0 ? "FAIL" : "PASS";
          lines.push(`[${status}] ${page.url} — ${page.validation.score}/100`);

          for (const error of page.validation.errors) {
            lines.push(`  [FAIL] ${error.name}: ${error.message ?? error.description}`);
          }
          for (const warning of page.validation.warnings) {
            lines.push(`  [WARN] ${warning.name}: ${warning.message ?? warning.description}`);
          }
        }

        // Cross-page analysis
        const a = result.analysis;
        const hasAnalysis =
          a.duplicateTitles.length > 0 ||
          a.duplicateDescriptions.length > 0 ||
          a.h1Issues.length > 0 ||
          a.brokenInternalLinks.length > 0 ||
          a.redirects.length > 0 ||
          a.thinContentPages.length > 0 ||
          a.orphanPages.length > 0 ||
          a.structuredDataSummary.length > 0;

        if (hasAnalysis) {
          lines.push("");
          lines.push("--- Cross-Page Analysis ---");

          if (a.duplicateTitles.length > 0) {
            lines.push("");
            lines.push(`Duplicate Titles (${a.duplicateTitles.length}):`);
            for (const d of a.duplicateTitles) {
              lines.push(`  "${d.title}"`);
              for (const u of d.urls) lines.push(`    - ${u}`);
            }
          }

          if (a.duplicateDescriptions.length > 0) {
            lines.push("");
            lines.push(`Duplicate Descriptions (${a.duplicateDescriptions.length}):`);
            for (const d of a.duplicateDescriptions) {
              lines.push(`  "${d.description.slice(0, 80)}${d.description.length > 80 ? "..." : ""}"`);
              for (const u of d.urls) lines.push(`    - ${u}`);
            }
          }

          if (a.h1Issues.length > 0) {
            lines.push("");
            lines.push(`H1 Issues (${a.h1Issues.length}):`);
            for (const h of a.h1Issues) {
              lines.push(`  [${h.issue.toUpperCase()}] ${h.url}${h.issue === "multiple" ? ` (${h.count} H1s)` : ""}`);
            }
          }

          if (a.brokenInternalLinks.length > 0) {
            lines.push("");
            lines.push(`Broken Internal Links (${a.brokenInternalLinks.length}):`);
            for (const b of a.brokenInternalLinks) {
              lines.push(`  ${b.from} → ${b.to} (${b.status})`);
            }
          }

          if (a.redirects.length > 0) {
            lines.push("");
            lines.push(`Redirect Chains (${a.redirects.length}):`);
            for (const r of a.redirects) {
              lines.push(`  ${r.url}: ${r.chain.join(" → ")}`);
            }
          }

          if (a.thinContentPages.length > 0) {
            lines.push("");
            lines.push(`Thin Content (< 200 words) (${a.thinContentPages.length}):`);
            for (const t of a.thinContentPages) {
              lines.push(`  ${t.url} — ${t.wordCount} words${t.isAppPage ? " (app page)" : ""}`);
            }
          }

          if (a.orphanPages.length > 0) {
            lines.push("");
            lines.push(`Orphan Pages — 0 inlinks (${a.orphanPages.length}):`);
            for (const u of a.orphanPages) {
              lines.push(`  ${u}`);
            }
          }

          if (a.structuredDataSummary.length > 0) {
            lines.push("");
            lines.push("Structured Data:");
            for (const s of a.structuredDataSummary) {
              lines.push(`  ${s.type}: ${s.count} page${s.count > 1 ? "s" : ""}`);
            }
          }

          if (a.slowestPages.length > 0) {
            lines.push("");
            lines.push("Slowest Pages:");
            for (const s of a.slowestPages.slice(0, 5)) {
              lines.push(`  ${s.url} — ${s.responseTimeMs}ms`);
            }
          }
        }

        if (result.skippedUrls.length > 0) {
          lines.push("");
          lines.push(`Skipped ${result.skippedUrls.length} URLs (over limit)`);
        }

        return {
          content: [{ type: "text" as const, text: withCta(lines.join("\n"), "crawl") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Crawl failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
