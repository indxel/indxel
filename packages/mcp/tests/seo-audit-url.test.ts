import { describe, it, expect } from "vitest";
import { extractMetadataFromHtml } from "indxel";

describe("extractMetadataFromHtml", () => {
  it("extracts title from <title> tag", () => {
    const html = "<html><head><title>My Page</title></head></html>";
    const meta = extractMetadataFromHtml(html);
    expect(meta.title).toBe("My Page");
  });

  it("extracts meta description", () => {
    const html = `<html><head><meta name="description" content="Page description here"></head></html>`;
    const meta = extractMetadataFromHtml(html);
    expect(meta.description).toBe("Page description here");
  });

  it("extracts OpenGraph tags", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Desc">
        <meta property="og:image" content="https://example.com/og.png">
        <meta property="og:type" content="website">
      </head></html>
    `;
    const meta = extractMetadataFromHtml(html);
    expect(meta.ogTitle).toBe("OG Title");
    expect(meta.ogDescription).toBe("OG Desc");
    expect(meta.ogImage).toBe("https://example.com/og.png");
    expect(meta.ogType).toBe("website");
  });

  it("extracts Twitter card tags", () => {
    const html = `
      <html><head>
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="Twitter Title">
        <meta name="twitter:description" content="Twitter Desc">
      </head></html>
    `;
    const meta = extractMetadataFromHtml(html);
    expect(meta.twitterCard).toBe("summary_large_image");
    expect(meta.twitterTitle).toBe("Twitter Title");
    expect(meta.twitterDescription).toBe("Twitter Desc");
  });

  it("extracts canonical URL", () => {
    const html = `<html><head><link rel="canonical" href="https://example.com/page"></head></html>`;
    const meta = extractMetadataFromHtml(html);
    expect(meta.canonical).toBe("https://example.com/page");
  });

  it("extracts canonical with reversed attributes", () => {
    const html = `<html><head><link href="https://example.com/page" rel="canonical"></head></html>`;
    const meta = extractMetadataFromHtml(html);
    expect(meta.canonical).toBe("https://example.com/page");
  });

  it("extracts favicon", () => {
    const html = `<html><head><link rel="icon" href="/favicon.ico"></head></html>`;
    const meta = extractMetadataFromHtml(html);
    expect(meta.favicon).toBe("/favicon.ico");
  });

  it("extracts robots meta", () => {
    const html = `<html><head><meta name="robots" content="noindex, nofollow"></head></html>`;
    const meta = extractMetadataFromHtml(html);
    expect(meta.robots).toBe("noindex, nofollow");
  });

  it("extracts viewport meta", () => {
    const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head></html>`;
    const meta = extractMetadataFromHtml(html);
    expect(meta.viewport).toBe("width=device-width, initial-scale=1");
  });

  it("extracts JSON-LD structured data", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"WebPage","name":"Test"}
        </script>
      </head></html>
    `;
    const meta = extractMetadataFromHtml(html);
    expect(meta.structuredData).toHaveLength(1);
    expect((meta.structuredData![0] as Record<string, unknown>)["@type"]).toBe("WebPage");
  });

  it("extracts multiple JSON-LD blocks", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"@type":"WebPage"}</script>
        <script type="application/ld+json">{"@type":"Organization"}</script>
      </head></html>
    `;
    const meta = extractMetadataFromHtml(html);
    expect(meta.structuredData).toHaveLength(2);
  });

  it("skips invalid JSON-LD", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">not valid json</script>
        <script type="application/ld+json">{"@type":"WebPage"}</script>
      </head></html>
    `;
    const meta = extractMetadataFromHtml(html);
    expect(meta.structuredData).toHaveLength(1);
  });

  it("extracts hreflang alternates", () => {
    const html = `
      <html><head>
        <link rel="alternate" hreflang="en" href="https://example.com/en">
        <link rel="alternate" hreflang="fr" href="https://example.com/fr">
      </head></html>
    `;
    const meta = extractMetadataFromHtml(html);
    expect(meta.alternates).toEqual({
      en: "https://example.com/en",
      fr: "https://example.com/fr",
    });
  });

  it("returns null for missing fields", () => {
    const html = "<html><head></head><body></body></html>";
    const meta = extractMetadataFromHtml(html);
    expect(meta.title).toBeNull();
    expect(meta.description).toBeNull();
    expect(meta.canonical).toBeNull();
    expect(meta.ogTitle).toBeNull();
    expect(meta.ogImage).toBeNull();
    expect(meta.twitterCard).toBeNull();
    expect(meta.robots).toBeNull();
    expect(meta.viewport).toBeNull();
    expect(meta.favicon).toBeNull();
    expect(meta.alternates).toBeNull();
    expect(meta.structuredData).toBeNull();
  });

  it("handles a full realistic HTML page", () => {
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LeCapybara - Aide aux demarches administratives</title>
  <meta name="description" content="LeCapybara vous aide a rediger vos courriers administratifs, mises en demeure et lettres officielles. Simple, rapide, efficace.">
  <link rel="canonical" href="https://lecapybara.fr/">
  <link rel="icon" href="/favicon.ico">
  <meta property="og:title" content="LeCapybara">
  <meta property="og:description" content="Aide aux demarches administratives">
  <meta property="og:image" content="https://lecapybara.fr/og.png">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="robots" content="index, follow">
  <link rel="alternate" hreflang="fr" href="https://lecapybara.fr/">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Organization","name":"LeCapybara","url":"https://lecapybara.fr"}
  </script>
</head>
<body></body>
</html>
    `;

    const meta = extractMetadataFromHtml(html);
    expect(meta.title).toBe("LeCapybara - Aide aux demarches administratives");
    expect(meta.description).toContain("LeCapybara");
    expect(meta.canonical).toBe("https://lecapybara.fr/");
    expect(meta.ogTitle).toBe("LeCapybara");
    expect(meta.ogImage).toBe("https://lecapybara.fr/og.png");
    expect(meta.twitterCard).toBe("summary_large_image");
    expect(meta.robots).toBe("index, follow");
    expect(meta.viewport).toBe("width=device-width, initial-scale=1");
    expect(meta.favicon).toBe("/favicon.ico");
    expect(meta.structuredData).toHaveLength(1);
    expect(meta.alternates).toEqual({ fr: "https://lecapybara.fr/" });
  });
});
