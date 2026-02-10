import type { SEOConfig } from "./types.js";

/**
 * Define the global SEO configuration for your site.
 * Returns a frozen (immutable) config object.
 *
 * @example
 * ```ts
 * // seo.config.ts
 * import { defineSEO } from 'indxel'
 *
 * export default defineSEO({
 *   siteName: 'MonSaaS',
 *   siteUrl: 'https://monsaas.fr',
 *   titleTemplate: '%s | MonSaaS',
 *   defaultOGImage: '/og-default.png',
 *   locale: 'fr_FR',
 * })
 * ```
 */
export function defineSEO(config: SEOConfig): Readonly<SEOConfig> {
  // Validate required fields
  if (!config.siteName) {
    throw new Error("indxel: siteName is required in SEO config");
  }

  if (!config.siteUrl) {
    throw new Error("indxel: siteUrl is required in SEO config");
  }

  // Normalize siteUrl — strip trailing slash
  const normalized: SEOConfig = {
    ...config,
    siteUrl: config.siteUrl.replace(/\/+$/, ""),
  };

  return Object.freeze(normalized);
}
