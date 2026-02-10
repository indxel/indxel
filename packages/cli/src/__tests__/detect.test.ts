import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { detectProject } from "../detect.js";

const TMP = join(process.cwd(), ".test-detect-tmp");

function setup(files: Record<string, string> = {}) {
  mkdirSync(TMP, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(TMP, path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

describe("detectProject", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("detects a basic Next.js project", async () => {
    setup({
      "next.config.ts": "export default {}",
      "tsconfig.json": "{}",
      "package.json": JSON.stringify({ dependencies: { next: "^15.0.0" } }),
      "src/app/page.tsx": "export default function Home() {}",
    });

    const info = await detectProject(TMP);

    expect(info.isNextJs).toBe(true);
    expect(info.isTypeScript).toBe(true);
    expect(info.usesAppRouter).toBe(true);
    expect(info.appDir).toBe("src/app");
  });

  it("detects app directory without src prefix", async () => {
    setup({
      "next.config.js": "module.exports = {}",
      "package.json": JSON.stringify({ dependencies: { next: "^14.0.0" } }),
      "app/page.tsx": "export default function Home() {}",
    });

    const info = await detectProject(TMP);

    expect(info.isNextJs).toBe(true);
    expect(info.usesAppRouter).toBe(true);
    expect(info.appDir).toBe("app");
  });

  it("returns false for non-Next.js project", async () => {
    setup({
      "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    });

    const info = await detectProject(TMP);
    expect(info.isNextJs).toBe(false);
  });

  it("detects existing SEO files", async () => {
    setup({
      "next.config.ts": "export default {}",
      "package.json": JSON.stringify({ dependencies: { next: "^15.0.0" } }),
      "tsconfig.json": "{}",
      "seo.config.ts": "export default {}",
      "src/app/sitemap.ts": "export default function() {}",
      "src/app/robots.ts": "export default function() {}",
    });

    const info = await detectProject(TMP);

    expect(info.hasSeoConfig).toBe(true);
    expect(info.hasSitemap).toBe(true);
    expect(info.hasRobots).toBe(true);
  });

  it("detects missing SEO files", async () => {
    setup({
      "next.config.ts": "export default {}",
      "package.json": JSON.stringify({ dependencies: { next: "^15.0.0" } }),
      "tsconfig.json": "{}",
      "src/app/page.tsx": "",
    });

    const info = await detectProject(TMP);

    expect(info.hasSeoConfig).toBe(false);
    expect(info.hasSitemap).toBe(false);
    expect(info.hasRobots).toBe(false);
  });

  it("extracts Next.js version from package.json", async () => {
    setup({
      "package.json": JSON.stringify({ dependencies: { next: "^15.3.0" } }),
    });

    const info = await detectProject(TMP);
    expect(info.nextVersion).toBe("15.3.0");
  });
});
