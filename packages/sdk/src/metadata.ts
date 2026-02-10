import type { SEOConfig, PageSEO } from "./types.js";

/**
 * Next.js Metadata type (subset we generate).
 * We define our own compatible type to avoid hard runtime dep on next.
 * This is structurally compatible with next's Metadata.
 */
export interface MetadataOutput {
  title?: string;
  description?: string;
  openGraph?: {
    title?: string;
    description?: string;
    url?: string;
    siteName?: string;
    images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
    locale?: string;
    type?: string;
    article?: {
      publishedTime?: string;
      modifiedTime?: string;
      authors?: string[];
      section?: string;
      tags?: string[];
    };
  };
  twitter?: {
    card?: "summary" | "summary_large_image";
    title?: string;
    description?: string;
    creator?: string;
    images?: string[];
  };
  alternates?: {
    canonical?: string;
    languages?: Record<string, string>;
  };
  robots?: {
    index?: boolean;
    follow?: boolean;
  };
  verification?: {
    google?: string;
    yandex?: string;
    other?: Record<string, string>;
  };
  other?: Record<string, string>;
}

/**
 * Create a Next.js-compatible Metadata object from page SEO data and global config.
 *
 * @example
 * ```ts
 * import { createMetadata } from 'indxel'
 * import seoConfig from '@/seo.config'
 *
 * export function generateMetadata() {
 *   return createMetadata({
 *     title: 'Blog Post Title',
 *     description: 'A short description of this post.',
 *     path: '/blog/my-post',
 *   }, seoConfig)
 * }
 * ```
 */
export function createMetadata(page: PageSEO, config?: SEOConfig): MetadataOutput {
  const siteName = config?.siteName;
  const siteUrl = config?.siteUrl?.replace(/\/+$/, "") ?? "";

  // Build the full title with template
  const title = buildTitle(page.title, config?.titleTemplate);

  // Resolve canonical URL
  const canonical = page.canonical ?? (siteUrl ? `${siteUrl}${page.path}` : page.path);

  // Resolve OG image
  const ogImageUrl = page.ogImage ?? config?.defaultOGImage;
  const ogImage = ogImageUrl ? resolveUrl(ogImageUrl, siteUrl) : undefined;

  const metadata: MetadataOutput = {
    title,
    description: page.description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonical,
      siteName,
      locale: config?.locale,
      type: page.article ? "article" : "website",
    },
  };

  // OG image
  if (ogImage && metadata.openGraph) {
    metadata.openGraph.images = [{ url: ogImage, alt: page.title }];
  }

  // Article metadata
  if (page.article && metadata.openGraph) {
    metadata.openGraph.article = {
      publishedTime: page.article.publishedTime,
      modifiedTime: page.article.modifiedTime,
      authors: page.article.author ? [page.article.author] : undefined,
      section: page.article.section,
      tags: page.article.tags,
    };
  }

  // Twitter card
  if (config?.twitter) {
    metadata.twitter = {
      card: config.twitter.cardType,
      title: page.title,
      description: page.description,
      creator: config.twitter.handle,
    };
    if (ogImage) {
      metadata.twitter.images = [ogImage];
    }
  }

  // Alternates / hreflang
  if (page.alternates && metadata.alternates) {
    metadata.alternates.languages = {};
    for (const [lang, path] of Object.entries(page.alternates)) {
      metadata.alternates.languages[lang] = siteUrl ? `${siteUrl}${path}` : path;
    }
  }

  // noindex
  if (page.noindex) {
    metadata.robots = { index: false, follow: true };
  }

  // Verification
  if (config?.verification) {
    metadata.verification = {};
    if (config.verification.google) {
      metadata.verification.google = config.verification.google;
    }
    if (config.verification.yandex) {
      metadata.verification.yandex = config.verification.yandex;
    }
    if (config.verification.bing) {
      metadata.verification.other = { "msvalidate.01": config.verification.bing };
    }
  }

  return metadata;
}

/** Apply title template ("%s | Site" → "Page Title | Site") */
function buildTitle(title: string, template?: string): string {
  if (!template) return title;
  return template.replace(/%s/g, title);
}

/** Resolve a potentially relative URL against the site URL */
function resolveUrl(url: string, siteUrl: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${siteUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}
