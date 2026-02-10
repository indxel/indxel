import { allRules } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerRulesResource(server: McpServer) {
  server.resource(
    "seo-rules",
    "seo://rules",
    {
      description: "List all indxel validation rules with IDs, weights, and descriptions. Total: 100 points across 15 rules.",
    },
    async () => {
      const lines: string[] = [];
      lines.push("indxel Validation Rules");
      lines.push("============================");
      lines.push("");
      lines.push("Total: 100 points across 15 rules.");
      lines.push("Grade scale: A >= 90, B >= 80, C >= 70, D >= 60, F < 60");
      lines.push("Warnings get half credit in scoring.");
      lines.push("");

      for (const rule of allRules) {
        lines.push(`[${rule.id}] ${rule.name} (${rule.weight} pts)`);
        lines.push(`  ${rule.description}`);
        lines.push("");
      }

      return {
        contents: [
          {
            uri: "seo://rules",
            mimeType: "text/plain",
            text: lines.join("\n"),
          },
        ],
      };
    },
  );
}
