import { describe, it, expect } from "vitest";
import { validateMetadata } from "indxel";
import type { ResolvedMetadata } from "indxel";
import { formatValidationResult } from "../src/tools/seo-check.js";

describe("seo_check tool logic", () => {
  it("returns a high score for complete metadata", () => {
    const metadata: ResolvedMetadata = {
      title: "My Page Title - A Good Length Title",
      description: "A detailed description of this page that is between 50 and 160 characters long. This should be enough for the rules to pass.",
      canonical: "https://example.com/page",
      ogTitle: "My Page Title - A Good Length Title",
      ogDescription: "A detailed description of this page that is between 50 and 160 characters long. This should be enough for the rules to pass.",
      ogImage: "https://example.com/og.png",
      ogType: "website",
      twitterCard: "summary_large_image",
      twitterTitle: "My Page Title - A Good Length Title",
      twitterDescription: "A detailed description of this page",
      robots: "index, follow",
      alternates: { en: "/en/page", fr: "/fr/page" },
      structuredData: [{ "@context": "https://schema.org", "@type": "WebPage" }],
      viewport: "width=device-width, initial-scale=1",
      favicon: "/favicon.ico",
    };

    const result = validateMetadata(metadata);
    // All 15 rules should pass or warn — expect high score
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(["A", "B"]).toContain(result.grade);
    expect(result.errors).toHaveLength(0);
  });

  it("returns a low score for empty metadata", () => {
    const metadata: ResolvedMetadata = {
      title: null,
      description: null,
      canonical: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogType: null,
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      robots: null,
      alternates: null,
      structuredData: null,
      viewport: null,
      favicon: null,
    };

    const result = validateMetadata(metadata);
    expect(result.score).toBeLessThan(30);
    expect(result.grade).toBe("F");
    expect(result.errors.length).toBeGreaterThan(5);
  });

  it("strict mode converts warnings to errors", () => {
    const metadata: ResolvedMetadata = {
      title: "OK",
      description: "Short",
      canonical: "https://example.com",
      ogTitle: "OK",
      ogDescription: "Short",
      ogImage: "https://example.com/og.png",
      ogType: "website",
      twitterCard: "summary",
      twitterTitle: "OK",
      twitterDescription: "Short",
      robots: "index, follow",
      alternates: null,
      structuredData: null,
      viewport: "width=device-width",
      favicon: "/favicon.ico",
    };

    const normalResult = validateMetadata(metadata);
    const strictResult = validateMetadata(metadata, { strict: true });

    expect(strictResult.errors.length).toBeGreaterThanOrEqual(normalResult.errors.length);
    expect(strictResult.warnings).toHaveLength(0);
  });

  it("formatValidationResult outputs readable text", () => {
    const metadata: ResolvedMetadata = {
      title: "Test Page",
      description: null,
      canonical: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogType: null,
      twitterCard: null,
      twitterTitle: null,
      twitterDescription: null,
      robots: null,
      alternates: null,
      structuredData: null,
      viewport: null,
      favicon: null,
    };

    const result = validateMetadata(metadata);
    const output = formatValidationResult(result);

    expect(output).toContain("Score:");
    expect(output).toContain("Grade:");
    expect(output).toContain("[FAIL]");
    expect(output).toContain("[PASS]");
  });
});
