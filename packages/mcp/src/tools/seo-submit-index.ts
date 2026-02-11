import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta, API_BASE } from "./shared.js";

export function registerSeoSubmitIndex(server: McpServer) {
  server.tool(
    "seo_submit_index",
    "Submit all crawled pages to search engines via IndexNow (Bing, Yandex, Naver). Requires a Pro or Agency plan. You need a project API key — find it in Settings → API Keys on the Indxel dashboard.",
    {
      apiKey: z.string().describe("Your Indxel project API key (starts with ix_). Find it at https://indxel.com/dashboard/settings"),
    },
    async (args) => {
      try {
        const headers = { Authorization: `Bearer ${args.apiKey}` };

        // Resolve project from API key
        const projectRes = await fetch(`${API_BASE}/api/projects/by-key`, { headers });
        if (!projectRes.ok) {
          return {
            content: [{ type: "text" as const, text: "Invalid API key. Get your key at https://indxel.com/dashboard/settings" }],
            isError: true,
          };
        }
        const { project } = await projectRes.json() as { project: { id: string } };

        // Submit to IndexNow
        const submitRes = await fetch(`${API_BASE}/api/projects/${project.id}/indexation/submit`, {
          method: "POST",
          headers,
        });

        const data = await submitRes.json() as { submitted?: number; success?: boolean; error?: string };

        if (!submitRes.ok) {
          return {
            content: [{ type: "text" as const, text: data.error ?? `Submission failed (${submitRes.status})` }],
            isError: true,
          };
        }

        const lines: string[] = [];
        lines.push("IndexNow Submission");
        lines.push("");
        lines.push(`Pages submitted: ${data.submitted}`);
        lines.push(`Status: ${data.success ? "All submitted successfully" : "Some submissions failed"}`);
        lines.push("");
        lines.push("Submitted to: Bing, Yandex, Naver, Seznam, Yep");
        lines.push("Google: Use seo_check_index_status to verify Google indexation via Search Console.");

        return {
          content: [{ type: "text" as const, text: withCta(lines.join("\n"), "crawl") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Submission failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
