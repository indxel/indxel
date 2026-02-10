# Contributing to Indxel

Thanks for your interest in contributing. Here's how to get started.

## Development Setup

```bash
git clone https://github.com/indxel/indxel.git
cd indxel
npm install
npm run build
npm test
```

### Project Structure

```
indxel/
├── packages/
│   ├── sdk/       # Core TypeScript library (indxel)
│   ├── cli/       # CLI tool (indxel-cli)
│   ├── mcp/       # MCP server for AI assistants (indxel-mcp)
│   └── ci/        # CI/CD guard (GitHub Actions + Vercel)
```

### Running Tests

```bash
# All packages
npm test

# Single package
cd packages/sdk && npm test
cd packages/cli && npm test
```

### Building

```bash
# All packages
npm run build

# Single package
cd packages/sdk && npm run build
```

## Pull Requests

1. Fork the repo and create a branch from `main`.
2. Make your changes. Add tests if you're adding functionality.
3. Run `npm test` and `npm run build` to verify nothing breaks.
4. Open a PR with a clear description of what changed and why.

### Commit Messages

Use clear, imperative commit messages:

```
fix: handle missing og:image in crawl results
feat: add title-unique rule for cross-page checks
docs: improve SDK quickstart example
```

### What Makes a Good PR

- **Focused** — one feature or fix per PR.
- **Tested** — new rules need test cases, new commands need integration tests.
- **Documented** — update the relevant package README if behavior changes.

## Adding a New SEO Rule

1. Create the rule in `packages/sdk/src/rules/`.
2. Add it to the rules registry in `packages/sdk/src/validate.ts`.
3. Write tests in `packages/sdk/src/__tests__/`.
4. Add a row to the rules table in `packages/sdk/README.md`.

## Adding a New CLI Command

1. Create the command in `packages/cli/src/commands/`.
2. Register it in `packages/cli/src/bin.ts`.
3. Write tests in `packages/cli/src/__tests__/`.
4. Document it in `packages/cli/README.md`.

## Code Style

- TypeScript strict mode.
- No `any` types unless absolutely necessary.
- Use existing utilities (`cn()`, shared types) instead of creating new ones.
- Keep dependencies minimal — every new dep needs justification.

## Reporting Issues

Open an issue on [GitHub](https://github.com/indxel/indxel/issues) with:

- What you expected to happen.
- What actually happened.
- Steps to reproduce.
- Node version and OS.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
