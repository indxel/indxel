import { describe, it, expect } from "vitest";
import { validateMetadata, resolveFromNextMetadata } from "../validate.js";
import { createMetadata } from "../metadata.js";
import { defineSEO } from "../define-seo.js";
import type { ResolvedMetadata } from "../types.js";
import { applyCrossPagePenalties } from "../crawler.js";
import type { CrawledPage, CrawlAnalysis } from "../crawler.js";

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

    expect(result.score).toBeLessThan(60);
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
    // Build a perfect resolved metadata (h1s + wordCount for content rules)
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
      h1s: ["A Perfect Page Title"],
      wordCount: 500,
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

describe("content rules", () => {
  it("h1-present passes silently when h1s field is absent", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test" });
    const h1Rule = [...result.passed, ...result.warnings, ...result.errors]
      .find((r) => r.id === "h1-present");
    expect(h1Rule).toBeDefined();
    expect(h1Rule!.status).toBe("pass");
  });

  it("content-length passes silently when wordCount field is absent", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test" });
    const clRule = [...result.passed, ...result.warnings, ...result.errors]
      .find((r) => r.id === "content-length");
    expect(clRule).toBeDefined();
    expect(clRule!.status).toBe("pass");
  });

  it("h1-present errors when 0 H1s", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", h1s: [] });
    const h1Rule = [...result.errors].find((r) => r.id === "h1-present");
    expect(h1Rule).toBeDefined();
    expect(h1Rule!.status).toBe("error");
  });

  it("h1-present passes with exactly 1 H1", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", h1s: ["Hello"] });
    const h1Rule = [...result.passed].find((r) => r.id === "h1-present");
    expect(h1Rule).toBeDefined();
    expect(h1Rule!.status).toBe("pass");
  });

  it("h1-present warns with multiple H1s", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", h1s: ["A", "B"] });
    const h1Rule = [...result.warnings].find((r) => r.id === "h1-present");
    expect(h1Rule).toBeDefined();
    expect(h1Rule!.status).toBe("warn");
  });

  it("content-length errors when < 50 words", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", wordCount: 13 });
    const clRule = [...result.errors].find((r) => r.id === "content-length");
    expect(clRule).toBeDefined();
    expect(clRule!.status).toBe("error");
  });

  it("content-length warns when between 50-199 words", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", wordCount: 120 });
    const clRule = [...result.warnings].find((r) => r.id === "content-length");
    expect(clRule).toBeDefined();
    expect(clRule!.status).toBe("warn");
  });

  it("content-length passes when >= 200 words", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", wordCount: 350 });
    const clRule = [...result.passed].find((r) => r.id === "content-length");
    expect(clRule).toBeDefined();
    expect(clRule!.status).toBe("pass");
  });

  // -- Boundary values --

  it("h1-present passes silently when h1s is explicit null", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", h1s: null });
    const h1Rule = [...result.passed].find((r) => r.id === "h1-present");
    expect(h1Rule).toBeDefined();
    expect(h1Rule!.status).toBe("pass");
  });

  it("content-length passes silently when wordCount is explicit null", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", wordCount: null });
    const clRule = [...result.passed].find((r) => r.id === "content-length");
    expect(clRule).toBeDefined();
    expect(clRule!.status).toBe("pass");
  });

  it("content-length errors at wordCount = 0", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", wordCount: 0 });
    const clRule = [...result.errors].find((r) => r.id === "content-length");
    expect(clRule).toBeDefined();
    expect(clRule!.status).toBe("error");
  });

  it("content-length boundary: 50 words = warn (not error)", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", wordCount: 50 });
    const clRule = [...result.warnings].find((r) => r.id === "content-length");
    expect(clRule).toBeDefined();
    expect(clRule!.status).toBe("warn");
  });

  it("content-length boundary: 200 words = pass", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", wordCount: 200 });
    const clRule = [...result.passed].find((r) => r.id === "content-length");
    expect(clRule).toBeDefined();
    expect(clRule!.status).toBe("pass");
  });

  it("content-length boundary: 300 words = pass", () => {
    const result = validateMetadata({ title: "Test", ogTitle: "Test", wordCount: 300 });
    const clRule = [...result.passed].find((r) => r.id === "content-length");
    expect(clRule).toBeDefined();
    expect(clRule!.status).toBe("pass");
  });

  // -- SPA scenario from plan: 0 H1, 13 words --

  it("SPA scenario: 0 H1 + 13 words loses 13 points vs absent fields", () => {
    // Without content signals (static check)
    const baseline = validateMetadata({
      title: "Test", ogTitle: "Test",
    });

    // With crawl content signals revealing thin/empty content
    const spa = validateMetadata({
      title: "Test", ogTitle: "Test",
      h1s: [],
      wordCount: 13,
    });

    // h1-present (8 pts) + content-length (5 pts) = 13 points lost
    expect(baseline.score - spa.score).toBe(13);
  });
});

describe("applyCrossPagePenalties", () => {
  function makePage(url: string, title: string, description: string, score: number): CrawledPage {
    return {
      url,
      status: 200,
      metadata: { title, description },
      validation: { score, grade: "B", passed: [], warnings: [], errors: [] },
      internalLinks: [],
      externalLinks: [],
      depth: 0,
      h1s: ["H1"],
      wordCount: 300,
      responseTimeMs: 100,
      redirectChain: [],
      structuredDataTypes: [],
      isAppPage: false,
      imagesTotal: 0,
      imagesMissingAlt: 0,
    };
  }

  it("deducts 5 points for duplicate titles", () => {
    const pages = [
      makePage("https://a.com/1", "Same Title", "Desc 1", 80),
      makePage("https://a.com/2", "Same Title", "Desc 2", 80),
      makePage("https://a.com/3", "Unique Title", "Desc 3", 80),
    ];

    const analysis: CrawlAnalysis = {
      duplicateTitles: [{ title: "Same Title", urls: ["https://a.com/1", "https://a.com/2"] }],
      duplicateDescriptions: [],
      h1Issues: [],
      brokenInternalLinks: [],
      brokenExternalLinks: [],
      redirects: [],
      thinContentPages: [],
      internalLinkGraph: [],
      orphanPages: [],
      slowestPages: [],
      structuredDataSummary: [],
      imageAltIssues: [],
      brokenImages: [],
      externalLinksBlocked403: 0,
      nonHtmlInternalResources: [],
    };

    applyCrossPagePenalties(pages, analysis);

    expect(pages[0].validation.score).toBe(75);
    expect(pages[1].validation.score).toBe(75);
    expect(pages[2].validation.score).toBe(80); // not affected
    expect(pages[0].validation.errors.some((e) => e.id === "unique-title")).toBe(true);
  });

  it("deducts 3 points for duplicate descriptions", () => {
    const pages = [
      makePage("https://a.com/1", "Title 1", "Same Desc", 80),
      makePage("https://a.com/2", "Title 2", "Same Desc", 80),
    ];

    const analysis: CrawlAnalysis = {
      duplicateTitles: [],
      duplicateDescriptions: [{ description: "Same Desc", urls: ["https://a.com/1", "https://a.com/2"] }],
      h1Issues: [],
      brokenInternalLinks: [],
      brokenExternalLinks: [],
      redirects: [],
      thinContentPages: [],
      internalLinkGraph: [],
      orphanPages: [],
      slowestPages: [],
      structuredDataSummary: [],
      imageAltIssues: [],
      brokenImages: [],
      externalLinksBlocked403: 0,
      nonHtmlInternalResources: [],
    };

    applyCrossPagePenalties(pages, analysis);

    expect(pages[0].validation.score).toBe(77);
    expect(pages[1].validation.score).toBe(77);
    expect(pages[0].validation.warnings.some((w) => w.id === "unique-description")).toBe(true);
  });

  it("applies both penalties cumulatively", () => {
    const pages = [
      makePage("https://a.com/1", "Same", "Same", 80),
      makePage("https://a.com/2", "Same", "Same", 80),
    ];

    const analysis: CrawlAnalysis = {
      duplicateTitles: [{ title: "Same", urls: ["https://a.com/1", "https://a.com/2"] }],
      duplicateDescriptions: [{ description: "Same", urls: ["https://a.com/1", "https://a.com/2"] }],
      h1Issues: [],
      brokenInternalLinks: [],
      brokenExternalLinks: [],
      redirects: [],
      thinContentPages: [],
      internalLinkGraph: [],
      orphanPages: [],
      slowestPages: [],
      structuredDataSummary: [],
      imageAltIssues: [],
      brokenImages: [],
      externalLinksBlocked403: 0,
      nonHtmlInternalResources: [],
    };

    applyCrossPagePenalties(pages, analysis);

    // 80 - 5 (dup title) - 3 (dup desc) = 72
    expect(pages[0].validation.score).toBe(72);
    expect(pages[0].validation.grade).toBe("C");
  });

  it("does not go below 0", () => {
    const pages = [
      makePage("https://a.com/1", "Same", "Same", 3),
      makePage("https://a.com/2", "Same", "Same", 3),
    ];

    const analysis: CrawlAnalysis = {
      duplicateTitles: [{ title: "Same", urls: ["https://a.com/1", "https://a.com/2"] }],
      duplicateDescriptions: [{ description: "Same", urls: ["https://a.com/1", "https://a.com/2"] }],
      h1Issues: [],
      brokenInternalLinks: [],
      brokenExternalLinks: [],
      redirects: [],
      thinContentPages: [],
      internalLinkGraph: [],
      orphanPages: [],
      slowestPages: [],
      structuredDataSummary: [],
      imageAltIssues: [],
      brokenImages: [],
      externalLinksBlocked403: 0,
      nonHtmlInternalResources: [],
    };

    applyCrossPagePenalties(pages, analysis);

    expect(pages[0].validation.score).toBe(0);
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
