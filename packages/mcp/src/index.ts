import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  registerSeoCheck,
  registerSeoScore,
  registerSeoAuditUrl,
  registerSeoGenerateMetadata,
  registerSeoGenerateStructuredData,
  registerSeoCrawl,
  registerSeoCheckSitemap,
  registerSeoCheckRobots,
  registerSeoVerifyAssets,
  registerSeoKeywordResearch,
  registerSeoContentGap,
  registerSeoSubmitIndex,
  registerSeoCheckIndexStatus,
} from "./tools/index.js";

import {
  registerRulesResource,
  registerConfigExampleResource,
} from "./resources/index.js";

const server = new McpServer({
  name: "indxel",
  version: "0.1.2",
});

// Register tools
registerSeoCheck(server);
registerSeoScore(server);
registerSeoAuditUrl(server);
registerSeoGenerateMetadata(server);
registerSeoGenerateStructuredData(server);
registerSeoCrawl(server);
registerSeoCheckSitemap(server);
registerSeoCheckRobots(server);
registerSeoVerifyAssets(server);
registerSeoKeywordResearch(server);
registerSeoContentGap(server);
registerSeoSubmitIndex(server);
registerSeoCheckIndexStatus(server);

// Register resources
registerRulesResource(server);
registerConfigExampleResource(server);

// Start with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
