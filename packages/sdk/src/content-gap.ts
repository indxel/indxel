/**
 * Content gap analyzer — find keyword opportunities your site is missing.
 * Compares keyword research results against existing page content.
 */

import type { CrawledPage } from "./crawler.js";
import type { KeywordSuggestion } from "./keyword-research.js";

export interface ContentGap {
  /** The keyword opportunity */
  keyword: string;
  /** Source of the suggestion */
  source: KeywordSuggestion["source"];
  /** How relevant this keyword is based on the seed (higher = better) */
  relevance: "high" | "medium" | "low";
  /** Suggested page type */
  suggestedType: "landing" | "blog" | "faq" | "comparison" | "guide";
  /** Suggested URL path */
  suggestedPath: string;
}

export interface ContentGapResult {
  /** Keywords already covered by existing pages */
  covered: Array<{
    keyword: string;
    coveredBy: string; // URL of the page that covers it
  }>;
  /** Keywords not covered — opportunities */
  gaps: ContentGap[];
  /** Summary stats */
  totalKeywords: number;
  totalCovered: number;
  totalGaps: number;
  coveragePercent: number;
}

/**
 * Analyze content gaps: which keyword opportunities are your existing pages missing?
 */
export function analyzeContentGaps(
  keywords: KeywordSuggestion[],
  existingPages: Array<{ url: string; metadata: CrawledPage["metadata"] }>,
): ContentGapResult {
  const covered: ContentGapResult["covered"] = [];
  const gaps: ContentGap[] = [];

  // Build searchable index of existing content
  const pageTexts = existingPages.map((page) => ({
    url: page.url,
    searchText: [
      page.metadata.title ?? "",
      page.metadata.description ?? "",
      page.metadata.ogTitle ?? "",
      new URL(page.url).pathname.replace(/[-/]/g, " "),
    ]
      .join(" ")
      .toLowerCase(),
  }));

  for (const kw of keywords) {
    const keywordLower = kw.keyword.toLowerCase();
    const keywordWords = keywordLower.split(/\s+/).filter((w) => w.length > 2);

    // Check if any existing page covers this keyword
    let coveringPage: string | null = null;

    for (const page of pageTexts) {
      // Check if the keyword or most of its words appear in the page
      const exactMatch = page.searchText.includes(keywordLower);
      const wordMatchCount = keywordWords.filter((w) =>
        page.searchText.includes(w),
      ).length;
      const wordMatchRatio =
        keywordWords.length > 0 ? wordMatchCount / keywordWords.length : 0;

      if (exactMatch || wordMatchRatio >= 0.7) {
        coveringPage = page.url;
        break;
      }
    }

    if (coveringPage) {
      covered.push({ keyword: kw.keyword, coveredBy: coveringPage });
    } else {
      gaps.push({
        keyword: kw.keyword,
        source: kw.source,
        relevance: inferRelevance(kw),
        suggestedType: inferPageType(kw.keyword),
        suggestedPath: keywordToPath(kw.keyword),
      });
    }
  }

  // Sort gaps: high relevance first, then medium, then low
  const relevanceOrder = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => relevanceOrder[a.relevance] - relevanceOrder[b.relevance]);

  const totalKeywords = keywords.length;
  const totalCovered = covered.length;
  const totalGaps = gaps.length;
  const coveragePercent =
    totalKeywords > 0 ? Math.round((totalCovered / totalKeywords) * 100) : 100;

  return { covered, gaps, totalKeywords, totalCovered, totalGaps, coveragePercent };
}

// -- Internal helpers --

function inferRelevance(kw: KeywordSuggestion): ContentGap["relevance"] {
  if (kw.source === "autocomplete") return "high";
  if (kw.source === "question") return "high";
  if (kw.source === "preposition") return "medium";
  return "low"; // alphabet expansion
}

function inferPageType(keyword: string): ContentGap["suggestedType"] {
  const lower = keyword.toLowerCase();

  if (
    lower.startsWith("what is") ||
    lower.startsWith("how to") ||
    lower.startsWith("guide") ||
    lower.includes("tutorial") ||
    lower.includes("step by step")
  ) {
    return "guide";
  }

  if (
    lower.includes("vs") ||
    lower.includes("versus") ||
    lower.includes("alternative") ||
    lower.includes("compared")
  ) {
    return "comparison";
  }

  if (
    lower.startsWith("can ") ||
    lower.startsWith("is ") ||
    lower.startsWith("does ") ||
    lower.startsWith("why ") ||
    lower.startsWith("when ")
  ) {
    return "faq";
  }

  if (
    lower.includes("best") ||
    lower.includes("top") ||
    lower.includes("review")
  ) {
    return "blog";
  }

  return "landing";
}

function keywordToPath(keyword: string): string {
  const slug = keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Prefix based on inferred type
  const type = inferPageType(keyword);
  switch (type) {
    case "blog":
    case "guide":
      return `/blog/${slug}`;
    case "comparison":
      return `/compare/${slug}`;
    case "faq":
      return `/faq#${slug}`;
    default:
      return `/${slug}`;
  }
}
