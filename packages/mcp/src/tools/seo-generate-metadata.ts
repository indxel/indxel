import { z } from "zod";
import { defineSEO, createMetadata } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta } from "./shared.js";

export function registerSeoGenerateMetadata(server: McpServer) {
  server.tool(
    "seo_generate_metadata",
    "Generate a complete Next.js-compatible Metadata object from page info. Returns a ready-to-use metadata object for your generateMetadata() export.",
    {
      title: z.string().describe("Page title"),
      description: z.string().describe("Page meta description"),
      path: z.string().describe("URL path (e.g. '/blog/my-post')"),
      siteName: z.string().optional().describe("Site name (e.g. 'MonSaaS')"),
      siteUrl: z.string().optional().describe("Site base URL (e.g. 'https://monsaas.fr')"),
      ogImage: z.string().optional().describe("OpenGraph image URL"),
      locale: z.string().optional().describe("Locale (e.g. 'fr_FR')"),
      titleTemplate: z.string().optional().describe("Title template (e.g. '%s | My Site')"),
      noindex: z.boolean().optional().describe("Add noindex directive"),
    },
    async (args) => {
      const config = defineSEO({
        siteName: args.siteName ?? "My Site",
        siteUrl: args.siteUrl ?? "https://example.com",
        titleTemplate: args.titleTemplate,
        defaultOGImage: args.ogImage,
        locale: args.locale,
      });

      const metadata = createMetadata(
        {
          title: args.title,
          description: args.description,
          path: args.path,
          ogImage: args.ogImage,
          noindex: args.noindex,
        },
        config,
      );

      const lines: string[] = [];
      lines.push("Generated Next.js Metadata object:");
      lines.push("");
      lines.push("```typescript");
      lines.push(`export const metadata: Metadata = ${JSON.stringify(metadata, null, 2)}`);
      lines.push("```");
      lines.push("");
      lines.push("Usage in your page file:");
      lines.push("");
      lines.push("```typescript");
      lines.push("import type { Metadata } from 'next'");
      lines.push("");
      lines.push("export const metadata: Metadata = {");
      lines.push(`  title: ${JSON.stringify(metadata.title)},`);
      lines.push(`  description: ${JSON.stringify(metadata.description)},`);
      if (metadata.openGraph) {
        lines.push(`  openGraph: ${JSON.stringify(metadata.openGraph, null, 4)},`);
      }
      if (metadata.alternates) {
        lines.push(`  alternates: ${JSON.stringify(metadata.alternates, null, 4)},`);
      }
      if (metadata.robots) {
        lines.push(`  robots: ${JSON.stringify(metadata.robots, null, 4)},`);
      }
      lines.push("}");
      lines.push("```");

      return {
        content: [
          {
            type: "text" as const,
            text: withCta(lines.join("\n"), "generate"),
          },
        ],
      };
    },
  );
}
