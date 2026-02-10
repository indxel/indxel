import type { RuleDefinition, ResolvedMetadata, RuleCheckResult } from "../types.js";

export const structuredDataPresentRule: RuleDefinition = {
  id: "structured-data-present",
  name: "Structured Data Present",
  description: "Page should have at least one JSON-LD structured data block",
  weight: 8,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    const has = Array.isArray(metadata.structuredData) && metadata.structuredData.length > 0;
    return {
      status: has ? "pass" : "warn",
      message: has
        ? `${metadata.structuredData!.length} structured data block(s) found`
        : "No structured data — rich results won't appear in SERPs",
      value: metadata.structuredData?.length ?? 0,
    };
  },
};

export const structuredDataValidRule: RuleDefinition = {
  id: "structured-data-valid",
  name: "Structured Data Valid",
  description: "JSON-LD structured data should have @context and @type fields",
  weight: 2,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    if (!Array.isArray(metadata.structuredData) || metadata.structuredData.length === 0) {
      return { status: "warn", message: "No structured data to validate" };
    }

    const invalidCount = metadata.structuredData.filter((sd) => {
      const entry = sd as Record<string, unknown>;
      return !entry["@context"] || !entry["@type"];
    }).length;

    if (invalidCount > 0) {
      return {
        status: "error",
        message: `${invalidCount} structured data block(s) missing @context or @type`,
        value: invalidCount,
      };
    }

    return {
      status: "pass",
      message: "All structured data blocks have valid @context and @type",
      value: metadata.structuredData.length,
    };
  },
};

const REQUIRED_FIELDS: Record<string, string[]> = {
  Article: ["headline", "author", "datePublished"],
  Product: ["name", "description"],
  FAQ: ["mainEntity"],
  Organization: ["name", "url"],
  WebSite: ["name", "url"],
  BreadcrumbList: ["itemListElement"],
  HowTo: ["name", "step"],
  SoftwareApplication: ["name", "applicationCategory"],
};

function getSchemaEntries(structuredData: object[]): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];
  for (const sd of structuredData) {
    const obj = sd as Record<string, unknown>;
    if (obj["@type"]) entries.push(obj);
    if (Array.isArray(obj["@graph"])) {
      for (const item of obj["@graph"] as Record<string, unknown>[]) {
        if (item["@type"]) entries.push(item);
      }
    }
  }
  return entries;
}

export const structuredDataCompleteRule: RuleDefinition = {
  id: "structured-data-complete",
  name: "Structured Data Complete",
  description: "JSON-LD structured data should have required fields for its @type",
  weight: 5,
  check(metadata: ResolvedMetadata): RuleCheckResult {
    if (!Array.isArray(metadata.structuredData) || metadata.structuredData.length === 0) {
      return { status: "warn", message: "No structured data to validate" };
    }

    const entries = getSchemaEntries(metadata.structuredData);
    const issues: string[] = [];

    for (const entry of entries) {
      const type = typeof entry["@type"] === "string" ? entry["@type"] : null;
      if (!type || !REQUIRED_FIELDS[type]) continue;

      const missing = REQUIRED_FIELDS[type].filter((field) => {
        const val = entry[field];
        return val === undefined || val === null || val === "";
      });

      if (missing.length > 0) {
        if (missing.length === REQUIRED_FIELDS[type].length) {
          issues.push(`${type}: missing all required fields (${missing.join(", ")})`);
        } else {
          issues.push(`${type}: missing ${missing.join(", ")}`);
        }
      }
    }

    if (issues.length === 0) {
      return { status: "pass", message: "All structured data blocks have required fields" };
    }

    const allMissing = issues.some((i) => i.includes("missing all"));
    return {
      status: allMissing ? "error" : "warn",
      message: issues.join("; "),
      value: issues.length,
    };
  },
};
