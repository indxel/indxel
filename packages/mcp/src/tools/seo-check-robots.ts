import { z } from "zod";
import { fetchRobots, checkUrlsAgainstRobots } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta } from "./shared.js";

export function registerSeoCheckRobots(server: McpServer) {
  server.tool(
    "seo_check_robots",
    "Fetch and analyze a site's robots.txt. Returns directives, sitemap references, warnings, and optionally checks if specific URLs are blocked.",
    {
      url: z.string().url().describe("Base URL of the site"),
      check_urls: z
        .array(z.string())
        .optional()
        .describe("URLs to check if they are blocked by robots.txt"),
    },
    async (args) => {
      try {
        const result = await fetchRobots(args.url);

        const lines: string[] = [];
        lines.push(`robots.txt: ${result.url}`);
        lines.push(`Found: ${result.found ? "yes" : "no"}`);

        if (!result.found) {
          for (const e of result.errors) {
            lines.push(`Error: ${e}`);
          }
          return {
            content: [{ type: "text" as const, text: withCta(lines.join("\n"), "technical") }],
          };
        }

        // Directives
        lines.push("");
        lines.push("Directives:");
        for (const d of result.directives) {
          lines.push(`  User-agent: ${d.userAgent}`);
          for (const a of d.allow) {
            lines.push(`    Allow: ${a}`);
          }
          for (const dis of d.disallow) {
            lines.push(`    Disallow: ${dis}`);
          }
        }

        // Sitemaps
        if (result.sitemapUrls.length > 0) {
          lines.push("");
          lines.push("Sitemap references:");
          for (const s of result.sitemapUrls) {
            lines.push(`  ${s}`);
          }
        }

        // Warnings
        if (result.warnings.length > 0) {
          lines.push("");
          lines.push("Warnings:");
          for (const w of result.warnings) {
            lines.push(`  ⚠ ${w}`);
          }
        }

        // Check specific URLs
        if (args.check_urls && args.check_urls.length > 0) {
          const checks = checkUrlsAgainstRobots(
            result.directives,
            args.check_urls,
          );

          lines.push("");
          lines.push("URL access check:");
          for (const check of checks) {
            if (check.blocked) {
              lines.push(`  [BLOCKED] ${check.path} — ${check.blockedBy}`);
            } else {
              lines.push(`  [ALLOWED] ${check.path}`);
            }
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
              text: `Robots check failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
