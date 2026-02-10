import { describe, it, expect } from "vitest";
import { createMetadata } from "../metadata.js";
import { defineSEO } from "../define-seo.js";

const config = defineSEO({
  siteName: "MonSaaS",
  siteUrl: "https://monsaas.fr",
  titleTemplate: "%s | MonSaaS",
  defaultOGImage: "/og-default.png",
  locale: "fr_FR",
  twitter: { handle: "@monsaas", cardType: "summary_large_image" },
});

describe("createMetadata", () => {
  it("generates basic metadata with config", () => {
    const meta = createMetadata(
      {
        title: "Accueil",
        description: "Bienvenue sur MonSaaS",
        path: "/",
      },
      config,
    );

    expect(meta.title).toBe("Accueil | MonSaaS");
    expect(meta.description).toBe("Bienvenue sur MonSaaS");
    expect(meta.alternates?.canonical).toBe("https://monsaas.fr/");
  });

  it("applies title template", () => {
    const meta = createMetadata(
      { title: "Blog", description: "Articles", path: "/blog" },
      config,
    );

    expect(meta.title).toBe("Blog | MonSaaS");
  });

  it("uses raw title when no template", () => {
    const noTemplateConfig = defineSEO({
      siteName: "Test",
      siteUrl: "https://test.com",
    });

    const meta = createMetadata(
      { title: "Raw Title", description: "Desc", path: "/" },
      noTemplateConfig,
    );

    expect(meta.title).toBe("Raw Title");
  });

  it("resolves OG image from config default", () => {
    const meta = createMetadata(
      { title: "Test", description: "Desc", path: "/" },
      config,
    );

    expect(meta.openGraph?.images?.[0]?.url).toBe("https://monsaas.fr/og-default.png");
  });

  it("overrides OG image with page-level value", () => {
    const meta = createMetadata(
      {
        title: "Test",
        description: "Desc",
        path: "/blog/post",
        ogImage: "/blog/post-og.png",
      },
      config,
    );

    expect(meta.openGraph?.images?.[0]?.url).toBe("https://monsaas.fr/blog/post-og.png");
  });

  it("handles absolute OG image URLs", () => {
    const meta = createMetadata(
      {
        title: "Test",
        description: "Desc",
        path: "/",
        ogImage: "https://cdn.example.com/og.png",
      },
      config,
    );

    expect(meta.openGraph?.images?.[0]?.url).toBe("https://cdn.example.com/og.png");
  });

  it("sets canonical URL from path + siteUrl", () => {
    const meta = createMetadata(
      { title: "Blog", description: "Desc", path: "/blog" },
      config,
    );

    expect(meta.alternates?.canonical).toBe("https://monsaas.fr/blog");
  });

  it("uses canonical override when provided", () => {
    const meta = createMetadata(
      {
        title: "Test",
        description: "Desc",
        path: "/old-path",
        canonical: "https://monsaas.fr/new-path",
      },
      config,
    );

    expect(meta.alternates?.canonical).toBe("https://monsaas.fr/new-path");
  });

  it("generates Twitter card from config", () => {
    const meta = createMetadata(
      { title: "Test", description: "Desc", path: "/" },
      config,
    );

    expect(meta.twitter?.card).toBe("summary_large_image");
    expect(meta.twitter?.creator).toBe("@monsaas");
    expect(meta.twitter?.title).toBe("Test");
  });

  it("sets noindex when requested", () => {
    const meta = createMetadata(
      { title: "Test", description: "Desc", path: "/private", noindex: true },
      config,
    );

    expect(meta.robots?.index).toBe(false);
    expect(meta.robots?.follow).toBe(true);
  });

  it("generates alternates/hreflang", () => {
    const meta = createMetadata(
      {
        title: "Test",
        description: "Desc",
        path: "/",
        alternates: { en: "/en", fr: "/fr" },
      },
      config,
    );

    expect(meta.alternates?.languages?.en).toBe("https://monsaas.fr/en");
    expect(meta.alternates?.languages?.fr).toBe("https://monsaas.fr/fr");
  });

  it("sets article metadata for blog posts", () => {
    const meta = createMetadata(
      {
        title: "Blog Post",
        description: "A post",
        path: "/blog/post",
        article: {
          publishedTime: "2026-01-15T00:00:00Z",
          author: "John Doe",
          tags: ["seo", "nextjs"],
        },
      },
      config,
    );

    expect(meta.openGraph?.type).toBe("article");
    expect(meta.openGraph?.article?.publishedTime).toBe("2026-01-15T00:00:00Z");
    expect(meta.openGraph?.article?.authors).toEqual(["John Doe"]);
    expect(meta.openGraph?.article?.tags).toEqual(["seo", "nextjs"]);
  });

  it("sets type to website when no article", () => {
    const meta = createMetadata(
      { title: "Home", description: "Desc", path: "/" },
      config,
    );

    expect(meta.openGraph?.type).toBe("website");
  });

  it("works without config (standalone)", () => {
    const meta = createMetadata({
      title: "Standalone",
      description: "No config",
      path: "/page",
    });

    expect(meta.title).toBe("Standalone");
    expect(meta.description).toBe("No config");
    expect(meta.alternates?.canonical).toBe("/page");
  });
});
