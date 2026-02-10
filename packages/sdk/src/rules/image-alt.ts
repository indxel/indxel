import type { RuleDefinition, ResolvedMetadata, RuleCheckResult } from "../types.js";

export const imageAltTextRule: RuleDefinition = {
  id: "image-alt-text",
  name: "Image Alt Text",
  description: "All images should have descriptive alt text for accessibility and SEO",
  weight: 5,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    if (!metadata.images || metadata.images.length === 0) {
      return { status: "pass", message: "No images found on page" };
    }

    const total = metadata.images.length;
    const missingAlt = metadata.images.filter((img) => img.alt === null || img.alt.trim() === "").length;

    if (missingAlt === 0) {
      return {
        status: "pass",
        message: `All ${total} image(s) have alt text`,
        value: total,
      };
    }

    const ratio = missingAlt / total;
    return {
      status: ratio >= 0.5 ? "error" : "warn",
      message: `${missingAlt}/${total} image(s) missing alt text`,
      value: missingAlt,
      expected: 0,
    };
  },
};
