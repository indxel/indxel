import type { RuleDefinition, ResolvedMetadata, RuleCheckResult } from "../types.js";

export const h1PresentRule: RuleDefinition = {
  id: "h1-present",
  name: "H1 Heading Present",
  description: "Page should have exactly one H1 heading",
  weight: 8,
  severity: "critical",
  check(metadata: ResolvedMetadata): RuleCheckResult {
    // Field absent = static check or non-crawl context — skip silently
    if (metadata.h1s === undefined || metadata.h1s === null) {
      return { status: "pass", message: "H1 check skipped (not available in static analysis)" };
    }

    const count = metadata.h1s.length;

    if (count === 1) {
      return { status: "pass", message: `H1 found: "${metadata.h1s[0]}"`, value: count, expected: 1 };
    }

    if (count === 0) {
      return { status: "error", message: "No H1 heading found — every page needs one", value: 0, expected: 1 };
    }

    return {
      status: "warn",
      message: `${count} H1 headings found — use exactly one per page`,
      value: count,
      expected: 1,
    };
  },
};

export const contentLengthRule: RuleDefinition = {
  id: "content-length",
  name: "Content Length",
  description: "Page should have sufficient text content (at least 200 words)",
  weight: 5,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    // Field absent = static check or non-crawl context — skip silently
    if (metadata.wordCount === undefined || metadata.wordCount === null) {
      return { status: "pass", message: "Content length check skipped (not available in static analysis)" };
    }

    const words = metadata.wordCount;

    if (words >= 300) {
      return { status: "pass", message: `${words} words — good content length`, value: words, expected: ">=200" };
    }

    if (words >= 200) {
      return { status: "pass", message: `${words} words — acceptable content length`, value: words, expected: ">=200" };
    }

    if (words >= 50) {
      return { status: "warn", message: `Only ${words} words — thin content may hurt rankings`, value: words, expected: ">=200" };
    }

    return {
      status: "error",
      message: `Only ${words} words — page has almost no content`,
      value: words,
      expected: ">=200",
    };
  },
};
