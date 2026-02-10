import { z } from "zod";
import { generateLD } from "indxel";
import type { StructuredDataType } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta } from "./shared.js";

const SUPPORTED_TYPES: StructuredDataType[] = [
  "Article",
  "Product",
  "FAQ",
  "HowTo",
  "Breadcrumb",
  "Organization",
  "WebPage",
  "SoftwareApplication",
  "WebSite",
];

export function registerSeoGenerateStructuredData(server: McpServer) {
  server.tool(
    "seo_generate_structured_data",
    "Generate JSON-LD structured data for a given schema type. Returns the JSON-LD object and a ready-to-use <script> tag snippet.",
    {
      type: z
        .enum(SUPPORTED_TYPES as [string, ...string[]])
        .describe("Schema.org type: Article, Product, FAQ, HowTo, Breadcrumb, Organization, WebPage, SoftwareApplication, WebSite"),
      data: z
        .record(z.string(), z.unknown())
        .describe("Data fields for the structured data (varies by type). E.g. for Article: { headline, datePublished, author }"),
    },
    async (args) => {
      try {
        const ld = generateLD(args.type as StructuredDataType, args.data as Record<string, unknown>);

        const lines: string[] = [];
        lines.push(`JSON-LD (${args.type}):`);
        lines.push("");
        lines.push("```json");
        lines.push(JSON.stringify(ld, null, 2));
        lines.push("```");
        lines.push("");
        lines.push("Script tag for Next.js:");
        lines.push("");
        lines.push("```tsx");
        lines.push("<script");
        lines.push('  type="application/ld+json"');
        lines.push(`  dangerouslySetInnerHTML={{ __html: ${JSON.stringify(JSON.stringify(ld))} }}`);
        lines.push("/>");
        lines.push("```");

        return {
          content: [
            {
              type: "text" as const,
              text: withCta(lines.join("\n"), "generate"),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating structured data: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
