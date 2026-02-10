import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { scanPages } from "../scanner.js";

const TMP = join(process.cwd(), ".test-scanner-tmp");

function setup(files: Record<string, string>) {
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

describe("scanPages", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("finds page files in the app directory", async () => {
    setup({
      "src/app/page.tsx": `export default function Home() { return <div>Home</div> }`,
      "src/app/blog/page.tsx": `export default function Blog() { return <div>Blog</div> }`,
      "src/app/about/page.tsx": `export default function About() { return <div>About</div> }`,
    });

    const pages = await scanPages(TMP, "src/app");

    expect(pages).toHaveLength(3);
    const routes = pages.map((p) => p.route);
    expect(routes).toContain("/");
    expect(routes).toContain("/blog");
    expect(routes).toContain("/about");
  });

  it("detects static metadata export", async () => {
    setup({
      "src/app/page.tsx": `
        export const metadata = {
          title: 'Home Page',
          description: 'Welcome to our site'
        }
        export default function Home() { return <div>Home</div> }
      `,
    });

    const pages = await scanPages(TMP, "src/app");

    expect(pages[0].hasMetadata).toBe(true);
    expect(pages[0].hasDynamicMetadata).toBe(false);
    expect(pages[0].extractedMetadata.title).toBe("Home Page");
    expect(pages[0].extractedMetadata.description).toBe("Welcome to our site");
  });

  it("detects dynamic generateMetadata export", async () => {
    setup({
      "src/app/blog/[slug]/page.tsx": `
        export async function generateMetadata({ params }) {
          return { title: 'Dynamic Title' }
        }
        export default function Post() { return <div>Post</div> }
      `,
    });

    const pages = await scanPages(TMP, "src/app");

    expect(pages[0].hasMetadata).toBe(true);
    expect(pages[0].hasDynamicMetadata).toBe(true);
  });

  it("skips static extraction for generateMetadata pages", async () => {
    setup({
      "src/app/blog/[slug]/page.tsx": `
        export async function generateMetadata({ params }) {
          const post = await getPost(params.slug);
          return { title: post.title, description: post.excerpt }
        }
        export default function Post() { return <div>Post</div> }
      `,
    });

    const pages = await scanPages(TMP, "src/app");

    expect(pages[0].hasDynamicMetadata).toBe(true);
    // Static extraction should NOT run — metadata stays empty
    expect(pages[0].extractedMetadata.title).toBeNull();
    expect(pages[0].extractedMetadata.description).toBeNull();
  });

  it("dynamic pages still inherit layout metadata", async () => {
    setup({
      "src/app/layout.tsx": `
        export const metadata = {
          description: 'Site-wide description',
        }
        export default function Layout({ children }) { return <html>{children}</html> }
      `,
      "src/app/blog/[slug]/page.tsx": `
        export async function generateMetadata({ params }) {
          return { title: params.slug }
        }
        export default function Post() { return <div>Post</div> }
      `,
    });

    const pages = await scanPages(TMP, "src/app");
    const blogPage = pages.find((p) => p.route === "/blog/[slug]");

    expect(blogPage!.hasDynamicMetadata).toBe(true);
    // Title stays null (dynamic, can't extract)
    expect(blogPage!.extractedMetadata.title).toBeNull();
    // Description inherited from layout
    expect(blogPage!.extractedMetadata.description).toBe("Site-wide description");
  });

  it("detects pages with no metadata", async () => {
    setup({
      "src/app/page.tsx": `export default function Home() { return <div>Home</div> }`,
    });

    const pages = await scanPages(TMP, "src/app");

    expect(pages[0].hasMetadata).toBe(false);
    expect(pages[0].extractedMetadata.title).toBeNull();
  });

  it("handles route groups by stripping (group) segments", async () => {
    setup({
      "src/app/(marketing)/page.tsx": `export default function Home() {}`,
      "src/app/(marketing)/pricing/page.tsx": `export default function Pricing() {}`,
    });

    const pages = await scanPages(TMP, "src/app");

    const routes = pages.map((p) => p.route);
    expect(routes).toContain("/");
    expect(routes).toContain("/pricing");
  });

  it("extracts OG and twitter metadata", async () => {
    setup({
      "src/app/page.tsx": `
        export const metadata = {
          title: 'Test',
          description: 'A page',
          openGraph: {
            title: 'OG Title',
            description: 'OG Description',
            images: [{ url: '/og.png' }]
          },
          twitter: {
            card: 'summary_large_image'
          }
        }
        export default function Page() {}
      `,
    });

    const pages = await scanPages(TMP, "src/app");

    expect(pages[0].extractedMetadata.ogTitle).toBe("OG Title");
    expect(pages[0].extractedMetadata.ogDescription).toBe("OG Description");
    expect(pages[0].extractedMetadata.ogImage).toBe("[detected]");
    expect(pages[0].extractedMetadata.twitterCard).toBe("summary_large_image");
  });

  it("enriches pages with layout metadata", async () => {
    setup({
      "src/app/layout.tsx": `
        export const metadata = {
          title: 'Layout Title',
          description: 'Site description from layout',
        }
        export default function Layout({ children }) { return <html>{children}</html> }
      `,
      "src/app/page.tsx": `
        export default function Home() { return <div>Home</div> }
      `,
    });

    const pages = await scanPages(TMP, "src/app");

    // Page should inherit layout metadata
    expect(pages[0].hasMetadata).toBe(true);
    expect(pages[0].extractedMetadata.title).toBe("Layout Title");
    expect(pages[0].extractedMetadata.description).toBe("Site description from layout");
  });

  it("page-level metadata takes precedence over layout", async () => {
    setup({
      "src/app/layout.tsx": `
        export const metadata = {
          title: 'Layout Title',
          description: 'Layout description',
        }
        export default function Layout({ children }) { return <html>{children}</html> }
      `,
      "src/app/page.tsx": `
        export const metadata = {
          title: 'Page Title',
        }
        export default function Home() { return <div>Home</div> }
      `,
    });

    const pages = await scanPages(TMP, "src/app");

    expect(pages[0].extractedMetadata.title).toBe("Page Title");
    // Description should come from layout since page doesn't set it
    expect(pages[0].extractedMetadata.description).toBe("Layout description");
  });

  it("sorts pages by route", async () => {
    setup({
      "src/app/z-page/page.tsx": `export default function Z() {}`,
      "src/app/a-page/page.tsx": `export default function A() {}`,
      "src/app/page.tsx": `export default function Home() {}`,
    });

    const pages = await scanPages(TMP, "src/app");
    const routes = pages.map((p) => p.route);

    expect(routes).toEqual(["/", "/a-page", "/z-page"]);
  });
});
