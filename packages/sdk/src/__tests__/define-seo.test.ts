import { describe, it, expect } from "vitest";
import { defineSEO } from "../define-seo.js";

describe("defineSEO", () => {
  it("returns a frozen config object", () => {
    const config = defineSEO({
      siteName: "TestSite",
      siteUrl: "https://test.com",
    });

    expect(config.siteName).toBe("TestSite");
    expect(config.siteUrl).toBe("https://test.com");
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("strips trailing slash from siteUrl", () => {
    const config = defineSEO({
      siteName: "TestSite",
      siteUrl: "https://test.com/",
    });

    expect(config.siteUrl).toBe("https://test.com");
  });

  it("strips multiple trailing slashes", () => {
    const config = defineSEO({
      siteName: "TestSite",
      siteUrl: "https://test.com///",
    });

    expect(config.siteUrl).toBe("https://test.com");
  });

  it("preserves all config fields", () => {
    const config = defineSEO({
      siteName: "MonSaaS",
      siteUrl: "https://monsaas.fr",
      titleTemplate: "%s | MonSaaS",
      defaultDescription: "Default desc",
      defaultOGImage: "/og.png",
      locale: "fr_FR",
      twitter: { handle: "@monsaas", cardType: "summary_large_image" },
      organization: { name: "MonSaaS", logo: "/logo.png", url: "https://monsaas.fr" },
    });

    expect(config.titleTemplate).toBe("%s | MonSaaS");
    expect(config.defaultDescription).toBe("Default desc");
    expect(config.defaultOGImage).toBe("/og.png");
    expect(config.locale).toBe("fr_FR");
    expect(config.twitter?.handle).toBe("@monsaas");
    expect(config.organization?.name).toBe("MonSaaS");
  });

  it("throws if siteName is missing", () => {
    expect(() =>
      defineSEO({ siteName: "", siteUrl: "https://test.com" }),
    ).toThrow("siteName is required");
  });

  it("throws if siteUrl is missing", () => {
    expect(() =>
      defineSEO({ siteName: "Test", siteUrl: "" }),
    ).toThrow("siteUrl is required");
  });
});
