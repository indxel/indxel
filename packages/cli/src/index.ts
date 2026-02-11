import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { checkCommand } from "./commands/check.js";
import { crawlCommand } from "./commands/crawl.js";
import { keywordsCommand } from "./commands/keywords.js";
import { indexCommand } from "./commands/index.js";
import { perfCommand } from "./commands/perf.js";
import { linkCommand } from "./commands/link.js";

// Injected at build time by tsup define
declare const __CLI_VERSION__: string;
const cliVersion = typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.3.1";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("indxel")
    .description("Infrastructure SEO developer-first. ESLint pour le SEO.")
    .version(cliVersion);

  program.addCommand(initCommand);
  program.addCommand(checkCommand);
  program.addCommand(crawlCommand);
  program.addCommand(keywordsCommand);
  program.addCommand(indexCommand);
  program.addCommand(perfCommand);
  program.addCommand(linkCommand);

  return program;
}

export { initCommand, checkCommand, crawlCommand, keywordsCommand, indexCommand, perfCommand, linkCommand };
