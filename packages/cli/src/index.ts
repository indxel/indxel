import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { checkCommand } from "./commands/check.js";
import { crawlCommand } from "./commands/crawl.js";
import { keywordsCommand } from "./commands/keywords.js";
import { indexCommand } from "./commands/index.js";
import { perfCommand } from "./commands/perf.js";
import { linkCommand } from "./commands/link.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("indxel")
    .description("Infrastructure SEO developer-first. ESLint pour le SEO.")
    .version("0.1.0");

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
