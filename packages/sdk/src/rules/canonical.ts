import type { RuleDefinition, ResolvedMetadata, RuleCheckResult } from "../types.js";

export const canonicalRule: RuleDefinition = {
  id: "canonical-url",
  name: "Canonical URL",
  description: "Page should have a canonical URL to avoid duplicate content issues",
  weight: 10,
  severity: "critical",
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const canonical = metadata.canonical?.trim();

    if (!canonical) {
      return { status: "error", message: "Missing canonical URL — risk of duplicate content" };
    }

    const isAbsolute = canonical.startsWith("http://") || canonical.startsWith("https://");
    if (!isAbsolute) {
      return {
        status: "warn",
        message: "Canonical URL should be absolute (include https://)",
        value: canonical,
        expected: "https://...",
      };
    }

    return { status: "pass", message: "Canonical URL is set", value: canonical };
  },
};
