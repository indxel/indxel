import { describe, it, expect } from "vitest";
import { defineSEO, createMetadata } from "indxel";

describe("seo_generate_metadata tool logic", () => {
  it("generates complete metadata with config", () => {
    const config = defineSEO({
      siteName: "TestSaaS",
      siteUrl: "https://testsaas.com",
      titleTemplate: "%s | TestSaaS",
      defaultOGImage: "/og-default.png",
      locale: "en_US",
    });

    const metadata = createMetadata(
      {
        title: "Features",
        description: "All the features of TestSaaS explained in detail.",
        path: "/features",
      },
      config,
    );

    expect(metadata.title).toBe("Features | TestSaaS");
    expect(metadata.description).toBe("All the features of TestSaaS explained in detail.");
    expect(metadata.openGraph?.title).toBe("Features");
    expect(metadata.openGraph?.url).toBe("https://testsaas.com/features");
    expect(metadata.openGraph?.siteName).toBe("TestSaaS");
    expect(metadata.alternates?.canonical).toBe("https://testsaas.com/features");
    expect(metadata.openGraph?.images?.[0]?.url).toBe("https://testsaas.com/og-default.png");
  });

  it("generates metadata without config", () => {
    const config = defineSEO({
      siteName: "Minimal",
      siteUrl: "https://minimal.dev",
    });

    const metadata = createMetadata(
      {
        title: "Home",
        description: "Welcome to Minimal.",
        path: "/",
      },
      config,
    );

    expect(metadata.title).toBe("Home");
    expect(metadata.description).toBe("Welcome to Minimal.");
    expect(metadata.alternates?.canonical).toBe("https://minimal.dev/");
  });

  it("sets noindex when requested", () => {
    const config = defineSEO({
      siteName: "Test",
      siteUrl: "https://test.com",
    });

    const metadata = createMetadata(
      {
        title: "Private",
        description: "Private page.",
        path: "/private",
        noindex: true,
      },
      config,
    );

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
