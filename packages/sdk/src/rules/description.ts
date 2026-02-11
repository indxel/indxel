import type { RuleDefinition, ResolvedMetadata, RuleCheckResult } from "../types.js";

export const descriptionPresentRule: RuleDefinition = {
  id: "description-present",
  name: "Meta Description Present",
  description: "Page must have a meta description",
  weight: 5,
  severity: "critical",
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const has = !!metadata.description && metadata.description.trim().length > 0;
    return {
      status: has ? "pass" : "error",
      message: has ? "Meta description is present" : "Missing meta description",
      value: metadata.description ?? undefined,
    };
  },
};

export const descriptionLengthRule: RuleDefinition = {
  id: "description-length",
  name: "Meta Description Length",
  description: "Meta description should be between 120 and 160 characters",
  weight: 10,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const desc = metadata.description?.trim() ?? "";
    const len = desc.length;

    if (len === 0) {
      return { status: "error", message: "No description to measure", value: 0, expected: "120-160" };
    }

    // Variable reference detected but value unknown — skip length check
    if (desc === "[detected]") {
      return { status: "pass", message: "Description present (dynamic value, length not checked)", value: undefined, expected: "120-160" };
    }

    if (len >= 120 && len <= 160) {
      return { status: "pass", message: `Description length is ${len} characters (ideal range)`, value: len, expected: "120-160" };
    }

    if (len >= 70 && len < 120) {
      return { status: "warn", message: `Description is ${len} characters — slightly short (aim for 120-160)`, value: len, expected: "120-160" };
    }

    if (len > 160 && len <= 200) {
      return { status: "warn", message: `Description is ${len} characters — may be truncated in SERPs`, value: len, expected: "120-160" };
    }

    return {
      status: "error",
      message: len < 70
        ? `Description is only ${len} characters — too short`
        : `Description is ${len} characters — will be truncated in SERPs`,
      value: len,
      expected: "120-160",
    };
  },
};
