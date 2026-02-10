# indxel-ci

CI/CD guard for [indxel](https://github.com/indxel/indxel). Fail builds on broken SEO.

## GitHub Actions

Add to `.github/workflows/seo-check.yml`:

```yaml
name: SEO Check
on: [pull_request]
jobs:
  seo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: indxel/ci@v1
        with:
          threshold: 80
```

The action will:
- Install `indxel-cli`
- Run `indxel check --ci --json` on your project
- Post a PR comment with the score summary
- Fail the check if the score is below the threshold

### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `threshold` | `80` | Minimum average SEO score to pass (0-100) |
| `strict` | `false` | Treat warnings as errors |
| `working-directory` | `.` | Project root directory |

### Outputs

| Output | Description |
|--------|-------------|
| `score` | Average SEO score across all pages |
| `grade` | SEO grade (A/B/C/D/F) |
| `total-pages` | Total number of pages scanned |
| `passed-pages` | Number of pages passing validation |
| `critical-errors` | Number of critical SEO errors |

### PR Comment

On pull requests, the action posts (and updates) a comment like:

```
## Indxel Check

| Metric    | Value      |
|-----------|------------|
| Score     | 91/100     |
| Grade     | A          |
| Pages     | 12/12 pass |
| Errors    | 0          |
| Threshold | 80         |
```

If there are errors, each failing page and its issues are listed.

### Examples

See the [`examples/`](./examples) directory:

- **[seo-check.yml](./examples/seo-check.yml)** — Basic PR check
- **[seo-check-strict.yml](./examples/seo-check-strict.yml)** — Strict mode (warnings = errors, threshold 90)
- **[seo-check-monorepo.yml](./examples/seo-check-monorepo.yml)** — Monorepo with path filter

---

## Vercel

Add the guard script to your build pipeline so broken SEO fails the deploy.

### Option 1: package.json script

```json
{
  "scripts": {
    "build": "node node_modules/indxel-ci/vercel-guard.mjs && next build"
  }
}
```

### Option 2: vercel.json

```json
{
  "buildCommand": "node node_modules/indxel-ci/vercel-guard.mjs && next build"
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INDXEL_THRESHOLD` | `80` | Minimum score to pass |
| `INDXEL_STRICT` | `false` | Treat warnings as errors |

### How it works

The script runs `indxel check --ci --json` before your build. If the SEO score is below the threshold, the script exits with code 1, which fails the Vercel build.

```
[indxel] Running SEO check (threshold: 80)...

[indxel] Score: 91/100 (A)
[indxel] Pages: 12/12 pass

[indxel] PASS — SEO looks good. Ship it.
```

On failure:

```
[indxel] Running SEO check (threshold: 80)...

[indxel] Score: 62/100 (D)
[indxel] Pages: 8/12 pass
[indxel] Errors: 7 critical

[indxel] FAIL — Score 62 is below threshold 80.
```

---

## Requirements

- Node.js 18+
- A Next.js project using App Router
- `indxel-cli` (installed automatically by the GitHub Action, required as a dependency for Vercel)

## Install

For Vercel usage, add the CLI as a dev dependency:

```bash
npm install -D indxel-cli
```

The GitHub Action installs it automatically — no dependency needed.
