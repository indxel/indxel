import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const CONFIG_EXAMPLE = `// seo.config.ts
import { defineSEO } from 'indxel'

export default defineSEO({
  siteName: 'MonSaaS',
  siteUrl: 'https://monsaas.fr',
  titleTemplate: '%s | MonSaaS',
  defaultDescription: 'MonSaaS — La solution qui change tout.',
  defaultOGImage: '/og-default.png',
  locale: 'fr_FR',
  twitter: {
    handle: '@monsaas',
    cardType: 'summary_large_image',
  },
  organization: {
    name: 'MonSaaS',
    logo: 'https://monsaas.fr/logo.png',
    url: 'https://monsaas.fr',
  },
  verification: {
    google: 'google-site-verification-token',
  },
})
`;

export function registerConfigExampleResource(server: McpServer) {
  server.resource(
    "seo-config-example",
    "seo://config-example",
    {
      description: "Example seo.config.ts file showing how to configure indxel for a Next.js project.",
    },
    async () => {
      return {
        contents: [
          {
            uri: "seo://config-example",
            mimeType: "text/plain",
            text: CONFIG_EXAMPLE,
          },
        ],
      };
    },
  );
}
