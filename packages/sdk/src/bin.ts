/**
 * Thin CLI wrapper — delegates to indxel-cli.
 * Allows `npx indxel check` to work even when only the SDK is installed.
 *
 * Resolution order:
 * 1. Local indxel-cli (if installed in project) — instant
 * 2. npx indxel-cli (downloads on first use) — slight delay
 */

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";

async function main(): Promise<void> {
  // 1. Try locally installed indxel-cli
  try {
    const require = createRequire(import.meta.url);
    const cliPkgPath = require.resolve("indxel-cli/package.json");
    const cliBin = pathToFileURL(
      join(dirname(cliPkgPath), "dist", "bin.js"),
    ).href;
    await import(cliBin);
    return;
  } catch {
    // Not installed locally — fall back to npx
  }

  // 2. Delegate to npx indxel-cli
  const args = process.argv.slice(2);
  const child = spawn("npx", ["-y", "indxel-cli@latest", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code) => process.exit(code ?? 1));
  child.on("error", () => {
    console.error(
      "\n  Could not run indxel CLI. Install it directly:\n" +
        "  npm install -D indxel-cli\n",
    );
    process.exit(1);
  });
}

main();
