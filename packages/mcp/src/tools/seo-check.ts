import { z } from "zod";
import { validateMetadata } from "indxel";
import type { ValidationResult } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { metadataInputSchema, buildResolvedMetadata, withCta } from "./shared.js";

export function registerSeoCheck(server: McpServer) {
  server.tool(
    "seo_check",
    "Validate SEO metadata and return a score (0-100), grade (A-F), and detailed rule results. Pass metadata fields to check.",
    {
      ...metadataInputSchema,
      strict: z.boolean().optional().describe("Treat warnings as errors"),
    },
    async (args) => {
      const metadata = buildResolvedMetadata(args);
      const result = validateMetadata(metadata, { strict: args.strict });

      return {
        content: [
          {
            type: "text" as const,
            text: withCta(formatValidationResult(result), "audit"),
          },
        ],
      };
    },
  );
}

export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push(`Score: ${result.score}/100 (Grade: ${result.grade})`);
  lines.push("");

  if (result.errors.length > 0) {
    lines.push(`Errors (${result.errors.length}):`);
    for (const rule of result.errors) {
      lines.push(`  [FAIL] ${rule.name}: ${rule.message ?? rule.description}`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push(`Warnings (${result.warnings.length}):`);
    for (const rule of result.warnings) {
      lines.push(`  [WARN] ${rule.name}: ${rule.message ?? rule.description}`);
    }
    lines.push("");
  }

  if (result.passed.length > 0) {
    lines.push(`Passed (${result.passed.length}):`);
    for (const rule of result.passed) {
      lines.push(`  [PASS] ${rule.name}`);
    }
  }

  return lines.join("\n");
}
