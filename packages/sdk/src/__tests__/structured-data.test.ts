import { describe, it, expect } from "vitest";
import { generateLD } from "../structured-data.js";

describe("generateLD", () => {
  describe("Article", () => {
    it("generates a valid Article JSON-LD", () => {
      const ld = generateLD("Article", {
        headline: "My Blog Post",
        description: "A description of the post",
        datePublished: "2026-01-15",
        author: "John Doe",
        url: "https://example.com/blog/post",
      });

      expect(ld["@context"]).toBe("https://schema.org");
      expect(ld["@type"]).toBe("Article");
      expect(ld["headline"]).toBe("My Blog Post");
      expect(ld["datePublished"]).toBe("2026-01-15");
      expect(ld["author"]).toEqual({ "@type": "Person", name: "John Doe", url: undefined });
    });

    it("supports author as object", () => {
      const ld = generateLD("Article", {
        headline: "Test",
        author: { name: "Jane", url: "https://jane.dev" },
      });

      expect(ld["author"]).toEqual({
        "@type": "Person",
        name: "Jane",
        url: "https://jane.dev",
      });
    });

    it("uses title as fallback for headline", () => {
      const ld = generateLD("Article", { title: "Fallback Title" });
      expect(ld["headline"]).toBe("Fallback Title");
    });
  });

  describe("FAQ", () => {
    it("generates a valid FAQPage JSON-LD", () => {
      const ld = generateLD("FAQ", {
        questions: [
          { question: "What is SEO?", answer: "Search Engine Optimization" },
          { question: "Why does it matter?", answer: "Because traffic" },
        ],
      });

      expect(ld["@type"]).toBe("FAQPage");
      const entities = ld["mainEntity"] as Array<Record<string, unknown>>;
      expect(entities).toHaveLength(2);
      expect(entities[0]["@type"]).toBe("Question");
      expect(entities[0]["name"]).toBe("What is SEO?");
    });

    it("supports q/a shorthand", () => {
      const ld = generateLD("FAQ", {
        questions: [{ q: "Short?", a: "Yes." }],
      });

      const entities = ld["mainEntity"] as Array<Record<string, unknown>>;
      expect(entities[0]["name"]).toBe("Short?");
      expect((entities[0]["acceptedAnswer"] as Record<string, unknown>)["text"]).toBe("Yes.");
    });

    it("throws if no questions array", () => {
      expect(() => generateLD("FAQ", {})).toThrow("requires a 'questions' array");
    });
  });

  describe("Breadcrumb", () => {
    it("generates a valid BreadcrumbList JSON-LD", () => {
      const ld = generateLD("Breadcrumb", {
        items: [
          { name: "Home", url: "https://example.com" },
          { name: "Blog", url: "https://example.com/blog" },
          { name: "Post", url: "https://example.com/blog/post" },
        ],
      });

      expect(ld["@type"]).toBe("BreadcrumbList");
      const items = ld["itemListElement"] as Array<Record<string, unknown>>;
      expect(items).toHaveLength(3);
      expect(items[0]["position"]).toBe(1);
      expect(items[0]["name"]).toBe("Home");
      expect(items[2]["position"]).toBe(3);
    });

    it("throws if no items array", () => {
      expect(() => generateLD("Breadcrumb", {})).toThrow("requires an 'items' array");
    });
  });

  describe("Organization", () => {
    it("generates a valid Organization JSON-LD", () => {
      const ld = generateLD("Organization", {
        name: "MonSaaS",
        url: "https://monsaas.fr",
        logo: "https://monsaas.fr/logo.png",
      });

      expect(ld["@type"]).toBe("Organization");
      expect(ld["name"]).toBe("MonSaaS");
      expect((ld["logo"] as Record<string, unknown>)["url"]).toBe("https://monsaas.fr/logo.png");
    });
  });

  describe("Product", () => {
    it("generates a Product with pricing", () => {
      const ld = generateLD("Product", {
        name: "Pro Plan",
        description: "Full access",
        price: 19,
        currency: "EUR",
        url: "https://example.com/pricing",
      });

      expect(ld["@type"]).toBe("Product");
      const offers = ld["offers"] as Record<string, unknown>;
      expect(offers["price"]).toBe(19);
      expect(offers["priceCurrency"]).toBe("EUR");
    });
  });

  describe("HowTo", () => {
    it("generates a HowTo with steps", () => {
      const ld = generateLD("HowTo", {
        name: "Install indxel",
        steps: [
          { name: "Install", text: "npm install indxel" },
          { name: "Configure", text: "Create seo.config.ts" },
          { name: "Check", text: "npx indxel check" },
        ],
      });

      expect(ld["@type"]).toBe("HowTo");
      const steps = ld["step"] as Array<Record<string, unknown>>;
      expect(steps).toHaveLength(3);
      expect(steps[0]["position"]).toBe(1);
      expect(steps[2]["name"]).toBe("Check");
    });

    it("throws if no steps array", () => {
      expect(() => generateLD("HowTo", { name: "Test" })).toThrow("requires a 'steps' array");
    });
  });

  describe("WebSite", () => {
    it("generates a WebSite with search action", () => {
      const ld = generateLD("WebSite", {
        name: "MonSaaS",
        url: "https://monsaas.fr",
        searchUrl: "https://monsaas.fr/search?q={search_term_string}",
      });

      expect(ld["@type"]).toBe("WebSite");
      expect(ld["potentialAction"]).toBeDefined();
    });
  });

  describe("SoftwareApplication", () => {
    it("generates a SoftwareApplication", () => {
      const ld = generateLD("SoftwareApplication", {
        name: "indxel",
        description: "SEO infrastructure for developers",
        category: "DeveloperApplication",
      });

      expect(ld["@type"]).toBe("SoftwareApplication");
      expect(ld["applicationCategory"]).toBe("DeveloperApplication");
    });
  });

  it("throws on unsupported type", () => {
    expect(() => generateLD("Unsupported" as never, {})).toThrow("unsupported structured data type");
  });
});
