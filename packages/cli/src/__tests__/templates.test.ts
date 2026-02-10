import { describe, it, expect } from "vitest";
import {
  seoConfigTemplate,
  sitemapTemplate,
  robotsTemplate,
} from "../templates.js";

describe("templates", () => {
  describe("seoConfigTemplate", () => {
    it("generates TypeScript template with import", () => {
      const content = seoConfigTemplate(true);
      expect(content).toContain("import { defineSEO }");
      expect(content).toContain("siteName:");
      expect(content).toContain("siteUrl:");
      expect(content).toContain("titleTemplate:");
    });

    it("generates JavaScript template with require", () => {
      const content = seoConfigTemplate(false);
      expect(content).toContain("require('indxel')");
      expect(content).toContain("module.exports");
    });
  });

  describe("sitemapTemplate", () => {
    it("generates TypeScript sitemap with MetadataRoute type", () => {
      const content = sitemapTemplate(true);
      expect(content).toContain("MetadataRoute.Sitemap");
      expect(content).toContain("changeFrequency");
      expect(content).toContain("priority");
    });

    it("generates JavaScript sitemap with JSDoc type", () => {
      const content = sitemapTemplate(false);
      expect(content).toContain("@returns");
      expect(content).not.toContain("import type");
    });
  });

  describe("robotsTemplate", () => {
    it("generates TypeScript robots with MetadataRoute type", () => {
      const content = robotsTemplate(true);
      expect(content).toContain("MetadataRoute.Robots");
      expect(content).toContain("userAgent");
      expect(content).toContain("sitemap");
    });

    it("generates JavaScript robots with JSDoc type", () => {
      const content = robotsTemplate(false);
      expect(content).toContain("@returns");
      expect(content).toContain("userAgent");
    });
  });
});
