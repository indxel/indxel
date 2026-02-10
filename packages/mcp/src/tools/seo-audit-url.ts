import { z } from "zod";
import { validateMetadata, extractMetadataFromHtml, safeFetch, validatePublicUrl } from "indxel";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatValidationResult } from "./seo-check.js";
import { withCta } from "./shared.js";

export function registerSeoAuditUrl(server: McpServer) {
  server.tool(
    "seo_audit_url",
    "Fetch a live URL, extract SEO metadata from the HTML, and run a full audit. Returns score, grade, extracted metadata, and issues found.",
    {
      url: z.string().url().describe("The URL to audit"),
    },
    async (args) => {
      try {
        validatePublicUrl(args.url);
        const response = await safeFetch(args.url, {
          headers: {
            "User-Agent": "Indxel-MCP/0.1 (SEO audit bot)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to fetch ${args.url}: HTTP ${response.status} ${response.statusText}`,
              },
            ],
            isError: true,
          };
        }

        const html = await response.text();
        const metadata = extractMetadataFromHtml(html);
        const result = validateMetadata(metadata);

        const lines: string[] = [];
        lines.push(`URL: ${args.url}`);
        lines.push("");
        lines.push("--- Extracted Metadata ---");
        lines.push(`Title: ${metadata.title ?? "(missing)"}`);
        lines.push(`Description: ${metadata.description ?? "(missing)"}`);
        lines.push(`Canonical: ${metadata.canonical ?? "(missing)"}`);
        lines.push(`OG Title: ${metadata.ogTitle ?? "(missing)"}`);
        lines.push(`OG Description: ${metadata.ogDescription ?? "(missing)"}`);
        lines.push(`OG Image: ${metadata.ogImage ?? "(missing)"}`);
        lines.push(`Twitter Card: ${metadata.twitterCard ?? "(missing)"}`);
        lines.push(`Robots: ${metadata.robots ?? "(missing)"}`);
        lines.push(`Viewport: ${metadata.viewport ? "present" : "(missing)"}`);
        lines.push(`Favicon: ${metadata.favicon ? "present" : "(missing)"}`);
        lines.push(`Structured Data: ${metadata.structuredData?.length ?? 0} JSON-LD block(s)`);
        lines.push("");
        lines.push("--- Audit Results ---");
        lines.push(formatValidationResult(result));

        return {
          content: [
            {
              type: "text" as const,
              text: withCta(lines.join("\n"), "audit"),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error auditing ${args.url}: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
