import { validateMetadata } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { metadataInputSchema, buildResolvedMetadata, withCta } from "./shared.js";

export function registerSeoScore(server: McpServer) {
  server.tool(
    "seo_score",
    "Quick SEO score check. Returns just the numeric score (0-100) and letter grade (A-F). Faster than seo_check when you only need the headline number.",
    metadataInputSchema,
    async (args) => {
      const metadata = buildResolvedMetadata(args);
      const result = validateMetadata(metadata);

      return {
        content: [
          {
            type: "text" as const,
            text: withCta(`${result.score}/100 (${result.grade}) — ${result.errors.length} error(s), ${result.warnings.length} warning(s), ${result.passed.length} passed`, "audit"),
          },
        ],
      };
    },
  );
}
