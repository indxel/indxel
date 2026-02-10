import type {
  ValidationResult,
  ValidationRule,
  ValidateOptions,
  ResolvedMetadata,
} from "./types.js";
import type { MetadataOutput } from "./metadata.js";
import { allRules } from "./rules/index.js";

/**
 * Validate metadata completeness and quality, returning a score from 0-100.
 *
 * Accepts either a Next.js-compatible Metadata object (from createMetadata)
 * or a ResolvedMetadata object (flat shape used internally).
 *
 * @example
 * ```ts
 * import { createMetadata, validateMetadata } from 'indxel'
 *
 * const metadata = createMetadata({ title: 'Home', description: '...', path: '/' })
 * const result = validateMetadata(metadata)
 *
 * console.log(result.score)  // 85
 * console.log(result.grade)  // "B"
 * console.log(result.errors) // [{ id: 'og-image', ... }]
 * ```
 */
export function validateMetadata(
  metadata: MetadataOutput | ResolvedMetadata,
  options?: ValidateOptions,
): ValidationResult {
  // Normalize to ResolvedMetadata
  const resolved = isResolvedMetadata(metadata) ? metadata : resolveFromNextMetadata(metadata);

  const passed: ValidationRule[] = [];
  const warnings: ValidationRule[] = [];
  const errors: ValidationRule[] = [];

  const disabled = new Set(options?.disabledRules ?? []);

  for (const rule of allRules) {
    // Skip disabled rules entirely (don't count toward score)
    if (disabled.has(rule.id)) continue;

    const checkResult = rule.check(resolved);

    // Merge rule identity fields with check result
    const status = (options?.strict && checkResult.status === "warn")
      ? "error"
      : checkResult.status;

    const result: ValidationRule = {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      weight: rule.weight,
      severity: rule.severity ?? "optional",
      ...checkResult,
      status,
    };

    switch (result.status) {
      case "pass":
        passed.push(result);
        break;
      case "warn":
        warnings.push(result);
        break;
      case "error":
        errors.push(result);
        break;
    }
  }

  // Calculate score: sum of weights for passed rules
  // Warnings get half credit
  const score = Math.round(
    passed.reduce((sum, r) => sum + r.weight, 0) +
      warnings.reduce((sum, r) => sum + r.weight * 0.5, 0),
  );

  const grade = scoreToGrade(score);

  return { score, grade, passed, warnings, errors };
}

/**
 * Convert a Next.js Metadata-compatible object to a flat ResolvedMetadata shape.
 * This is exported for use by the CLI which may need to extract metadata from HTML.
 */
export function resolveFromNextMetadata(metadata: MetadataOutput): ResolvedMetadata {
  const og = metadata.openGraph;
  const tw = metadata.twitter;
  const alt = metadata.alternates;

  // Extract OG image URL from various shapes
  let ogImage: string | null = null;
  if (og?.images) {
    const first = og.images[0];
    if (typeof first === "string") {
      ogImage = first;
    } else if (first && typeof first === "object" && "url" in first) {
      ogImage = first.url;
    }
  }

  // Extract robots string
  let robots: string | null = null;
  if (metadata.robots) {
    if (typeof metadata.robots === "string") {
      robots = metadata.robots;
    } else {
      const parts: string[] = [];
      if (metadata.robots.index === false) parts.push("noindex");
      else parts.push("index");
      if (metadata.robots.follow === false) parts.push("nofollow");
      else parts.push("follow");
      robots = parts.join(", ");
    }
  }

  return {
    title: typeof metadata.title === "string" ? metadata.title : null,
    description: metadata.description ?? null,
    canonical: alt?.canonical
      ? typeof alt.canonical === "string"
        ? alt.canonical
        : null
      : null,
    ogTitle: og?.title ?? null,
    ogDescription: og?.description ?? null,
    ogImage,
    ogType: og?.type ?? null,
    twitterCard: tw?.card ?? null,
    twitterTitle: tw?.title ?? null,
    twitterDescription: tw?.description ?? null,
    robots,
    alternates: alt?.languages ?? null,
    structuredData: null, // Not in Next.js Metadata — added separately
    viewport: null, // Next.js handles this automatically
    favicon: null, // Not in Metadata type
  };
}

/** Check if the input is already a ResolvedMetadata (has ogTitle field) */
function isResolvedMetadata(
  input: MetadataOutput | ResolvedMetadata,
): input is ResolvedMetadata {
  return "ogTitle" in input || "ogImage" in input || "twitterCard" in input;
}

/** Convert numeric score to letter grade */
function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
