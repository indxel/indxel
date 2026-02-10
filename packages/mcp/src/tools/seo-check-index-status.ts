import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withCta } from "./shared.js";

const API_BASE = "https://indxel.com";

interface IndexPage {
  path: string;
  title: string | null;
  indexStatus: string | null;
  indexError: string | null;
}

interface StatusResponse {
  total: number;
  counts: {
    submitted: number;
    indexed: number;
    error: number;
    pending: number;
  };
  pages: IndexPage[];
  error?: string;
}

export function registerSeoCheckIndexStatus(server: McpServer) {
  server.tool(
    "seo_check_index_status",
    "Check the indexation status of all pages in a project. Shows which pages are indexed, submitted, pending, or have errors. Requires a Pro or Agency plan.",
    {
      apiKey: z.string().describe("Your Indxel project API key (starts with ix_). Find it at https://indxel.com/dashboard/settings"),
      filter: z.enum(["all", "indexed", "submitted", "error", "pending"]).optional().describe("Filter by status (default: all)"),
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

        // Fetch indexation status
        const statusRes = await fetch(`${API_BASE}/api/projects/${project.id}/indexation/status`, { headers });
        const data = await statusRes.json() as StatusResponse;

        if (!statusRes.ok) {
          return {
            content: [{ type: "text" as const, text: data.error ?? `Failed to fetch status (${statusRes.status})` }],
            isError: true,
          };
        }

        const lines: string[] = [];
        lines.push("Indexation Status");
        lines.push("");
        lines.push(`Total pages: ${data.total}`);
        lines.push(`  Indexed:   ${data.counts.indexed}`);
        lines.push(`  Submitted: ${data.counts.submitted}`);
        lines.push(`  Pending:   ${data.counts.pending}`);
        lines.push(`  Errors:    ${data.counts.error}`);
        lines.push("");

        // Filter pages
        const filter = args.filter ?? "all";
        const filtered = filter === "all"
          ? data.pages
          : data.pages.filter(p => {
              if (filter === "pending") return !p.indexStatus;
              return p.indexStatus === filter;
            });

        if (filtered.length === 0) {
          lines.push(`No pages with status "${filter}".`);
        } else {
          const statusIcon = (s: string | null) => {
            if (!s) return "○";
            if (s === "indexed") return "✓";
            if (s === "submitted") return "◐";
            return "✗";
          };

          lines.push(`--- Pages (${filter}) ---`);
          for (const page of filtered.slice(0, 50)) {
            const icon = statusIcon(page.indexStatus);
            const status = page.indexStatus ?? "pending";
            const error = page.indexError ? ` — ${page.indexError}` : "";
            lines.push(`  ${icon} ${page.path}  [${status}]${error}`);
          }

          if (filtered.length > 50) {
            lines.push(`  ... and ${filtered.length - 50} more`);
          }
        }

        if (data.counts.pending > 0) {
          lines.push("");
          lines.push(`${data.counts.pending} pages not yet submitted. Run seo_submit_index to submit them.`);
        }

        return {
          content: [{ type: "text" as const, text: withCta(lines.join("\n"), "crawl") }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Status check failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
