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

    expect(info.framework).toBe("nextjs");
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

    expect(info.framework).toBe("nextjs");
    expect(info.isNextJs).toBe(true);
    expect(info.usesAppRouter).toBe(true);
    expect(info.appDir).toBe("app");
  });

  it("returns unknown for unrecognized project", async () => {
    setup({
      "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    });

    const info = await detectProject(TMP);
    expect(info.framework).toBe("unknown");
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
    expect(info.framework).toBe("nextjs");
    expect(info.nextVersion).toBe("15.3.0");
    expect(info.frameworkVersion).toBe("15.3.0");
  });

  // --- Nuxt ---

  it("detects a Nuxt 3 project via nuxt.config.ts", async () => {
    setup({
      "nuxt.config.ts": "export default defineNuxtConfig({})",
      "package.json": JSON.stringify({ dependencies: { nuxt: "^3.12.0" } }),
      "pages/index.vue": "<template><div>Home</div></template>",
    });

    const info = await detectProject(TMP);

    expect(info.framework).toBe("nuxt");
    expect(info.frameworkVersion).toBe("3.12.0");
    expect(info.usesAppRouter).toBe(true);
    expect(info.appDir).toBe("pages");
    expect(info.isNextJs).toBe(false);
  });

  it("detects a Nuxt project via package.json only", async () => {
    setup({
      "package.json": JSON.stringify({ dependencies: { nuxt: "^3.8.0" } }),
    });

    const info = await detectProject(TMP);
    expect(info.framework).toBe("nuxt");
  });

  // --- Remix ---

  it("detects a Remix project", async () => {
    setup({
      "package.json": JSON.stringify({
        dependencies: { "@remix-run/react": "^2.0.0", "@remix-run/node": "^2.0.0" },
      }),
      "app/routes/_index.tsx": "export default function Index() {}",
    });

    const info = await detectProject(TMP);

    expect(info.framework).toBe("remix");
    expect(info.frameworkVersion).toBe("2.0.0");
    expect(info.usesAppRouter).toBe(true);
    expect(info.appDir).toBe("app/routes");
  });

  it("detects Remix via remix.config.js", async () => {
    setup({
      "remix.config.js": "module.exports = {}",
      "package.json": JSON.stringify({ dependencies: { "@remix-run/react": "^2.5.0" } }),
      "app/root.tsx": "export default function App() {}",
    });

    const info = await detectProject(TMP);
    expect(info.framework).toBe("remix");
  });

  // --- Astro ---

  it("detects an Astro project", async () => {
    setup({
      "astro.config.mjs": "export default defineConfig({})",
      "package.json": JSON.stringify({ dependencies: { astro: "^4.0.0" } }),
      "src/pages/index.astro": "---\n---\n<html></html>",
    });

    const info = await detectProject(TMP);

    expect(info.framework).toBe("astro");
    expect(info.frameworkVersion).toBe("4.0.0");
    expect(info.usesAppRouter).toBe(true);
    expect(info.appDir).toBe("src/pages");
  });

  // --- SvelteKit ---

  it("detects a SvelteKit project", async () => {
    setup({
      "svelte.config.js": "export default {}",
      "package.json": JSON.stringify({ devDependencies: { "@sveltejs/kit": "^2.0.0" } }),
      "src/routes/+page.svelte": "<h1>Home</h1>",
    });

    const info = await detectProject(TMP);

    expect(info.framework).toBe("sveltekit");
    expect(info.frameworkVersion).toBe("2.0.0");
    expect(info.usesAppRouter).toBe(true);
    expect(info.appDir).toBe("src/routes");
  });

  // --- Priority ---

  it("prioritizes Next.js when both Next.js and Nuxt are present", async () => {
    setup({
      "next.config.ts": "export default {}",
      "nuxt.config.ts": "export default {}",
      "package.json": JSON.stringify({
        dependencies: { next: "^15.0.0", nuxt: "^3.0.0" },
      }),
      "src/app/page.tsx": "",
    });

    const info = await detectProject(TMP);
    expect(info.framework).toBe("nextjs");
  });

  // --- SEO files for non-Next.js ---

  it("detects sitemap.xml in public/ for Nuxt", async () => {
    setup({
      "nuxt.config.ts": "export default defineNuxtConfig({})",
      "package.json": JSON.stringify({ dependencies: { nuxt: "^3.12.0" } }),
      "pages/index.vue": "",
      "public/sitemap.xml": '<?xml version="1.0"?>',
      "public/robots.txt": "User-agent: *",
    });

    const info = await detectProject(TMP);
    expect(info.framework).toBe("nuxt");
    expect(info.hasSitemap).toBe(true);
    expect(info.hasRobots).toBe(true);
  });
});
