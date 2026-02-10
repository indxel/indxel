import type { RuleDefinition, ResolvedMetadata, RuleCheckResult } from "../types.js";

export const robotsRule: RuleDefinition = {
  id: "robots-not-blocking",
  name: "Robots Not Blocking",
  description: "Page should not accidentally block indexing via robots meta tag",
  weight: 5,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const robots = metadata.robots?.toLowerCase().trim() ?? "";

    if (!robots) {
      return { status: "pass", message: "No robots directive (defaults to index, follow)" };
    }

    if (robots.includes("noindex") || robots.includes("none")) {
      return {
        status: "warn",
        message: "Page is set to noindex — will not appear in search results",
        value: robots,
      };
    }

    return { status: "pass", message: "Robots directive allows indexing", value: robots };
  },
};

export const twitterCardRule: RuleDefinition = {
  id: "twitter-card",
  name: "Twitter Card",
  description: "Page should have a Twitter card configuration for X/Twitter sharing",
  weight: 5,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const has = !!metadata.twitterCard && metadata.twitterCard.trim().length > 0;
    return {
      status: has ? "pass" : "warn",
      message: has
        ? `Twitter card type: ${metadata.twitterCard}`
        : "Missing Twitter card — shares on X will use defaults",
      value: metadata.twitterCard ?? undefined,
    };
  },
};

export const alternatesRule: RuleDefinition = {
  id: "alternates-hreflang",
  name: "Alternates / Hreflang",
  description: "Multi-language pages should declare hreflang alternates",
  weight: 5,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const keys = metadata.alternates ? Object.keys(metadata.alternates) : [];
    const has = keys.length > 0;
    return {
      status: "pass",
      message: has
        ? `${keys.length} language alternate(s) declared`
        : "Single-language site — hreflang not required",
      value: keys.length,
    };
  },
};

export const viewportRule: RuleDefinition = {
  id: "viewport-meta",
  name: "Viewport Meta",
  description: "Page should have a viewport meta tag for mobile responsiveness",
  weight: 3,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const has = !!metadata.viewport && metadata.viewport.trim().length > 0;
    return {
      status: has ? "pass" : "warn",
      message: has
        ? "Viewport meta tag is set"
        : "No explicit viewport meta — Next.js sets this by default",
      value: metadata.viewport ?? undefined,
    };
  },
};

export const faviconRule: RuleDefinition = {
  id: "favicon",
  name: "Favicon",
  description: "Site should have a favicon reference",
  weight: 2,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const has = !!metadata.favicon && metadata.favicon.trim().length > 0;
    return {
      status: has ? "pass" : "warn",
      message: has
        ? "Favicon is configured"
        : "No favicon detected — browsers will show a generic icon",
      value: metadata.favicon ?? undefined,
    };
  },
};
