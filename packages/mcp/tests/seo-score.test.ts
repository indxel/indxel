import { describe, it, expect } from "vitest";
import { validateMetadata } from "indxel";
import type { ResolvedMetadata } from "indxel";

describe("seo_score tool logic", () => {
  it("returns a concise score string for complete metadata", () => {
    const metadata: ResolvedMetadata = {
      title: "My Page Title - Well Crafted",
      description: "A good meta description that provides enough detail about the page content for search engines and users alike.",
      canonical: "https://example.com/page",
      ogTitle: "My Page Title - Well Crafted",
      ogDescription: "A good meta description that provides enough detail about the page content for search engines and users alike.",
      ogImage: "https://example.com/og.png",
      ogType: "website",
      twitterCard: "summary_large_image",
      twitterTitle: "My Page Title",
      twitterDescription: "A good description",
      robots: "index, follow",
      alternates: { en: "/en" },
      structuredData: [{ "@context": "https://schema.org" }],
      viewport: "width=device-width, initial-scale=1",
      favicon: "/favicon.ico",
    };

    const result = validateMetadata(metadata);

    // Score format: "85/100 (B) — 0 error(s), 3 warning(s), 12 passed"
    const output = `${result.score}/100 (${result.grade}) — ${result.errors.length} error(s), ${result.warnings.length} warning(s), ${result.passed.length} passed`;

    expect(output).toMatch(/^\d+\/100 \([A-F]\)/);
    expect(output).toContain("error(s)");
    expect(output).toContain("warning(s)");
    expect(output).toContain("passed");
  });

  it("returns low score for empty metadata", () => {
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
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("score is deterministic for same input", () => {
    const metadata: ResolvedMetadata = {
      title: "Test",
      description: null,
      canonical: "https://example.com",
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
      viewport: "width=device-width",
      favicon: null,
    };

    const result1 = validateMetadata(metadata);
    const result2 = validateMetadata(metadata);
    expect(result1.score).toBe(result2.score);
    expect(result1.grade).toBe(result2.grade);
  });
});
