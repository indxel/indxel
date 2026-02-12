import type { RuleDefinition, ResolvedMetadata, RuleCheckResult } from "../types.js";

export const ogImageRule: RuleDefinition = {
  id: "og-image",
  name: "OpenGraph Image",
  description: "Page should have an og:image for social sharing previews",
  weight: 8,
  severity: "critical",
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const has = !!metadata.ogImage && metadata.ogImage.trim().length > 0;
    return {
      status: has ? "pass" : "error",
      message: has ? "og:image is set" : "Missing og:image — social shares will look broken",
      value: metadata.ogImage ?? undefined,
    };
  },
};

export const ogTitleRule: RuleDefinition = {
  id: "og-title",
  name: "OpenGraph Title",
  description: "Page should have an og:title",
  weight: 4,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const has = !!metadata.ogTitle && metadata.ogTitle.trim().length > 0;
    return {
      status: has ? "pass" : "warn",
      message: has ? "og:title is set" : "Missing og:title — will fall back to <title>",
      value: metadata.ogTitle ?? undefined,
    };
  },
};

export const ogDescriptionRule: RuleDefinition = {
  id: "og-description",
  name: "OpenGraph Description",
  description: "Page should have an og:description",
  weight: 4,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const has = !!metadata.ogDescription && metadata.ogDescription.trim().length > 0;
    return {
      status: has ? "pass" : "warn",
      message: has
        ? "og:description is set"
        : "Missing og:description — will fall back to meta description",
      value: metadata.ogDescription ?? undefined,
    };
  },
};
