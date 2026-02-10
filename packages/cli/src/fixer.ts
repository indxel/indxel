import chalk from "chalk";
import type { CheckResult } from "./formatter.js";

/**
 * Generate suggested metadata code snippets for pages with errors.
 * Returns an array of formatted strings ready for terminal output.
 */
export function generateFixSuggestions(
  results: CheckResult[],
  baseUrl?: string,
): string[] {
  const output: string[] = [];
  const siteUrl = baseUrl ?? "https://yoursite.com";

  for (const { page, validation } of results) {
    if (validation.errors.length === 0 && validation.warnings.length === 0) continue;

    const errorIds = new Set(validation.errors.map((e) => e.id));
    const warnIds = new Set(validation.warnings.map((w) => w.id));
    const allIds = new Set([...errorIds, ...warnIds]);

    // Build a metadata object suggestion based on what's missing
    const meta: Record<string, unknown> = {};
    const extras: string[] = [];

    // Title
    if (allIds.has("title-present")) {
      const suggestion = routeToTitle(page.route);
      meta.title = { absolute: suggestion };
    } else if (allIds.has("title-length")) {
      const current = page.extractedMetadata.title ?? "";
      const len = current.length;
      if (len < 50) {
        extras.push(`  ${chalk.dim("// Title is " + len + " chars — expand to 50-60")}`);
      } else if (len > 60) {
        extras.push(`  ${chalk.dim("// Title is " + len + " chars — shorten to 50-60")}`);
      }
    }

    // Description
    if (allIds.has("description-present")) {
      meta.description = routeToDescription(page.route);
    } else if (allIds.has("description-length")) {
      const current = page.extractedMetadata.description ?? "";
      const len = current.length;
      if (len < 120) {
        extras.push(`  ${chalk.dim("// Description is " + len + " chars — expand to 120-160")}`);
      } else if (len > 160) {
        extras.push(`  ${chalk.dim("// Description is " + len + " chars — shorten to 120-160")}`);
      }
    }

    // Canonical
    if (allIds.has("canonical-url")) {
      const canonical = `${siteUrl}${page.route === "/" ? "" : page.route}`;
      meta.alternates = { canonical };
    }

    // OG Image
    if (allIds.has("og-image")) {
      meta.openGraph = { images: [`${siteUrl}/og-image.png`] };
    }

    // Structured data
    if (allIds.has("structured-data-present")) {
      extras.push(`  ${chalk.dim("// Add JSON-LD structured data (WebPage, Article, FAQ...)")}`);
      extras.push(`  ${chalk.dim("// See: https://developers.google.com/search/docs/appearance/structured-data")}`);
    }

    // Twitter
    if (allIds.has("twitter-card")) {
      meta.twitter = { card: "summary_large_image" };
    }

    // Skip pages with no actionable suggestions
    if (Object.keys(meta).length === 0 && extras.length === 0) continue;

    output.push(chalk.bold(`  ${chalk.cyan(page.filePath)}`));

    if (Object.keys(meta).length > 0) {
      const code = formatMetadataObject(meta);
      output.push(`  ${chalk.dim("Add/update in your page file:")}`);
      output.push("");
      for (const line of code.split("\n")) {
        output.push(`    ${chalk.yellow(line)}`);
      }
    }

    for (const extra of extras) {
      output.push(extra);
    }

    output.push("");
  }

  return output;
}

/** Generate a reasonable title suggestion from a route */
function routeToTitle(route: string): string {
  if (route === "/") return "Your Site — A brief description of what you do";
  const segments = route.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const name = last
    .replace(/\[.*?\]/g, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return `${name || "Page"} — Your Site`;
}

/** Generate a reasonable description suggestion from a route */
function routeToDescription(route: string): string {
  if (route === "/") {
    return "A clear, compelling description of your site in 120-160 characters. Include your main value proposition and a call to action.";
  }
  const segments = route.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const name = last
    .replace(/\[.*?\]/g, "")
    .replace(/-/g, " ")
    .trim();
  return `Learn more about ${name || "this page"}. Add a compelling 120-160 character description with your key value proposition here.`;
}

/** Format a metadata object as TypeScript code */
function formatMetadataObject(meta: Record<string, unknown>): string {
  const lines: string[] = ["export const metadata: Metadata = {"];

  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === "string") {
      lines.push(`  ${key}: "${value}",`);
    } else if (typeof value === "object" && value !== null) {
      lines.push(`  ${key}: ${JSON.stringify(value, null, 2).replace(/\n/g, "\n  ")},`);
    }
  }

  lines.push("};");
  return lines.join("\n");
}
