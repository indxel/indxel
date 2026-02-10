import { z } from "zod";
import { verifyAssets } from "indxel";
import type { ResolvedMetadata } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta } from "./shared.js";

export function registerSeoVerifyAssets(server: McpServer) {
  server.tool(
    "seo_verify_assets",
    "Verify that all SEO assets (og:image, favicon, canonical URLs, etc.) referenced in metadata are accessible. Pass a list of pages with their metadata to check.",
    {
      pages: z
        .array(
          z.object({
            url: z.string().url().describe("Page URL"),
            og_image: z.string().optional().describe("og:image URL"),
            favicon: z.string().optional().describe("Favicon URL"),
            canonical: z.string().optional().describe("Canonical URL"),
          }),
        )
        .describe("Pages with their metadata URLs to verify"),
    },
    async (args) => {
      try {
        const pages = args.pages.map((p) => ({
          url: p.url,
          metadata: {
            ogImage: p.og_image ?? null,
            favicon: p.favicon ?? null,
            canonical: p.canonical ?? null,
            title: null,
            description: null,
            ogTitle: null,
            ogDescription: null,
            ogType: null,
            twitterCard: null,
            twitterTitle: null,
            twitterDescription: null,
            robots: null,
            alternates: null,
            structuredData: null,
            viewport: null,
          } satisfies ResolvedMetadata,
        }));

        const result = await verifyAssets(pages);

        const lines: string[] = [];
        lines.push(`Asset Verification: ${result.totalChecked} checked, ${result.totalOk} OK, ${result.totalBroken} broken`);
        lines.push("");

        for (const check of result.checks) {
          if (!check.ok) {
            lines.push(`[BROKEN] ${check.type}: ${check.url} — ${check.error ?? `HTTP ${check.status}`}`);
          } else if (check.warning) {
            lines.push(`[WARN] ${check.type}: ${check.url} — ${check.warning}`);
          } else {
            lines.push(`[OK] ${check.type}: ${check.url}`);
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
              text: `Asset verification failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
