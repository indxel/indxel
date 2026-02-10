import { describe, it, expect } from "vitest";
import { generateLD } from "indxel";

describe("seo_generate_structured_data tool logic", () => {
  it("generates Article JSON-LD", () => {
    const ld = generateLD("Article", {
      headline: "My Blog Post",
      datePublished: "2026-01-15",
      author: "John Doe",
      description: "An interesting article about SEO.",
    });

    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Article");
    expect(ld.headline).toBe("My Blog Post");
    expect(ld.datePublished).toBe("2026-01-15");
    expect(ld.author).toEqual({ "@type": "Person", name: "John Doe", url: undefined });
  });

  it("generates FAQ JSON-LD", () => {
    const ld = generateLD("FAQ", {
      questions: [
        { question: "What is SEO?", answer: "Search engine optimization." },
        { question: "Why does it matter?", answer: "Visibility." },
      ],
    });

    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(2);
    const firstQuestion = (ld.mainEntity as Record<string, unknown>[])[0];
    expect(firstQuestion["@type"]).toBe("Question");
    expect(firstQuestion.name).toBe("What is SEO?");
  });

  it("generates Organization JSON-LD", () => {
    const ld = generateLD("Organization", {
      name: "TestCorp",
      url: "https://testcorp.com",
      logo: "https://testcorp.com/logo.png",
    });

    expect(ld["@type"]).toBe("Organization");
    expect(ld.name).toBe("TestCorp");
    expect(ld.url).toBe("https://testcorp.com");
    expect(ld.logo).toEqual({ "@type": "ImageObject", url: "https://testcorp.com/logo.png" });
  });

  it("generates Product JSON-LD with offer", () => {
    const ld = generateLD("Product", {
      name: "SEO Tool",
      description: "Developer-first SEO infrastructure",
      price: 19,
      currency: "EUR",
    });

    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBe("SEO Tool");
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("Offer");
    expect(offers.price).toBe(19);
    expect(offers.priceCurrency).toBe("EUR");
  });

  it("generates WebSite JSON-LD with search action", () => {
    const ld = generateLD("WebSite", {
      name: "TestSite",
      url: "https://testsite.com",
      searchUrl: "https://testsite.com/search?q={search_term_string}",
    });

    expect(ld["@type"]).toBe("WebSite");
    expect(ld.potentialAction).toBeDefined();
    const action = ld.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
  });

  it("throws on unsupported type", () => {
    expect(() => generateLD("Unknown" as any, {})).toThrow("unsupported structured data type");
  });

  it("throws when FAQ has no questions array", () => {
    expect(() => generateLD("FAQ", {})).toThrow("requires a 'questions' array");
  });
});
