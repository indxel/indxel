import { describe, it, expect } from "vitest";
import { validateMetadata, resolveFromNextMetadata } from "../validate.js";
import { createMetadata } from "../metadata.js";
import { defineSEO } from "../define-seo.js";
import type { ResolvedMetadata } from "../types.js";

const config = defineSEO({
  siteName: "TestSite",
  siteUrl: "https://test.com",
  titleTemplate: "%s | TestSite",
  defaultOGImage: "/og.png",
  locale: "en_US",
  twitter: { handle: "@test", cardType: "summary_large_image" },
});

describe("validateMetadata", () => {
  it("scores a well-configured page highly", () => {
    const meta = createMetadata(
      {
        title: "A Great Page Title That Is Exactly Right Length",
        description:
          "This is a well-written meta description that provides enough context about the page content for search engines and users alike to understand what this page covers.",
        path: "/page",
      },
      config,
    );

    const result = validateMetadata(meta);

    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.grade).toMatch(/^[A-C]$/);
    expect(result.errors.length).toBeLessThanOrEqual(3);
  });

  it("scores a minimal page poorly", () => {
    const result = validateMetadata({
      title: "Hi",
      description: "Short",
    });

    expect(result.score).toBeLessThan(50);
    expect(result.grade).toMatch(/^[D-F]$/);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns correct structure", () => {
    const result = validateMetadata({ title: "Test" });

    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("grade");
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("warnings");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.passed)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("gives grade A for score >= 90", () => {
    // Build a perfect resolved metadata
    const resolved: ResolvedMetadata = {
      title: "A Perfect Page Title That Has The Right Character Count",
      description:
        "This is a perfectly crafted meta description that hits the sweet spot for length at approximately one hundred and forty characters total which is ideal.",
      canonical: "https://test.com/page",
      ogTitle: "A Perfect Page Title",
      ogDescription: "OG description here",
      ogImage: "https://test.com/og.png",
      twitterCard: "summary_large_image",
      robots: "index, follow",
      alternates: { en: "https://test.com/en" },
      structuredData: [{ "@context": "https://schema.org", "@type": "WebPage" }],
      viewport: "width=device-width, initial-scale=1",
      favicon: "/favicon.ico",
    };

    const result = validateMetadata(resolved);

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.grade).toBe("A");
  });

  it("treats warnings as errors in strict mode", () => {
    const resolved: ResolvedMetadata = {
      title: "A Decent Title",
      description: "Short desc",
      canonical: "https://test.com/page",
      ogTitle: "Title",
      ogDescription: "Desc",
      ogImage: "https://test.com/og.png",
      twitterCard: null,
      robots: null,
      alternates: null,
      structuredData: null,
      viewport: null,
      favicon: null,
    };

    const normal = validateMetadata(resolved);
    const strict = validateMetadata(resolved, { strict: true });

    // Strict mode should have more errors and fewer warnings
    expect(strict.errors.length).toBeGreaterThan(normal.errors.length);
    expect(strict.warnings.length).toBe(0);
  });

  it("each rule result has required fields", () => {
    const result = validateMetadata({ title: "Test Page", description: "Description" });

    const allResults = [...result.passed, ...result.warnings, ...result.errors];
    for (const rule of allResults) {
      expect(rule).toHaveProperty("id");
      expect(rule).toHaveProperty("name");
      expect(rule).toHaveProperty("description");
      expect(rule).toHaveProperty("weight");
      expect(rule).toHaveProperty("status");
      expect(["pass", "warn", "error"]).toContain(rule.status);
      expect(typeof rule.weight).toBe("number");
    }
  });

  it("total weights sum to 100", () => {
    const result = validateMetadata({ title: "Test" });
    const allResults = [...result.passed, ...result.warnings, ...result.errors];
    const total = allResults.reduce((sum, r) => sum + r.weight, 0);
    expect(total).toBe(100);
  });
});

describe("resolveFromNextMetadata", () => {
  it("extracts fields from Next.js Metadata shape", () => {
    const meta = createMetadata(
      {
        title: "Test Page",
        description: "A page description",
        path: "/test",
      },
      config,
    );

    const resolved = resolveFromNextMetadata(meta);

    expect(resolved.title).toBe("Test Page | TestSite");
    expect(resolved.description).toBe("A page description");
    expect(resolved.canonical).toBe("https://test.com/test");
    expect(resolved.ogTitle).toBe("Test Page");
    expect(resolved.ogImage).toBe("https://test.com/og.png");
    expect(resolved.twitterCard).toBe("summary_large_image");
  });

  it("handles noindex robots", () => {
    const meta = createMetadata(
      { title: "Private", description: "Desc", path: "/private", noindex: true },
      config,
    );

    const resolved = resolveFromNextMetadata(meta);
    expect(resolved.robots).toContain("noindex");
  });
});
