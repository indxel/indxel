import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadProjectConfig, saveProjectConfig, loadIndexNowKey } from "../store.js";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function openBrowser(url: string): Promise<void> {
  const { platform } = process;
  const { exec } = await import("node:child_process");

  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "start"
        : "xdg-open";

  exec(`${cmd} ${url}`);
}

export const linkCommand = new Command("link")
  .description("Link this project to your Indxel dashboard for monitoring")
  .option("--api-key <key>", "Link directly with an API key (skip browser flow)")
  .action(async (opts) => {
    const apiUrl = process.env.INDXEL_API_URL || "https://www.indxel.com";
    const cwd = process.cwd();

    console.log("");
    console.log(chalk.bold("  indxel link"));
    console.log("");

    // Check if already linked
    const existing = await loadProjectConfig(cwd);
    if (existing) {
      console.log(chalk.green("  ✓") + ` Already linked to ${chalk.bold(existing.projectName)}`);
      console.log(chalk.dim(`    Project ID: ${existing.projectId}`));
      console.log(chalk.dim(`    Linked at: ${existing.linkedAt}`));
      console.log("");
      console.log(chalk.dim("  To re-link, delete .indxel/config.json and run again."));
      console.log("");
      return;
    }

    // Option 1: Direct API key
    if (opts.apiKey) {
      const spinner = ora("Verifying API key...").start();

      try {
        const res = await fetch(`${apiUrl}/api/projects/by-key`, {
          headers: { Authorization: `Bearer ${opts.apiKey}` },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          spinner.fail("Invalid API key.");
          console.log(chalk.dim("  Check your key at https://indxel.com/dashboard/settings"));
          console.log("");
          process.exit(1);
        }

        const project = (await res.json()) as { id: string; name: string };
        spinner.succeed(`Linked to ${chalk.bold(project.name)}`);

        await saveProjectConfig(cwd, {
          apiKey: opts.apiKey,
          projectId: project.id,
          projectName: project.name,
          linkedAt: new Date().toISOString(),
        });

        // Sync IndexNow key if available
        await syncIndexNowKey(cwd, apiUrl, opts.apiKey, project.id);

        console.log("");
        console.log(chalk.dim("  Config saved to .indxel/config.json"));
        console.log(chalk.dim("  You can now use ") + chalk.bold("npx indxel crawl --push") + chalk.dim(" without --api-key."));
        console.log("");
        return;
      } catch (err) {
        spinner.fail(err instanceof Error ? err.message : "Connection failed");
        console.log("");
        process.exit(1);
      }
    }

    // Option 2: Device flow (browser-based)
    const initSpinner = ora("Starting device flow...").start();

    let deviceCode: string;
    let userCode: string;

    try {
      const res = await fetch(`${apiUrl}/api/cli/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        initSpinner.fail("Could not start device flow.");
        console.log(chalk.dim("  You can also link directly: ") + chalk.bold("npx indxel link --api-key <your-key>"));
        console.log("");
        process.exit(1);
      }

      const data = (await res.json()) as { deviceCode: string; userCode: string };
      deviceCode = data.deviceCode;
      userCode = data.userCode;
      initSpinner.stop();
    } catch (err) {
      initSpinner.fail(err instanceof Error ? err.message : "Connection failed");
      console.log(chalk.dim("  You can also link directly: ") + chalk.bold("npx indxel link --api-key <your-key>"));
      console.log("");
      process.exit(1);
      return; // unreachable, satisfies TS
    }

    const connectUrl = `${apiUrl}/cli/connect?code=${userCode}`;

    console.log(chalk.bold("  Open this URL in your browser:"));
    console.log("");
    console.log(`  ${chalk.underline(connectUrl)}`);
    console.log("");
    console.log(`  Your code: ${chalk.bold.cyan(userCode)}`);
    console.log("");

    // Try to open browser automatically
    try {
      await openBrowser(connectUrl);
      console.log(chalk.dim("  Browser opened automatically."));
    } catch {
      // Silently fail — user can open manually
    }

    // Poll for authorization
    const pollSpinner = ora("Waiting for authorization...").start();
    const maxWait = 5 * 60 * 1000; // 5 minutes
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await delay(pollInterval);

      try {
        const res = await fetch(`${apiUrl}/api/cli/auth?code=${deviceCode}`, {
          signal: AbortSignal.timeout(10000),
        });

        if (res.status === 202) {
          // Still pending
          continue;
        }

        if (res.ok) {
          const data = (await res.json()) as {
            apiKey: string;
            projectId: string;
            projectName: string;
          };

          pollSpinner.succeed(`Linked to ${chalk.bold(data.projectName)}`);

          await saveProjectConfig(cwd, {
            apiKey: data.apiKey,
            projectId: data.projectId,
            projectName: data.projectName,
            linkedAt: new Date().toISOString(),
          });

          // Sync IndexNow key if available
          await syncIndexNowKey(cwd, apiUrl, data.apiKey, data.projectId);

          console.log("");
          console.log(chalk.dim("  Config saved to .indxel/config.json"));
          console.log(chalk.dim("  You can now use ") + chalk.bold("npx indxel crawl --push") + chalk.dim(" without --api-key."));
          console.log("");
          return;
        }

        // Unexpected status
        pollSpinner.fail("Authorization failed.");
        console.log("");
        process.exit(1);
      } catch {
        // Network error — keep polling
      }
    }

    pollSpinner.fail("Timed out waiting for authorization (5 minutes).");
    console.log(chalk.dim("  Try again: ") + chalk.bold("npx indxel link"));
    console.log("");
    process.exit(1);
  });

/**
 * Sync the local IndexNow key to the linked project on the dashboard.
 * This avoids the "pending verification" state in the dashboard UI.
 */
async function syncIndexNowKey(
  cwd: string,
  apiUrl: string,
  apiKey: string,
  projectId: string,
): Promise<void> {
  const indexNowKey = await loadIndexNowKey(cwd);
  if (!indexNowKey) return;

  try {
    const res = await fetch(`${apiUrl}/api/projects/${projectId}/indexation/setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ action: "sync", key: indexNowKey }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      console.log(chalk.green("  ✓") + " IndexNow key synced to dashboard");
    }
  } catch {
    // Non-critical — skip silently
  }
}
