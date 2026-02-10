import { z } from "zod";
import { fetchSitemap, compareSitemap } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta } from "./shared.js";

export function registerSeoCheckSitemap(server: McpServer) {
  server.tool(
    "seo_check_sitemap",
    "Fetch and analyze a site's sitemap.xml. Returns all listed URLs, checks for issues, and optionally compares with a list of known page URLs to find discrepancies.",
    {
      url: z.string().url().describe("Base URL of the site (e.g., https://example.com)"),
      sitemap_path: z
        .string()
        .optional()
        .describe("Custom sitemap path (default: /sitemap.xml)"),
      known_urls: z
        .array(z.string())
        .optional()
        .describe("Known page URLs to compare against sitemap"),
    },
    async (args) => {
      try {
        const result = await fetchSitemap(args.url, args.sitemap_path);

        const lines: string[] = [];
        lines.push(`Sitemap: ${result.url}`);
        lines.push(`Found: ${result.found ? "yes" : "no"}`);

        if (!result.found) {
          lines.push("");
          for (const e of result.errors) {
            lines.push(`Error: ${e}`);
          }
          lines.push("");
          lines.push("Recommendation: Create a sitemap.xml to help search engines discover your pages.");
          return {
            content: [{ type: "text" as const, text: withCta(lines.join("\n"), "technical") }],
          };
        }

        lines.push(`URLs: ${result.urls.length}`);

        if (result.errors.length > 0) {
          lines.push("");
          lines.push("Errors:");
          for (const e of result.errors) {
            lines.push(`  - ${e}`);
          }
        }

        lines.push("");
        lines.push("URLs in sitemap:");
        for (const u of result.urls) {
          let line = `  ${u.loc}`;
          if (u.lastmod) line += ` (lastmod: ${u.lastmod})`;
          lines.push(line);
        }

        // Compare with known URLs if provided
        if (args.known_urls && args.known_urls.length > 0) {
          const comparison = compareSitemap(
            result.urls.map((u) => u.loc),
            args.known_urls,
          );

          lines.push("");
          lines.push("--- Comparison ---");
          lines.push(`In both: ${comparison.inBoth.length}`);
          lines.push(`In sitemap only: ${comparison.inSitemapOnly.length}`);
          lines.push(`In known URLs only: ${comparison.inCrawlOnly.length}`);

          if (comparison.inCrawlOnly.length > 0) {
            lines.push("");
            lines.push("Missing from sitemap:");
            for (const u of comparison.inCrawlOnly) {
              lines.push(`  - ${u}`);
            }
          }

          if (comparison.inSitemapOnly.length > 0) {
            lines.push("");
            lines.push("In sitemap but not in known URLs:");
            for (const u of comparison.inSitemapOnly) {
              lines.push(`  - ${u}`);
            }
          }

          for (const issue of comparison.issues) {
            lines.push(`\nIssue: ${issue}`);
          }
        }

        return {
          content: [{ type: "text" as const, text: withCta(lines.join("\n"), "technical") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Sitemap check failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
