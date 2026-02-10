# indxel-mcp

MCP server that exposes [indxel](https://indxel.com) SEO auditing tools to AI assistants.

Works with Claude Desktop, Cursor, Claude Code, and any MCP-compatible client.

## Install

```bash
npm install -g indxel-mcp
```

Or run directly:

```bash
npx indxel-mcp
```

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Cursor

Add to `.cursor/mcp.json` in your project:

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

### Claude Code

```bash
claude mcp add indxel -- npx -y indxel-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `seo_check` | Validate SEO metadata and return a score (0-100), grade (A-F), and detailed rule results |
| `seo_score` | Quick score check — returns just the numeric score and letter grade |
| `seo_audit_url` | Fetch a live URL, extract metadata from HTML, and run a full audit |
| `seo_generate_metadata` | Generate a Next.js-compatible Metadata object from page info |
| `seo_generate_structured_data` | Generate JSON-LD structured data for a given schema type |
| `seo_crawl` | Crawl a website following internal links, audit every page, return per-page scores and cross-page analysis |
| `seo_check_sitemap` | Fetch and analyze a site's sitemap.xml |
| `seo_check_robots` | Fetch and analyze a site's robots.txt |
| `seo_verify_assets` | Verify that SEO assets (og:image, favicon, canonical) are accessible |
| `seo_keyword_research` | Research keyword opportunities using Google Autocomplete |
| `seo_content_gap` | Find content gaps by comparing keyword research against existing pages |

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| `seo-rules` | `seo://rules` | All 15 validation rules with IDs, weights, and descriptions (100 points total) |
| `seo-config-example` | `seo://config-example` | Example `seo.config.ts` for configuring indxel in a Next.js project |

## Example usage

Once configured, ask your AI assistant:

- "Audit the SEO of https://example.com"
- "Crawl my site and find SEO issues"
- "Generate metadata for my pricing page"
- "Check if my sitemap is correct"
- "What keywords should I target for 'project management'?"

## License

MIT
