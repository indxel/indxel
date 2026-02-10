import type { RuleDefinition, ResolvedMetadata, RuleCheckResult } from "../types.js";

export const titlePresentRule: RuleDefinition = {
  id: "title-present",
  name: "Title Present",
  description: "Page must have a title tag",
  weight: 5,
  severity: "critical",
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const hasTitle = !!metadata.title && metadata.title.trim().length > 0;
    return {
      status: hasTitle ? "pass" : "error",
      message: hasTitle ? "Title tag is present" : "Missing title tag",
      value: metadata.title ?? undefined,
    };
  },
};

export const titleLengthRule: RuleDefinition = {
  id: "title-length",
  name: "Title Length",
  description: "Title should be between 50 and 60 characters for optimal display in SERPs",
  weight: 10,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const title = metadata.title?.trim() ?? "";
    const len = title.length;

    if (len === 0) {
      return { status: "error", message: "No title to measure", value: 0, expected: "50-60" };
    }

    if (len >= 50 && len <= 60) {
      return { status: "pass", message: `Title length is ${len} characters (ideal range)`, value: len, expected: "50-60" };
    }

    if (len >= 30 && len < 50) {
      return { status: "warn", message: `Title is ${len} characters — slightly short (aim for 50-60)`, value: len, expected: "50-60" };
    }

    if (len > 60 && len <= 70) {
      return { status: "warn", message: `Title is ${len} characters — slightly long, may be truncated in SERPs`, value: len, expected: "50-60" };
    }

    return {
      status: "error",
      message: len < 30
        ? `Title is only ${len} characters — too short`
        : `Title is ${len} characters — will be truncated in SERPs`,
      value: len,
      expected: "50-60",
    };
  },
};
