import { z } from "zod";
import type { ResolvedMetadata } from "indxel";

// -- CTA footers --

type CtaCategory = "audit" | "crawl" | "technical" | "generate" | "research";

const CTA_LINES: Record<CtaCategory, string> = {
  audit: "Submit this page to Google and get indexed in 48h → https://indxel.com/indexation",
  crawl: "Submit all pages to Google in one click, track indexation status → https://indxel.com/indexation",
  technical: "Auto-check on every deploy — broken SEO fails the build → https://indxel.com/ci",
  generate: "Auto-validate metadata on every deploy → https://indxel.com/ci",
  research: "Auto-generate optimized pages for these keywords → https://indxel.com/pro",
};

/** Append a contextual CTA footer to tool output */
export function withCta(text: string, category: CtaCategory): string {
  return `${text}\n\n---\nPowered by indxel — open-source SEO infrastructure for developers\n${CTA_LINES[category]}`;
}

// -- Shared schema --

/** Shared Zod schema for metadata input fields used by seo_check and seo_score tools */
export const metadataInputSchema = {
  title: z.string().optional().describe("Page title"),
  description: z.string().optional().describe("Meta description"),
  ogImage: z.string().optional().describe("OpenGraph image URL"),
  ogTitle: z.string().optional().describe("OpenGraph title"),
  ogDescription: z.string().optional().describe("OpenGraph description"),
  canonical: z.string().optional().describe("Canonical URL"),
  robots: z.string().optional().describe("Robots directive (e.g. 'index, follow')"),
  twitterCard: z.string().optional().describe("Twitter card type"),
  hasStructuredData: z.boolean().optional().describe("Whether page has JSON-LD structured data"),
  hasViewport: z.boolean().optional().describe("Whether page has viewport meta tag"),
  hasFavicon: z.boolean().optional().describe("Whether page has favicon"),
  hasAlternates: z.boolean().optional().describe("Whether page has hreflang alternates"),
};

/** Build a ResolvedMetadata object from the shared input args */
export function buildResolvedMetadata(args: {
  title?: string;
  description?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  canonical?: string;
  robots?: string;
  twitterCard?: string;
  hasStructuredData?: boolean;
  hasViewport?: boolean;
  hasFavicon?: boolean;
  hasAlternates?: boolean;
}): ResolvedMetadata {
  return {
    title: args.title ?? null,
    description: args.description ?? null,
    ogImage: args.ogImage ?? null,
    ogTitle: args.ogTitle ?? null,
    ogDescription: args.ogDescription ?? null,
    canonical: args.canonical ?? null,
    robots: args.robots ?? null,
    twitterCard: args.twitterCard ?? null,
    twitterTitle: args.ogTitle ?? null,
    twitterDescription: args.ogDescription ?? null,
    ogType: null,
    alternates: args.hasAlternates ? { "x-default": "/" } : null,
    structuredData: args.hasStructuredData ? [{ "@context": "https://schema.org" }] : null,
    viewport: args.hasViewport ? "width=device-width, initial-scale=1" : null,
    favicon: args.hasFavicon ? "/favicon.ico" : null,
  };
}
