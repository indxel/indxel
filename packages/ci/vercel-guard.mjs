#!/usr/bin/env node

/**
 * Indxel — Vercel Build Guard
 *
 * Add to your build pipeline to fail deploys on broken SEO.
 *
 * Usage in package.json:
 *   "scripts": {
 *     "build": "node node_modules/indxel-ci/vercel-guard.mjs && next build"
 *   }
 *
 * Or standalone:
 *   INDXEL_THRESHOLD=80 node vercel-guard.mjs
 */

import { execSync } from "node:child_process";

const threshold = parseInt(process.env.INDXEL_THRESHOLD || "80", 10);
const strict = process.env.INDXEL_STRICT === "true";

console.log(`\n[indxel] Running SEO check (threshold: ${threshold})...\n`);

try {
  const flags = ["--ci", "--json"];
  if (strict) flags.push("--strict");

  const output = execSync(`npx indxel check ${flags.join(" ")}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  let data;
  try {
    data = JSON.parse(output);
  } catch {
    // CLI may print non-JSON lines before the JSON — take the last valid JSON block
    const lines = output.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        data = JSON.parse(lines.slice(i).join("\n"));
        break;
      } catch {
        // keep looking
      }
    }
  }

  if (!data) {
    console.error("[indxel] Could not parse CLI output.");
    process.exit(1);
  }

  const { score, grade, totalPages, passedPages, criticalErrors } = data;

  console.log(`[indxel] Score: ${score}/100 (${grade})`);
  console.log(`[indxel] Pages: ${passedPages}/${totalPages} pass`);

  if (criticalErrors > 0) {
    console.log(`[indxel] Errors: ${criticalErrors} critical`);
  }

  if (score < threshold) {
    console.error(
      `\n[indxel] FAIL — Score ${score} is below threshold ${threshold}.\n`,
    );
    process.exit(1);
  }

  console.log(`\n[indxel] PASS — SEO looks good. Ship it.\n`);
} catch (err) {
  // execSync throws on non-zero exit code
  if (err.stdout) {
    console.error(err.stdout.toString());
  }
  if (err.stderr) {
    console.error(err.stderr.toString());
  }
  console.error("\n[indxel] SEO check failed.\n");
  process.exit(1);
}
