# indxel

> ESLint for SEO. Your deploy fails on broken meta tags.

[![npm version](https://img.shields.io/npm/v/indxel)](https://www.npmjs.com/package/indxel)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

---

## Quick Start

```bash
npm install indxel
```

```ts
// seo.config.ts
import { defineSEO } from 'indxel'

export default defineSEO({
  siteName: 'My SaaS',
  siteUrl: 'https://mysaas.com',
  titleTemplate: '%s | My SaaS',
  defaultOGImage: '/og-default.png',
})
```

```ts
// app/blog/[slug]/page.tsx
import { createMetadata } from 'indxel'
import seoConfig from '@/seo.config'

export function generateMetadata() {
  return createMetadata({
    title: 'How to Fix Your SEO',
    description: 'A practical guide to metadata validation in Next.js.',
    path: '/blog/how-to-fix-your-seo',
  }, seoConfig)
}
```

Type-safe metadata, canonical URLs, OpenGraph, Twitter cards -- all generated from one config.

---

## Why indxel?

- **Your SEO breaks silently.** A missing og:image, a truncated title, a wrong canonical -- you don't notice until traffic drops. We make it loud.
- **15 validation rules, 0-100 scoring.** Every page gets a score. Every deploy gets a gate.
- **Works with Next.js App Router** out of the box. Returns objects compatible with `generateMetadata()`.
- **Full site crawler** with cross-page analysis, sitemap/robots.txt checking, and asset verification.
- **Keyword research** via Google Autocomplete with content gap analysis.
- **Zero runtime dependencies.** Ships ESM + CJS + full type definitions. Next.js is an optional peer dep.
- **CLI + CI/CD ready.** Pair with `indxel-cli` to block deploys on broken SEO.

---

## API

### `defineSEO(config)`

Define global SEO defaults for your site. Returns a frozen config object.

```ts
import { defineSEO } from 'indxel'

export default defineSEO({
  siteName: 'My SaaS',
  siteUrl: 'https://mysaas.com',
  titleTemplate: '%s | My SaaS',
  defaultDescription: 'The best SaaS for doing things.',
  defaultOGImage: '/og-default.png',
  locale: 'en_US',
  twitter: {
    handle: '@mysaas',
    cardType: 'summary_large_image',
  },
  organization: {
    name: 'My SaaS Inc.',
    logo: '/logo.png',
    url: 'https://mysaas.com',
  },
})
```

### `createMetadata(page, config?)`

Generate a Next.js-compatible Metadata object for a page. Drop it straight into `generateMetadata()`.

```ts
import { createMetadata } from 'indxel'
import seoConfig from '@/seo.config'

export function generateMetadata() {
  return createMetadata({
    title: 'Pricing',
    description: 'Simple, transparent pricing. Start free.',
    path: '/pricing',
    ogImage: '/og-pricing.png',
  }, seoConfig)
}
```

Handles: title templating, canonical URLs, OpenGraph (title, description, image, type), Twitter cards, hreflang alternates, robots directives, and verification tags.

For articles:

```ts
createMetadata({
  title: 'Announcing v2.0',
  description: 'What changed and why it matters.',
  path: '/blog/announcing-v2',
  article: {
    publishedTime: '2026-01-15',
    author: 'Jane Doe',
    tags: ['release', 'seo'],
  },
}, seoConfig)
```

### `generateLD(type, data)`

Generate JSON-LD structured data. Returns a plain object -- serialize it in a `<script>` tag.

```ts
import { generateLD } from 'indxel'

const articleLD = generateLD('Article', {
  headline: 'How to Fix Your SEO',
  datePublished: '2026-01-15',
  author: { name: 'Jane Doe', url: 'https://jane.dev' },
})

const faqLD = generateLD('FAQ', {
  questions: [
    { question: 'What is indxel?', answer: 'ESLint for SEO.' },
    { question: 'Does it work with Next.js?', answer: 'Yes, App Router.' },
  ],
})

// In your component:
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLD) }}
/>
```

Supported types: `Article`, `Product`, `FAQ`, `HowTo`, `Breadcrumb`, `Organization`, `WebPage`, `SoftwareApplication`, `WebSite`.

### `validateMetadata(metadata, options?)`

Validate metadata completeness and quality. Returns a score from 0-100 with detailed rule results.

```ts
import { createMetadata, validateMetadata } from 'indxel'
import seoConfig from '@/seo.config'

const metadata = createMetadata({
  title: 'Home',
  description: 'Welcome to My SaaS.',
  path: '/',
}, seoConfig)

const result = validateMetadata(metadata)

console.log(result.score)    // 85
console.log(result.grade)    // "B"
console.log(result.errors)   // [{ id: 'og-image', message: 'Missing og:image' }]
console.log(result.warnings) // [{ id: 'twitter-card', message: '...' }]
console.log(result.passed)   // [{ id: 'title-present', ... }, ...]
```

Options:

```ts
validateMetadata(metadata, { strict: true }) // warnings become errors
```

### `crawlSite(url, options?)`

Crawl a live website. Discovers pages via internal links, audits each page's metadata, and produces cross-page analysis (duplicate titles, broken links, thin content, orphan pages, structured data summary).

```ts
import { crawlSite } from 'indxel'

const result = await crawlSite('https://mysite.com', {
  maxPages: 100,
  maxDepth: 5,
  delay: 200,
  strict: false,
  ignorePatterns: ['/admin/*', '/api/*'],
})

console.log(result.averageScore) // 82
console.log(result.totalPages)   // 47
console.log(result.analysis.duplicateTitles)
console.log(result.analysis.brokenInternalLinks)
console.log(result.analysis.thinContentPages)
console.log(result.analysis.orphanPages)
```

### `fetchSitemap(url)` / `compareSitemap(sitemapUrls, crawledUrls)`

Fetch and parse a site's sitemap.xml, then compare it against crawled pages.

```ts
import { fetchSitemap, compareSitemap } from 'indxel'

const sitemap = await fetchSitemap('https://mysite.com')
// sitemap.found, sitemap.urls, sitemap.errors

const comparison = compareSitemap(
  sitemap.urls.map(u => u.loc),
  crawledUrls
)
// comparison.inCrawlOnly -- pages missing from sitemap
// comparison.inSitemapOnly -- sitemap URLs not reachable
```

### `fetchRobots(url)` / `checkUrlsAgainstRobots(directives, urls)`

Fetch robots.txt and check which crawled pages are blocked.

```ts
import { fetchRobots, checkUrlsAgainstRobots } from 'indxel'

const robots = await fetchRobots('https://mysite.com')
// robots.found, robots.directives, robots.sitemapUrls, robots.warnings

const blocked = checkUrlsAgainstRobots(robots.directives, crawledUrls)
// [{ path: '/admin', blocked: true, blockedBy: 'Disallow: /admin' }]
```

### `verifyAssets(pages)`

Verify that referenced assets (og:image, favicon, etc.) actually respond.

```ts
import { verifyAssets } from 'indxel'

const result = await verifyAssets(pages.map(p => ({
  url: p.url,
  metadata: p.metadata,
})))
// result.totalChecked, result.totalBroken, result.checks
```

### `researchKeywords(seed, options?)`

Discover keyword opportunities using Google Autocomplete. No API key required.

```ts
import { researchKeywords } from 'indxel'

const result = await researchKeywords('nextjs seo', {
  locale: 'en',
  country: 'us',
})

console.log(result.suggestions)  // direct autocomplete results
console.log(result.questions)    // "how to", "what is", etc.
console.log(result.longTail)     // alphabet expansion + prepositions
console.log(result.totalKeywords)
```

### `analyzeContentGaps(keywords, existingPages)`

Compare keyword opportunities against your existing page content to find gaps.

```ts
import { researchKeywords, crawlSite, analyzeContentGaps } from 'indxel'

const keywords = await researchKeywords('nextjs seo')
const crawl = await crawlSite('https://mysite.com')

const gaps = analyzeContentGaps(
  [...keywords.suggestions, ...keywords.questions, ...keywords.longTail],
  crawl.pages.map(p => ({ url: p.url, metadata: p.metadata }))
)

console.log(gaps.coveragePercent)  // 62
console.log(gaps.gaps)            // keywords you're missing
// [{ keyword: 'nextjs seo best practices', relevance: 'high', suggestedPath: '/blog/nextjs-seo-best-practices' }]
```

---

## Validation Rules

15 rules, 100 points total. Warnings get half credit.

| Rule | Weight | What it checks |
|------|--------|----------------|
| `title-present` | 5 | Page has a `<title>` tag |
| `title-length` | 10 | Title is 50-60 characters (SERP optimal) |
| `description-present` | 5 | Page has a meta description |
| `description-length` | 10 | Description is 120-160 characters |
| `og-image` | 10 | OpenGraph image is set |
| `og-title` | 5 | OpenGraph title is set |
| `og-description` | 5 | OpenGraph description is set |
| `canonical-url` | 10 | Canonical URL is present and absolute |
| `structured-data-present` | 10 | At least one JSON-LD block exists |
| `structured-data-valid` | 5 | JSON-LD has `@context` and `@type` |
| `robots-not-blocking` | 5 | Page is not accidentally noindexed |
| `twitter-card` | 5 | Twitter card type is configured |
| `alternates-hreflang` | 5 | Hreflang alternates declared (if multi-lang) |
| `viewport-meta` | 5 | Viewport meta tag is present |
| `favicon` | 5 | Favicon is referenced |

---

## Scoring

| Grade | Score |
|-------|-------|
| A | >= 90 |
| B | >= 80 |
| C | >= 70 |
| D | >= 60 |
| F | < 60 |

Warnings receive half the rule's weight. Errors receive zero. Strict mode converts all warnings to errors.

---

## TypeScript

Full type definitions included. Key exports:

```ts
import type {
  SEOConfig,
  PageSEO,
  StructuredDataType,
  ValidationResult,
  ValidationRule,
  ValidateOptions,
  ResolvedMetadata,
  MetadataOutput,
  CrawlOptions,
  CrawledPage,
  CrawlResult,
  CrawlAnalysis,
  SitemapResult,
  RobotsResult,
  KeywordResearchResult,
  ContentGapResult,
} from 'indxel'
```

---

## License

[MIT](./LICENSE)
