// ============================================================================
// indxel — Infrastructure SEO developer-first
// ============================================================================
//
// Le SEO casse ne passe plus en prod. Point.
//
// Usage:
//   import { defineSEO, createMetadata, generateLD, validateMetadata } from 'indxel'
//
// ============================================================================

// Core functions
export { defineSEO } from "./define-seo.js";
export { createMetadata } from "./metadata.js";
export { generateLD } from "./structured-data.js";
export { validateMetadata, resolveFromNextMetadata } from "./validate.js";

// Types
export type {
  SEOConfig,
  PageSEO,
  StructuredDataType,
  StructuredDataInput,
  ValidationResult,
  ValidationRule,
  ValidateOptions,
  ResolvedMetadata,
  RuleDefinition,
  RuleCheckResult,
  RuleSeverity,
} from "./types.js";

export type { MetadataOutput } from "./metadata.js";

// HTML parsing
export { extractMetadataFromHtml, extractInternalLinks, extractExternalLinks, extractImages } from "./html-parser.js";
export type { ImageInfo } from "./html-parser.js";

// Crawler
export { crawlSite } from "./crawler.js";
export type { CrawlOptions, CrawledPage, CrawlResult, CrawlAnalysis } from "./crawler.js";

// Sitemap checker
export { fetchSitemap, compareSitemap } from "./sitemap.js";
export type { SitemapUrl, SitemapResult, SitemapComparison } from "./sitemap.js";

// Robots.txt checker
export { fetchRobots, checkUrlsAgainstRobots } from "./robots-checker.js";
export type { RobotsDirective, RobotsResult, RobotsUrlCheck } from "./robots-checker.js";

// Asset verifier
export { verifyAssets } from "./asset-checker.js";
export type { AssetCheck, AssetCheckResult, AssetCheckOptions } from "./asset-checker.js";

// Keyword research
export { researchKeywords } from "./keyword-research.js";
export type { KeywordSuggestion, KeywordResearchResult, KeywordResearchOptions } from "./keyword-research.js";

// Content gap analysis
export { analyzeContentGaps } from "./content-gap.js";
export type { ContentGap, ContentGapResult } from "./content-gap.js";

// SSRF-safe fetch
export { safeFetch, validatePublicUrl } from "./safe-fetch.js";

// Rules (exposed for custom rule composition)
export { allRules } from "./rules/index.js";
