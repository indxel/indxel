# indxel-cli

> 30 seconds. Zero config. Your SEO score, in the terminal.

[![npm version](https://img.shields.io/npm/v/indxel-cli)](https://www.npmjs.com/package/indxel-cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Install

```bash
npm install -g indxel-cli
```

Or run directly:

```bash
npx indxel-cli check
```

---

## Quick Start

```bash
# Initialize config and boilerplate files
npx indxel-cli init

# Audit all pages (static analysis)
npx indxel-cli check

# Crawl a live site
npx indxel-cli crawl https://yoursite.com

# Research keywords
npx indxel-cli keywords "nextjs seo"

# Check indexation status
npx indxel-cli index https://yoursite.com
```

---

## Commands

### `indxel init`

Scaffold SEO boilerplate in your Next.js project.

```bash
npx indxel-cli init
npx indxel-cli init --hook   # + install git pre-push guard
```

Creates:
- `seo.config.ts` -- Global SEO configuration using `defineSEO()`
- `app/sitemap.ts` -- Next.js dynamic sitemap
- `app/robots.ts` -- Next.js robots configuration
- `.git/hooks/pre-push` -- (with `--hook`) SEO guard that blocks pushes on critical errors

Options:
- `--cwd <path>` -- Project directory (default: current directory)
- `--force` -- Overwrite existing files
- `--hook` -- Install git pre-push hook

```
$ npx indxel-cli init --hook

  ✓ Detected Next.js 15 (App Router)
  ✓ Generated seo.config.ts
  ✓ Generated src/app/sitemap.ts
  ✓ Generated src/app/robots.ts
  ✓ Installed git pre-push hook

  4 files created.
```

The pre-push hook runs `npx indxel-cli check --ci` before every `git push`. If critical SEO errors are found, the push is blocked.

---

### `indxel check`

Audit SEO metadata for all pages in your project (static analysis of source code).

```bash
npx indxel-cli check
```

Options:
- `--ci` -- CI/CD mode: strict validation, exits with code 1 on any error
- `--diff` -- Compare results with previous check run
- `--json` -- Output results as JSON (for tooling integration)
- `--strict` -- Treat warnings as errors
- `--cwd <path>` -- Project directory

```
$ npx indxel-cli check

  Found 5 pages

  Checking 5 pages...

  ✓ /                 92/100
  ✓ /pricing          88/100
  ✓ /blog             85/100
  ✗ /blog/my-post     62/100
    ✗ Missing og:image -- social shares will look broken
    ⚠ Title is 42 characters -- slightly short (aim for 50-60)
  ✓ /about            90/100

  Score: 83/100 (B)
  Pages: 4/5 pass SEO validation
  1 critical issue. Fix before deploying.
```

### `indxel check --diff`

Track SEO score changes between runs. Results are stored in `.indxel/last-check.json`.

```
$ npx indxel-cli check --diff

  SEO Diff:

  Score: 78 -> 83 (+5)

  IMPROVEMENTS (2):
    + /pricing  82 -> 88
    + /about    85 -> 90

  REGRESSIONS (1):
    - /blog/my-post  70 -> 62
```

---

### `indxel crawl <url>`

Crawl a live website, audit every page, check sitemap, robots.txt, and assets. Cross-page analysis included.

```bash
npx indxel-cli crawl https://yoursite.com
```

Options:
- `--max-pages <n>` -- Maximum pages to crawl (default: 50)
- `--max-depth <n>` -- Maximum link depth (default: 5)
- `--delay <ms>` -- Delay between requests (default: 200ms)
- `--push` -- Push results to the Indxel dashboard
- `--api-key <key>` -- API key for `--push` (or set `INDXEL_API_KEY`)
- `--ignore <patterns>` -- Comma-separated path patterns to exclude (e.g. `/app/*,/admin/*`)
- `--strict` -- Treat warnings as errors
- `--json` -- Output results as JSON
- `--skip-assets` -- Skip asset verification
- `--skip-sitemap` -- Skip sitemap check
- `--skip-robots` -- Skip robots.txt check

```
$ npx indxel-cli crawl https://mysite.com --push

  indxel crawl -- https://mysite.com

  ✓ robots.txt found
  ✓ Crawled 47 pages in 12.3s
  ✓ sitemap.xml found -- 52 URLs
  ✓ Verified 94 assets

  - Duplicate titles
    ✗ "My Site" (3 pages)

  Pages crawled:  47
  Average score:  86/100 (B)
  Errors:         3
  Warnings:       8

  ✓ Pushed to dashboard -- check clxyz123
```

#### Push to Dashboard

The `--push` flag sends results to the [Indxel dashboard](https://indxel.com/dashboard) where you can track score evolution between crawls.

```bash
# Using --api-key flag
npx indxel-cli crawl https://yoursite.com --push --api-key ix_your_key

# Or using environment variable
export INDXEL_API_KEY=ix_your_key
npx indxel-cli crawl https://yoursite.com --push
```

Get your API key from **Dashboard > Settings > API Keys**.

---

### `indxel keywords <seed>`

Research keyword opportunities using Google Autocomplete. No API key required.

```bash
npx indxel-cli keywords "nextjs seo"
npx indxel-cli keywords "nextjs seo" --site mysite.com   # + content gap analysis
```

Options:
- `--locale <locale>` -- Language locale (default: en)
- `--country <country>` -- Country code (default: us)
- `--site <url>` -- Site URL to analyze content gaps against
- `--max-pages <n>` -- Max pages to crawl for gap analysis (default: 30)
- `--json` -- Output as JSON

```
$ npx indxel-cli keywords "nextjs seo"

  indxel keywords -- "nextjs seo"

  ✓ Found 156 keywords

  Direct suggestions (8)
    nextjs seo best practices
    nextjs seo metadata
    nextjs seo optimization
    ...

  Questions (24)
    ? how to improve seo in nextjs
    ? what is nextjs metadata
    ...

  Long-tail (124)
    nextjs seo plugin
    nextjs seo analyzer
    ...
```

With `--site`, it crawls your site and identifies which keywords you already cover and which ones are content gaps:

```
$ npx indxel-cli keywords "nextjs seo" --site mysite.com

  ✓ Found 156 keywords
  ✓ Crawled 28 pages

  Content coverage: 42/156 keywords (27%)

  High priority gaps (18)
    ✗ "nextjs seo best practices" -> guide at /blog/nextjs-seo-best-practices
    ✗ "nextjs metadata tutorial" -> guide at /blog/nextjs-metadata-tutorial

  Medium priority gaps (34)
    ⚠ "nextjs seo vs gatsby" -> comparison at /compare/nextjs-seo-vs-gatsby
```

---

### `indxel index <url>`

Check indexation readiness and submit pages to search engines.

```bash
npx indxel-cli index https://yoursite.com                     # free diagnostic
npx indxel-cli index https://yoursite.com --check             # check indexation (Pro)
npx indxel-cli index https://yoursite.com --indexnow-key KEY  # submit IndexNow (Pro)
```

Options:
- `--check` -- Check which pages are indexed in Google cache (requires Pro plan + API key)
- `--indexnow-key <key>` -- Submit URLs via IndexNow to Bing/Yandex/DuckDuckGo (requires Pro plan + API key)
- `--api-key <key>` -- Indxel API key (required for `--check` and `--indexnow-key`)
- `--json` -- Output as JSON

The free diagnostic checks your sitemap and robots.txt, then provides setup instructions for Google Search Console and IndexNow.

```
$ npx indxel-cli index mysite.com

  indxel index -- https://mysite.com

  ✓ Found sitemap -- 52 URLs
  ✓ robots.txt references sitemap

  IndexNow (Bing, Yandex, DuckDuckGo)
    1. Generate a key at https://www.bing.com/indexnow
    2. Host the key file at https://mysite.com/{key}.txt
    3. Run: npx indxel index mysite.com --indexnow-key YOUR_KEY

  Google Search Console
    1. Go to https://search.google.com/search-console
    2. Add & verify mysite.com
    3. Submit your sitemap: Sitemaps > Add > sitemap.xml

  Sitemap:     52 URLs
  robots.txt:  ✓ references sitemap
  IndexNow:    not configured (use --indexnow-key)
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: SEO Check
on: [push, pull_request]

jobs:
  seo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx indxel-cli check --ci
```

### Vercel (build command)

```json
{
  "scripts": {
    "build": "npx indxel-cli check --ci && next build"
  }
}
```

### Git pre-push hook

```bash
npx indxel-cli init --hook
```

Blocks `git push` if critical SEO errors are found. No CI setup required.

---

## Requirements

- Node.js >= 18
- Next.js App Router project (`app/` or `src/app/` directory) for `check` and `init`
- Any website for `crawl`, `index`, and `keywords`

---

## Related

- [`indxel`](https://www.npmjs.com/package/indxel) -- The SDK. Define metadata, generate JSON-LD, validate, crawl.
- [indxel.com](https://indxel.com) -- Dashboard for monitoring SEO over time.

---

## License

[MIT](./LICENSE)
