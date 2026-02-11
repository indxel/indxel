<p align="center">
  <a href="https://indxel.com">
    <img src="./assets/logo.png" alt="Indxel" width="80" />
  </a>
</p>

<h1 align="center">Indxel</h1>

<p align="center">
  <strong>Broken SEO should break your build.</strong>
</p>

<p align="center">
  Open-source SEO infrastructure for developers.<br />
  A CLI, an SDK, an MCP server, and a CI/CD guard — not another marketing tool.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/indxel"><img src="https://img.shields.io/npm/v/indxel?style=flat-square&color=C25E45" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/indxel-cli"><img src="https://img.shields.io/npm/v/indxel-cli?style=flat-square&color=C25E45&label=cli" alt="CLI version" /></a>
  <a href="https://github.com/indxel/indxel/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License" /></a>
  <a href="https://indxel.com"><img src="https://img.shields.io/badge/docs-indxel.com-blue?style=flat-square" alt="Docs" /></a>
</p>

<br />

https://github.com/user-attachments/assets/668dccd0-67c9-4c54-bd81-70abbe3ecb3e

<br />

## What is Indxel?

Indxel catches SEO issues **before they reach production**. Missing meta tags, broken og:images, duplicate H1s, missing structured data — if it's broken, your build fails.

Think of it as **ESLint for SEO**.

```bash
npx indxel check
```

```
  indxel — SEO check

  ✓ 44/47 pages pass   Score: 91/100 (A)

  ✗ /blog/my-post       Missing og:image
  ✗ /pricing            Title too long (72 chars > 60)
  ✗ /about              Duplicate H1 tags

  3 errors · 2 warnings · 47 pages checked
```

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`indxel`](./packages/sdk) | TypeScript SDK — `defineSEO()`, `createMetadata()`, `generateLD()` | `npm i indxel` |
| [`indxel-cli`](./packages/cli) | CLI — `init`, `check`, `crawl`, `keywords`, `index` | `npx indxel` |
| [`indxel-mcp`](./packages/mcp) | MCP server for Claude, Cursor, Windsurf | `npx indxel-mcp` |
| [`indxel-ci`](./packages/ci) | CI/CD guard — GitHub Actions + Vercel | [Setup →](./packages/ci) |

## Quick Start

### 1. Install

```bash
npm install indxel indxel-cli
```

### 2. Initialize

```bash
npx indxel init
```

Creates `seo.config.ts`, `sitemap.ts`, and `robots.ts` in your project.

### 3. Check

```bash
npx indxel check
```

Scans your codebase for SEO issues. 30 seconds, zero config.

### 4. Guard your deploys

```bash
npx indxel check --ci --threshold 80
```

Exits with code 1 if the score drops below 80. Add it to your CI pipeline and broken SEO never ships again.

## SDK

```typescript
import { defineSEO, createMetadata, generateLD } from 'indxel'

// Define your SEO config once
const seo = defineSEO({
  siteName: 'My App',
  siteUrl: 'https://myapp.com',
  defaultTitle: 'My App — Build faster',
  defaultDescription: 'The best app for developers.',
  defaultOgImage: '/og.png',
})

// Generate Next.js metadata
export const metadata = createMetadata(seo, {
  title: 'Pricing',
  description: 'Simple, transparent pricing.',
  path: '/pricing',
})

// Generate JSON-LD structured data
export const jsonLd = generateLD('Organization', {
  name: 'My App',
  url: 'https://myapp.com',
})
```

Full SDK docs → [`packages/sdk`](./packages/sdk)

## CLI Commands

| Command | Description |
|---------|-------------|
| `indxel init` | Scaffold SEO boilerplate (seo.config.ts, sitemap, robots) |
| `indxel check` | Static analysis of your metadata files |
| `indxel check --diff` | Compare SEO between current branch and main |
| `indxel check --ci` | CI mode — exits 1 on failures, machine-readable output |
| `indxel crawl <url>` | Live crawl and audit a running site |
| `indxel keywords <seed>` | Keyword research via Google Autocomplete |
| `indxel index <url>` | Check indexation readiness |

Full CLI docs → [`packages/cli`](./packages/cli)

## CI/CD Integration

### GitHub Actions

```yaml
name: SEO Guard
on: [pull_request]

jobs:
  seo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - uses: indxel/indxel/packages/ci@v1
        with:
          threshold: 80
```

### Vercel

```json
{
  "buildCommand": "npx indxel check --ci --threshold 80 && next build"
}
```

Full CI/CD docs → [`packages/ci`](./packages/ci)

## MCP Server

Use Indxel with AI assistants. Claude, Cursor, Windsurf — they can audit your SEO in real time.

```json
{
  "mcpServers": {
    "indxel": {
      "command": "npx",
      "args": ["-y", "indxel-mcp"]
    }
  }
}
```

11 tools available: `seo_check`, `seo_audit_url`, `seo_crawl`, `seo_generate_metadata`, and more.

Full MCP docs → [`packages/mcp`](./packages/mcp)

## 15 Built-in Rules

| Rule | What it checks |
|------|---------------|
| `title-present` | Page has a `<title>` tag |
| `title-length` | Title is 30-60 characters |
| `description-present` | Meta description exists |
| `description-length` | Description is 120-160 characters |
| `og-title` | Open Graph title is set |
| `og-description` | Open Graph description is set |
| `og-image` | Open Graph image is set |
| `canonical` | Canonical URL is defined |
| `h1-single` | Exactly one H1 per page |
| `h1-present` | At least one H1 exists |
| `robots-valid` | No conflicting robot directives |
| `structured-data` | JSON-LD structured data present |
| `lang-attribute` | `<html lang>` is set |
| `viewport` | Viewport meta tag exists |
| `charset` | Character encoding is defined |

## Indxel Cloud

The open-source tools handle validation and auditing. [Indxel Cloud](https://indxel.com) adds:

- **Dashboard** — monitoring, historical trends, team overview
- **Auto-indexation** — IndexNow + Google Indexing API, auto-retry
- **Alerts** — email notifications on score drops and indexation issues
- **Scheduled crawls** — daily/weekly automated checks

[Get started free →](https://indxel.com)

## Contributing

We welcome contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/indxel/indxel.git
cd indxel
npm install
npm run build
npm test
```

## License

[MIT](./LICENSE) — use it however you want.

<p align="center">
  <sub>Built by <a href="https://indxel.com">Indxel</a>. Star the repo if it's useful.</sub>
</p>
