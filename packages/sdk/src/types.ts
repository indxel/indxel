// ============================================================================
// indxel — Type definitions
// ============================================================================

// --------------------------------------------------------------------------
// SEO Configuration (global, per-site)
// --------------------------------------------------------------------------

/** Global SEO configuration for a site. Passed to defineSEO(). */
export interface SEOConfig {
  /** Display name of the site (used in titles, structured data) */
  siteName: string;
  /** Canonical base URL of the site (e.g., "https://monsaas.fr") */
  siteUrl: string;
  /** Default page title when none is specified */
  defaultTitle?: string;
  /** Title template with %s placeholder (e.g., "%s | My Site") */
  titleTemplate?: string;
  /** Default meta description */
  defaultDescription?: string;
  /** Default OpenGraph image URL (absolute or relative) */
  defaultOGImage?: string;
  /** Locale (e.g., "fr_FR", "en_US") */
  locale?: string;
  /** Twitter/X card configuration */
  twitter?: {
    handle: string;
    cardType: "summary" | "summary_large_image";
  };
  /** Organization structured data */
  organization?: {
    name: string;
    logo: string;
    url: string;
  };
  /** Verification meta tags */
  verification?: {
    google?: string;
    yandex?: string;
    bing?: string;
  };
}

// --------------------------------------------------------------------------
// Page-level SEO input
// --------------------------------------------------------------------------

/** Per-page SEO configuration. Passed to createMetadata(). */
export interface PageSEO {
  /** Page title (will be templated via titleTemplate if set) */
  title: string;
  /** Meta description for the page */
  description: string;
  /** URL path relative to siteUrl (e.g., "/blog/my-post") */
  path: string;
  /** OpenGraph image URL (overrides defaultOGImage) */
  ogImage?: string;
  /** Set to true to add noindex directive */
  noindex?: boolean;
  /** Canonical URL override (defaults to siteUrl + path) */
  canonical?: string;
  /** Alternate language versions: { "en": "/en/page", "fr": "/fr/page" } */
  alternates?: Record<string, string>;
  /** Structured data entries to include on this page */
  structuredData?: StructuredDataInput[];
  /** Article-specific metadata */
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    author?: string;
    section?: string;
    tags?: string[];
  };
}

// --------------------------------------------------------------------------
// Structured Data (JSON-LD)
// --------------------------------------------------------------------------

/** Supported JSON-LD schema types */
export type StructuredDataType =
  | "Article"
  | "Product"
  | "FAQ"
  | "HowTo"
  | "Breadcrumb"
  | "Organization"
  | "WebPage"
  | "SoftwareApplication"
  | "WebSite";

/** Input for generating structured data */
export interface StructuredDataInput {
  type: StructuredDataType;
  data: Record<string, unknown>;
}

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

/** Result of metadata validation via validateMetadata() */
export interface ValidationResult {
  /** Overall score from 0 to 100 */
  score: number;
  /** Letter grade based on score */
  grade: "A" | "B" | "C" | "D" | "F";
  /** Rules that passed validation */
  passed: ValidationRule[];
  /** Rules that triggered warnings */
  warnings: ValidationRule[];
  /** Rules that failed validation */
  errors: ValidationRule[];
}

/** A single validation rule result */
export interface ValidationRule {
  /** Unique rule identifier (e.g., "title-present") */
  id: string;
  /** Human-readable rule name */
  name: string;
  /** What this rule checks */
  description: string;
  /** Points this rule is worth (out of 100 total) */
  weight: number;
  /** Whether this rule can block CI builds */
  severity: RuleSeverity;
  /** Result status */
  status: "pass" | "warn" | "error";
  /** Explanation of the result */
  message?: string;
  /** Actual value found */
  value?: string | number;
  /** Expected value or range */
  expected?: string | number;
}

/** Options for the validateMetadata() function */
export interface ValidateOptions {
  /** When true, warnings are treated as errors */
  strict?: boolean;
  /** Rule IDs to skip (won't count toward score) */
  disabledRules?: string[];
}

// --------------------------------------------------------------------------
// Internal: Rule definition (used by rule modules)
// --------------------------------------------------------------------------

/** The variable fields returned by a rule's check function (identity fields are merged automatically) */
export interface RuleCheckResult {
  status: "pass" | "warn" | "error";
  message?: string;
  value?: string | number;
  expected?: string | number;
}

/** Rule severity — critical rules can block CI, optional rules affect score only */
export type RuleSeverity = "critical" | "optional";

/** Definition of a validation rule used internally by rule modules */
export interface RuleDefinition {
  id: string;
  name: string;
  description: string;
  weight: number;
  /** Whether this rule can block CI builds. Defaults to "optional". */
  severity?: RuleSeverity;
  check: (metadata: ResolvedMetadata) => RuleCheckResult;
}

/**
 * Flattened metadata shape used by validation rules.
 * This is what we extract from Next.js Metadata or raw page data.
 */
export interface ResolvedMetadata {
  title?: string | null;
  description?: string | null;
  canonical?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  ogType?: string | null;
  twitterCard?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  robots?: string | null;
  alternates?: Record<string, string> | null;
  structuredData?: object[] | null;
  viewport?: string | null;
  favicon?: string | null;
  images?: Array<{ src: string; alt: string | null }> | null;
}
