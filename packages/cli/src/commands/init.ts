import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { existsSync } from "node:fs";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { detectProject } from "../detect.js";
import { generateIndexNowKey, saveIndexNowKey, loadIndexNowKey } from "../store.js";
import {
  seoConfigTemplate,
  sitemapTemplate,
  robotsTemplate,
} from "../templates.js";

const PRE_PUSH_HOOK = `#!/bin/sh
# indxel SEO guard — blocks push if critical SEO errors are found
echo "\\033[36m[indxel]\\033[0m Running SEO check before push..."
npx indxel-cli check --ci
if [ $? -ne 0 ]; then
  echo ""
  echo "\\033[31m[indxel] Push blocked — fix SEO errors first.\\033[0m"
  echo "\\033[2m  Run 'npx indxel-cli check' for details.\\033[0m"
  exit 1
fi
`;

export const initCommand = new Command("init")
  .description("Initialize indxel in your Next.js project")
  .option("--cwd <path>", "Project directory", process.cwd())
  .option("--force", "Overwrite existing files", false)
  .option("--hook", "Install git pre-push hook to block pushes on SEO errors", false)
  .action(async (opts) => {
    const cwd = opts.cwd;
    const spinner = ora("Detecting project...").start();

    // 1. Detect project
    const project = await detectProject(cwd);

    if (!project.isNextJs) {
      spinner.fail("Not a Next.js project");
      console.log(
        chalk.dim("  indxel currently supports Next.js projects only."),
      );
      console.log(
        chalk.dim("  Make sure you're in a directory with a next.config file."),
      );
      process.exit(1);
    }

    spinner.succeed(
      `Detected Next.js ${project.nextVersion ?? ""} (${project.usesAppRouter ? "App Router" : "Pages Router"})`,
    );

    const ext = project.isTypeScript ? "ts" : "js";
    const filesCreated: string[] = [];

    // 2. Generate seo.config.ts
    if (!project.hasSeoConfig || opts.force) {
      const configPath = join(cwd, `seo.config.${ext}`);
      await writeFile(configPath, seoConfigTemplate(project.isTypeScript), "utf-8");
      filesCreated.push(`seo.config.${ext}`);
      console.log(chalk.green("  ✓") + ` Generated seo.config.${ext}`);
    } else {
      console.log(chalk.dim(`  - seo.config.${ext} already exists (skip)`));
    }

    // 3. Generate sitemap.ts
    if (!project.hasSitemap || opts.force) {
      const sitemapPath = join(cwd, project.appDir, `sitemap.${ext}`);
      await writeFile(sitemapPath, sitemapTemplate(project.isTypeScript), "utf-8");
      filesCreated.push(`${project.appDir}/sitemap.${ext}`);
      console.log(chalk.green("  ✓") + ` Generated ${project.appDir}/sitemap.${ext}`);
    } else {
      console.log(chalk.dim(`  - sitemap already exists (skip)`));
    }

    // 4. Generate robots.ts
    if (!project.hasRobots || opts.force) {
      const robotsPath = join(cwd, project.appDir, `robots.${ext}`);
      await writeFile(robotsPath, robotsTemplate(project.isTypeScript), "utf-8");
      filesCreated.push(`${project.appDir}/robots.${ext}`);
      console.log(chalk.green("  ✓") + ` Generated ${project.appDir}/robots.${ext}`);
    } else {
      console.log(chalk.dim(`  - robots already exists (skip)`));
    }

    // 5. Git pre-push hook
    const gitDir = join(cwd, ".git");
    const hasGit = existsSync(gitDir);

    if (opts.hook || opts.force) {
      if (!hasGit) {
        console.log(chalk.yellow("  ⚠") + " No .git directory found — skip hook install");
      } else {
        const hooksDir = join(gitDir, "hooks");
        const hookPath = join(hooksDir, "pre-push");

        // Check if a pre-push hook already exists
        if (existsSync(hookPath) && !opts.force) {
          const existing = await readFile(hookPath, "utf-8");
          if (existing.includes("indxel")) {
            console.log(chalk.dim("  - pre-push hook already installed (skip)"));
          } else {
            console.log(chalk.yellow("  ⚠") + " pre-push hook already exists (use --force to overwrite)");
          }
        } else {
          await mkdir(hooksDir, { recursive: true });
          await writeFile(hookPath, PRE_PUSH_HOOK, { mode: 0o755 });
          filesCreated.push(".git/hooks/pre-push");
          console.log(chalk.green("  ✓") + " Installed git pre-push hook");
        }
      }
    } else if (hasGit) {
      console.log(chalk.dim("  - Use --hook to install git pre-push guard"));
    }

    // 6. IndexNow — zero-friction setup
    const existingKey = await loadIndexNowKey(cwd);
    if (!existingKey || opts.force) {
      const key = generateIndexNowKey();
      const publicDir = join(cwd, "public");
      if (!existsSync(publicDir)) {
        await mkdir(publicDir, { recursive: true });
      }
      await writeFile(join(publicDir, `${key}.txt`), key, "utf-8");
      await saveIndexNowKey(cwd, key);
      filesCreated.push(`public/${key}.txt`);
      console.log(chalk.green("  ✓") + " IndexNow ready — Bing, Yandex & Naver will pick up your pages on deploy");
    } else {
      // Key exists — make sure the public file is there too
      const keyFile = join(cwd, "public", `${existingKey}.txt`);
      if (existsSync(keyFile)) {
        console.log(chalk.dim("  - IndexNow already set up (skip)"));
      } else {
        const publicDir = join(cwd, "public");
        if (!existsSync(publicDir)) {
          await mkdir(publicDir, { recursive: true });
        }
        await writeFile(keyFile, existingKey, "utf-8");
        filesCreated.push(`public/${existingKey}.txt`);
        console.log(chalk.green("  ✓") + " IndexNow key file restored");
      }
    }

    // 7. Summary
    console.log("");
    if (filesCreated.length > 0) {
      console.log(
        chalk.bold(`  ${filesCreated.length} file${filesCreated.length > 1 ? "s" : ""} created.`),
      );
    } else {
      console.log(chalk.dim("  Nothing to create — all files already exist."));
      console.log(chalk.dim("  Use --force to overwrite."));
    }

    console.log("");
    console.log(chalk.dim("  Next steps:"));
    console.log(chalk.dim(`    1. Edit seo.config.${ext} with your site details`));
    console.log(chalk.dim("    2. Run ") + chalk.bold("npx indxel check") + chalk.dim(" to audit your pages"));
    if (!opts.hook && hasGit) {
      console.log(chalk.dim("    3. Run ") + chalk.bold("npx indxel init --hook") + chalk.dim(" to guard git pushes"));
    }
    console.log("");
    console.log(chalk.dim("  Want continuous monitoring?"));
    console.log(chalk.dim("    Run ") + chalk.bold("npx indxel link") + chalk.dim(" to connect your dashboard."));
    console.log("");
  });
