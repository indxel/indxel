import { z } from "zod";
import { researchKeywords } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta } from "./shared.js";

export function registerSeoKeywordResearch(server: McpServer) {
  server.tool(
    "seo_keyword_research",
    "Research keyword opportunities for a topic using Google Autocomplete. Returns direct suggestions, question-based keywords (how to, what is...), and long-tail variations. Use this to discover what pages to create for SEO.",
    {
      seed: z.string().describe("Seed keyword or topic to research (e.g., 'nextjs seo', 'headless cms')"),
      locale: z.string().optional().describe("Language locale (default: 'en')"),
      country: z.string().optional().describe("Country code (default: 'us')"),
    },
    async (args) => {
      try {
        const result = await researchKeywords(args.seed, {
          locale: args.locale,
          country: args.country,
        });

        const lines: string[] = [];
        lines.push(`Keyword Research: "${result.seed}" (${result.locale})`);
        lines.push(`Total keywords found: ${result.totalKeywords}`);
        lines.push("");

        if (result.suggestions.length > 0) {
          lines.push(`--- Direct Suggestions (${result.suggestions.length}) ---`);
          for (const s of result.suggestions) {
            lines.push(`  ${s.keyword}`);
          }
          lines.push("");
        }

        if (result.questions.length > 0) {
          lines.push(`--- Question Keywords (${result.questions.length}) ---`);
          lines.push("These make great blog posts, FAQ pages, and guides:");
          for (const q of result.questions) {
            lines.push(`  ${q.keyword}`);
          }
          lines.push("");
        }

        if (result.longTail.length > 0) {
          lines.push(`--- Long-tail Variations (${result.longTail.length}) ---`);
          for (const lt of result.longTail) {
            lines.push(`  ${lt.keyword}`);
          }
          lines.push("");
        }

        if (result.totalKeywords === 0) {
          lines.push("No suggestions found. Try a broader or more common seed keyword.");
        }

        return {
          content: [{ type: "text" as const, text: withCta(lines.join("\n"), "research") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Keyword research failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
