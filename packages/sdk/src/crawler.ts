import type { ResolvedMetadata, ValidationResult } from "./types.js";
import { extractMetadataFromHtml, extractInternalLinks, extractExternalLinks, extractH1s, extractWordCount, extractStructuredDataTypes } from "./html-parser.js";
import { validateMetadata } from "./validate.js";
import { safeFetch, validatePublicUrl } from "./safe-fetch.js";
import { fetchSitemap } from "./sitemap.js";

// -- Types --

export interface CrawlOptions {
  /** Maximum number of pages to crawl (default: 50) */
  maxPages?: number;
  /** Maximum depth from start URL (default: 5) */
  maxDepth?: number;
  /** Delay between requests in ms (default: 500) */
  delay?: number;
  /** Number of pages to crawl in parallel (default: 1) */
  concurrency?: number;
  /** Max retries on 503/429 errors (default: 2) */
  retries?: number;
  /** Request timeout in ms (default: 15000) */
  timeout?: number;
  /** User-Agent string */
  userAgent?: string;
  /** Treat warnings as errors in validation */
  strict?: boolean;
  /** Glob patterns to ignore from analysis (e.g. ["/app/*", "/admin/*"]) */
  ignorePatterns?: string[];
  /** Callback for progress updates */
  onPageCrawled?: (result: CrawledPage) => void;
}

export interface CrawledPage {
  url: string;
  status: number;
  metadata: ResolvedMetadata;
  validation: ValidationResult;
  internalLinks: string[];
  /** External links found on this page */
  externalLinks: string[];
  depth: number;
  error?: string;
  /** H1 headings found on the page */
  h1s: string[];
  /** Approximate word count of visible text */
  wordCount: number;
  /** Response time in ms */
  responseTimeMs: number;
  /** Redirect chain if any (e.g. [301, 301, 200]) */
  redirectChain: string[];
  /** JSON-LD @type values found */
  structuredDataTypes: string[];
  /** Whether the page is detected as an app/wizard page (client-side rendered) */
  isAppPage: boolean;
  /** Total number of images on the page */
  imagesTotal: number;
  /** Number of images missing alt text */
  imagesMissingAlt: number;
}

export interface CrawlResult {
  startUrl: string;
  domain: string;
  pages: CrawledPage[];
  totalPages: number;
  averageScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  totalErrors: number;
  totalWarnings: number;
  /** Pages found in links but not crawled (over limit or external) */
  skippedUrls: string[];
  durationMs: number;
  /** Cross-page analysis computed after crawl */
  analysis: CrawlAnalysis;
}

export interface CrawlAnalysis {
  /** Pages sharing the same title */
  duplicateTitles: Array<{ title: string; urls: string[] }>;
  /** Pages sharing the same description */
  duplicateDescriptions: Array<{ description: string; urls: string[] }>;
  /** Pages with H1 issues */
  h1Issues: Array<{ url: string; issue: "missing" | "multiple"; count: number }>;
  /** Internal links that returned errors */
  brokenInternalLinks: Array<{ from: string; to: string; status: number | string }>;
  /** External links that returned errors */
  brokenExternalLinks: Array<{ from: string; to: string; status: number | string }>;
  /** Pages with redirect chains */
  redirects: Array<{ url: string; chain: string[] }>;
  /** Pages with thin content */
  thinContentPages: Array<{ url: string; wordCount: number; isAppPage: boolean }>;
  /** Internal link graph: inlink counts per URL */
  internalLinkGraph: Array<{ url: string; inlinks: number }>;
  /** Orphan pages: crawled but receive 0 inlinks */
  orphanPages: string[];
  /** Pages sorted by slowest response */
  slowestPages: Array<{ url: string; responseTimeMs: number }>;
  /** Structured data type distribution */
  structuredDataSummary: Array<{ type: string; count: number }>;
  /** Pages with images missing alt text */
  imageAltIssues: Array<{ url: string; total: number; missingAlt: number }>;
  /** Images that return errors (404, timeout, etc.) */
  brokenImages: Array<{ src: string; pages: string[]; status: number | string }>;
  /** Number of external links that returned 403 (likely bot-blocked, excluded from brokenExternalLinks) */
  externalLinksBlocked403: number;
  /** Internal non-HTML resources (e.g. .txt, .xml) that were excluded from broken link check */
  nonHtmlInternalResources: string[];
}

const BROWSER_UA = "Mozilla/5.0 (compatible; Indxel/0.1; +https://indxel.com/bot)";

const DEFAULT_OPTIONS: Required<Omit<CrawlOptions, "onPageCrawled" | "strict">> = {
  maxPages: 500,
  maxDepth: 5,
  delay: 500,
  concurrency: 1,
  timeout: 15000,
  retries: 2,
  userAgent: BROWSER_UA,
  ignorePatterns: [],
};

/**
 * Crawl a site starting from a URL, following internal links.
 * Extracts metadata from each page and validates it.
 */
export async function crawlSite(
  startUrl: string,
  options?: CrawlOptions,
): Promise<CrawlResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const start = Date.now();
  const base = new URL(startUrl);
  const domain = base.hostname;

  // SSRF protection: validate start URL
  validatePublicUrl(startUrl);

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: normalizeUrl(startUrl), depth: 0 }];
  const pages: CrawledPage[] = [];
  const skippedUrls: string[] = [];

  // Seed queue with sitemap URLs to discover orphan pages
  try {
    const sitemap = await fetchSitemap(startUrl);
    if (sitemap.found && sitemap.urls.length > 0) {
      for (const entry of sitemap.urls) {
        if (!entry.loc) continue;
        // Normalize sitemap URL to match the crawl domain (www/non-www)
        const normalized = rewriteToSameDomain(entry.loc, domain, base.protocol);
        if (normalized && !isAssetUrl(normalized)) {
          queue.push({ url: normalizeUrl(normalized), depth: 1 });
        }
      }
    }
  } catch {
    // Sitemap fetch failed — continue with link-following only
  }

  // Concurrent worker pool — N workers pull from the shared queue
  const workerCount = Math.max(1, opts.concurrency);
  let activeWorkers = 0;

  async function worker(workerId: number): Promise<void> {
    // Stagger start: spread workers across the delay window
    if (workerId > 0 && opts.delay > 0) {
      await sleep((opts.delay / workerCount) * workerId);
    }

    activeWorkers++;
    try {
      while (pages.length < opts.maxPages) {
        const item = queue.shift();
        if (!item) break;

        const { url, depth } = item;
        if (visited.has(url)) continue;
        if (depth > opts.maxDepth) {
          skippedUrls.push(url);
          continue;
        }

        // Skip non-page resources
        if (isAssetUrl(url)) {
          continue;
        }

        visited.add(url);

        let page = await crawlPage(url, depth, opts);

        // Retry on 503/429 with exponential backoff
        if (page.status && (page.status === 503 || page.status === 429)) {
          for (let attempt = 1; attempt <= opts.retries; attempt++) {
            const backoff = opts.delay * Math.pow(2, attempt);
            await sleep(backoff);
            page = await crawlPage(url, depth, opts);
            if (!page.status || (page.status !== 503 && page.status !== 429)) break;
          }
        }

        pages.push(page);

        if (opts.onPageCrawled) {
          opts.onPageCrawled(page);
        }

        // Queue internal links
        if (!page.error) {
          for (const link of page.internalLinks) {
            const normalized = normalizeUrl(link);
            if (!visited.has(normalized) && !isAssetUrl(normalized)) {
              queue.push({ url: normalized, depth: depth + 1 });
            }
          }
        }

        // Polite delay with jitter to avoid rate-limit patterns
        if (opts.delay > 0) {
          const jitter = Math.floor(Math.random() * opts.delay * 0.5);
          await sleep(opts.delay + jitter);
        }
      }
    } finally {
      activeWorkers--;
    }
  }

  // Launch all workers concurrently
  await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i)));

  // Trim excess pages if concurrency caused overshoot
  if (pages.length > opts.maxPages) {
    pages.splice(opts.maxPages);
  }

  // Collect remaining queued URLs as skipped
  for (const item of queue) {
    if (!visited.has(item.url)) {
      skippedUrls.push(item.url);
    }
  }

  const analysis = await analyzeCrawl(pages, opts.ignorePatterns);

  // Apply cross-page penalties (duplicate titles/descriptions) to individual page scores
  applyCrossPagePenalties(pages, analysis);

  // Compute summary after penalties
  const validPages = pages.filter((p) => !p.error);
  const averageScore =
    validPages.length > 0
      ? Math.round(validPages.reduce((sum, p) => sum + p.validation.score, 0) / validPages.length)
      : 0;
  const totalErrors = validPages.reduce((sum, p) => sum + p.validation.errors.length, 0);
  const totalWarnings = validPages.reduce((sum, p) => sum + p.validation.warnings.length, 0);

  return {
    startUrl,
    domain,
    pages,
    totalPages: pages.length,
    averageScore,
    grade: scoreToGrade(averageScore),
    totalErrors,
    totalWarnings,
    skippedUrls: [...new Set(skippedUrls)],
    durationMs: Date.now() - start,
    analysis,
  };
}

/**
 * Cross-page analysis: duplicates, broken links, link graph, etc.
 */
async function analyzeCrawl(pages: CrawledPage[], ignorePatterns: string[] = []): Promise<CrawlAnalysis> {
  const isIgnored = (url: string) => {
    if (ignorePatterns.length === 0) return false;
    try {
      const path = new URL(url).pathname;
      return ignorePatterns.some((pattern) => pathMatchesGlob(path, pattern));
    } catch { return false; }
  };

  const valid = pages.filter((p) => !p.error && !isIgnored(p.url));

  // 1. Duplicate titles
  const titleMap = new Map<string, string[]>();
  for (const p of valid) {
    const t = p.metadata.title?.trim();
    if (!t) continue;
    if (!titleMap.has(t)) titleMap.set(t, []);
    titleMap.get(t)!.push(p.url);
  }
  const duplicateTitles = [...titleMap.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([title, urls]) => ({ title, urls }));

  // 2. Duplicate descriptions
  const descMap = new Map<string, string[]>();
  for (const p of valid) {
    const d = p.metadata.description?.trim();
    if (!d) continue;
    if (!descMap.has(d)) descMap.set(d, []);
    descMap.get(d)!.push(p.url);
  }
  const duplicateDescriptions = [...descMap.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([description, urls]) => ({ description, urls }));

  // 3. H1 issues
  const h1Issues: CrawlAnalysis["h1Issues"] = [];
  for (const p of valid) {
    if (p.h1s.length === 0) h1Issues.push({ url: p.url, issue: "missing", count: 0 });
    else if (p.h1s.length > 1) h1Issues.push({ url: p.url, issue: "multiple", count: p.h1s.length });
  }

  // 4. Broken internal links (skip non-HTML 200 responses — .txt, .xml, etc. are valid)
  const brokenInternalLinks: CrawlAnalysis["brokenInternalLinks"] = [];
  const nonHtmlSet = new Set<string>();
  for (const p of valid) {
    for (const link of p.internalLinks) {
      const normalized = normalizeUrl(link);
      const linkedPage = pages.find((pg) => pg.url === normalized && pg.error);
      if (!linkedPage) continue;
      if (linkedPage.error!.startsWith("Not HTML")) {
        nonHtmlSet.add(normalized);
      } else {
        brokenInternalLinks.push({ from: p.url, to: normalized, status: linkedPage.status || linkedPage.error! });
      }
    }
  }
  const nonHtmlInternalResources = [...nonHtmlSet];

  // 5. Redirects
  const redirects = pages
    .filter((p) => p.redirectChain.length > 0)
    .map((p) => ({ url: p.url, chain: p.redirectChain }));

  // 6. Thin content (< 200 words), tag app pages
  const thinContentPages = valid
    .filter((p) => p.wordCount < 200)
    .map((p) => ({ url: p.url, wordCount: p.wordCount, isAppPage: p.isAppPage }))
    .sort((a, b) => a.wordCount - b.wordCount);

  // 7. Internal link graph
  const inlinkCount = new Map<string, number>();
  for (const p of valid) {
    for (const link of p.internalLinks) {
      const normalized = normalizeUrl(link);
      inlinkCount.set(normalized, (inlinkCount.get(normalized) ?? 0) + 1);
    }
  }
  const internalLinkGraph = [...inlinkCount.entries()]
    .map(([url, inlinks]) => ({ url, inlinks }))
    .sort((a, b) => b.inlinks - a.inlinks);

  // 8. Orphan pages (crawled, 0 inlinks, not start page)
  const orphanPages = valid
    .filter((p) => p.depth > 0 && !inlinkCount.has(p.url))
    .map((p) => p.url);

  // 9. Slowest pages
  const slowestPages = valid
    .map((p) => ({ url: p.url, responseTimeMs: p.responseTimeMs }))
    .sort((a, b) => b.responseTimeMs - a.responseTimeMs)
    .slice(0, 10);

  // 10. Structured data summary
  const sdTypeCount = new Map<string, number>();
  for (const p of valid) {
    for (const t of p.structuredDataTypes) {
      sdTypeCount.set(t, (sdTypeCount.get(t) ?? 0) + 1);
    }
  }
  const structuredDataSummary = [...sdTypeCount.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // 11. Broken external links (batch HEAD requests, GET fallback for 403/405)
  const allExternalLinks = new Map<string, string[]>(); // url -> pages linking to it
  for (const p of valid) {
    for (const link of p.externalLinks) {
      if (!allExternalLinks.has(link)) allExternalLinks.set(link, []);
      allExternalLinks.get(link)!.push(p.url);
    }
  }
  const brokenExternalLinks: CrawlAnalysis["brokenExternalLinks"] = [];
  let externalLinksBlocked403 = 0;
  const externalEntries = [...allExternalLinks.entries()];
  const batchSize = 10;
  for (let i = 0; i < externalEntries.length; i += batchSize) {
    const batch = externalEntries.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async ([url, fromPages]): Promise<{ broken: CrawlAnalysis["brokenExternalLinks"]; blocked: number }> => {
        try {
          validatePublicUrl(url);
          const res = await safeFetch(url, {
            method: "HEAD",
            headers: { "User-Agent": BROWSER_UA },
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) return { broken: [], blocked: 0 };

          // HEAD returned 403/405 — retry with GET (many servers block HEAD or bot UAs)
          if (res.status === 403 || res.status === 405) {
            try {
              const getRes = await safeFetch(url, {
                method: "GET",
                headers: {
                  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  "Accept": "text/html,application/xhtml+xml,*/*",
                },
                signal: AbortSignal.timeout(10000),
              });
              // Consume body to avoid memory leaks
              await getRes.text().catch(() => {});
              if (getRes.ok) return { broken: [], blocked: 0 }; // Link works with browser-like UA — not broken
            } catch {
              // GET also failed — fall through
            }
          }

          // 403 after GET fallback — likely bot-blocking, not a real broken link
          if (res.status === 403) return { broken: [], blocked: 1 };

          return { broken: fromPages.map((from) => ({ from, to: url, status: res.status as number | string })), blocked: 0 };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          return { broken: fromPages.map((from) => ({ from, to: url, status: errMsg as number | string })), blocked: 0 };
        }
      }),
    );
    for (const r of results) {
      brokenExternalLinks.push(...r.broken);
      externalLinksBlocked403 += r.blocked;
    }
  }

  // 12. Image alt text issues
  const imageAltIssues: CrawlAnalysis["imageAltIssues"] = [];
  for (const p of valid) {
    if (p.imagesTotal > 0 && p.imagesMissingAlt > 0) {
      imageAltIssues.push({ url: p.url, total: p.imagesTotal, missingAlt: p.imagesMissingAlt });
    }
  }

  // 13. Broken images (img src returning errors)
  const allImageSrcs = new Map<string, string[]>(); // resolved src -> pages
  for (const p of valid) {
    if (!p.metadata.images) continue;
    for (const img of p.metadata.images) {
      // Skip data: URIs (lazy-load placeholders, inline SVGs, etc.)
      if (img.src.startsWith("data:")) continue;
      try {
        const resolved = new URL(img.src, p.url).href;
        if (!allImageSrcs.has(resolved)) allImageSrcs.set(resolved, []);
        allImageSrcs.get(resolved)!.push(p.url);
      } catch {
        // Skip invalid URLs
      }
    }
  }
  const brokenImages: CrawlAnalysis["brokenImages"] = [];
  const imageEntries = [...allImageSrcs.entries()];
  for (let i = 0; i < imageEntries.length; i += batchSize) {
    const batch = imageEntries.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async ([src, pageUrls]) => {
        try {
          validatePublicUrl(src);
          const res = await safeFetch(src, {
            method: "HEAD",
            headers: { "User-Agent": BROWSER_UA },
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) {
            return { src, pages: pageUrls, status: res.status as number | string };
          }
          return null;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          return { src, pages: pageUrls, status: errMsg as number | string };
        }
      }),
    );
    for (const r of results) {
      if (r) brokenImages.push(r);
    }
  }

  return {
    duplicateTitles, duplicateDescriptions, h1Issues,
    brokenInternalLinks, brokenExternalLinks, redirects, thinContentPages,
    internalLinkGraph, orphanPages, slowestPages, structuredDataSummary, imageAltIssues,
    brokenImages, externalLinksBlocked403, nonHtmlInternalResources,
  };
}

async function crawlPage(
  url: string,
  depth: number,
  opts: Required<Omit<CrawlOptions, "onPageCrawled" | "strict">> & { strict?: boolean },
): Promise<CrawledPage> {
  const emptyPage = (error: string, status = 0): CrawledPage => ({
    url, status, metadata: emptyMetadata(), validation: emptyValidation(),
    internalLinks: [], externalLinks: [], depth, error, h1s: [], wordCount: 0,
    responseTimeMs: 0, redirectChain: [], structuredDataTypes: [], isAppPage: false,
    imagesTotal: 0, imagesMissingAlt: 0,
  });

  try {
    validatePublicUrl(url);
    const startTime = Date.now();

    // Use manual redirect to track chain
    const redirectChain: string[] = [];
    let currentUrl = url;
    let response: Response;

    // Follow redirects manually to track the chain
    const maxRedirects = 10;
    let redirectCount = 0;
    while (true) {
      response = await safeFetch(currentUrl, {
        headers: {
          "User-Agent": opts.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(opts.timeout),
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400 && redirectCount < maxRedirects) {
        const location = response.headers.get("location");
        if (!location) break;
        const resolved = new URL(location, currentUrl).href;
        redirectChain.push(`${response.status} → ${resolved}`);
        currentUrl = resolved;
        redirectCount++;
      } else {
        break;
      }
    }

    const responseTimeMs = Date.now() - startTime;

    if (!response!.ok) {
      return { ...emptyPage(`HTTP ${response!.status} ${response!.statusText}`, response!.status), responseTimeMs, redirectChain };
    }

    const contentType = response!.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return { ...emptyPage(`Not HTML (${contentType})`, response!.status), responseTimeMs, redirectChain };
    }

    const html = await response!.text();
    const metadata = extractMetadataFromHtml(html);
    const h1s = extractH1s(html);
    const wordCount = extractWordCount(html);

    // Inject content signals into metadata so content rules can score them
    metadata.h1s = h1s;
    metadata.wordCount = wordCount;

    const validation = validateMetadata(metadata, { strict: opts.strict });
    const internalLinks = extractInternalLinks(html, currentUrl);
    const externalLinks = extractExternalLinks(html, currentUrl);
    const structuredDataTypes = extractStructuredDataTypes(metadata.structuredData ?? null);

    const isAppPage = detectAppPage(currentUrl, html, wordCount);

    const imagesTotal = metadata.images?.length ?? 0;
    const imagesMissingAlt = metadata.images?.filter((img) => img.alt === null || img.alt.trim() === "").length ?? 0;

    return {
      url, status: response!.status, metadata, validation, internalLinks, externalLinks,
      depth, h1s, wordCount, responseTimeMs, redirectChain, structuredDataTypes, isAppPage,
      imagesTotal, imagesMissingAlt,
    };
  } catch (err) {
    return emptyPage(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Apply cross-page penalties to individual page scores.
 * Pages with duplicate titles or descriptions get score deductions.
 */
export function applyCrossPagePenalties(pages: CrawledPage[], analysis: CrawlAnalysis): void {
  const DUPLICATE_TITLE_PENALTY = 5;
  const DUPLICATE_DESC_PENALTY = 3;

  // Build sets of URLs that have duplicates
  const dupTitleUrls = new Set<string>();
  for (const dup of analysis.duplicateTitles) {
    for (const url of dup.urls) dupTitleUrls.add(url);
  }

  const dupDescUrls = new Set<string>();
  for (const dup of analysis.duplicateDescriptions) {
    for (const url of dup.urls) dupDescUrls.add(url);
  }

  for (const page of pages) {
    if (page.error) continue;

    if (dupTitleUrls.has(page.url)) {
      page.validation.score = Math.max(0, page.validation.score - DUPLICATE_TITLE_PENALTY);
      page.validation.errors.push({
        id: "unique-title",
        name: "Unique Title",
        description: "Each page should have a unique title",
        weight: 0,
        severity: "critical",
        status: "error",
        message: "Duplicate title found on multiple pages",
        value: page.metadata.title ?? undefined,
      });
    }

    if (dupDescUrls.has(page.url)) {
      page.validation.score = Math.max(0, page.validation.score - DUPLICATE_DESC_PENALTY);
      page.validation.warnings.push({
        id: "unique-description",
        name: "Unique Description",
        description: "Each page should have a unique meta description",
        weight: 0,
        severity: "optional",
        status: "warn",
        message: "Duplicate description found on multiple pages",
        value: page.metadata.description ?? undefined,
      });
    }

    // Recalculate grade after penalties
    page.validation.grade = scoreToGrade(page.validation.score);
  }
}

// -- Helpers --

function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  // Strip trailing slash except root
  if (u.pathname !== "/" && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.href;
}

function isAssetUrl(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase();
  const exts = [
    ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
    ".css", ".js", ".mjs", ".woff", ".woff2", ".ttf", ".eot",
    ".pdf", ".zip", ".mp4", ".webm", ".mp3", ".xml", ".json",
  ];
  return exts.some((ext) => path.endsWith(ext));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function emptyMetadata(): ResolvedMetadata {
  return {
    title: null, description: null, canonical: null,
    ogTitle: null, ogDescription: null, ogImage: null, ogType: null,
    twitterCard: null, twitterTitle: null, twitterDescription: null,
    robots: null, alternates: null, structuredData: null,
    viewport: null, favicon: null,
  };
}

function emptyValidation(): ValidationResult {
  return { score: 0, grade: "F", passed: [], warnings: [], errors: [] };
}

/**
 * Detect if a page is likely an app/wizard page (client-side rendered).
 * These pages have thin server-rendered HTML but rich client-side content.
 */
function detectAppPage(url: string, html: string, wordCount: number): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();

    // Path-based detection
    if (path.startsWith("/app/") || path.startsWith("/app?")) return true;
    if (path.includes("/nouveau") || path.includes("/new") || path.includes("/create")) return true;
    if (path.includes("/wizard") || path.includes("/onboarding") || path.includes("/setup")) return true;

    // Query param detection (wizards often use ?type= or ?step=)
    if (u.searchParams.has("type") || u.searchParams.has("step")) return true;

    // Content heuristic: very few words but lots of script tags
    if (wordCount < 100) {
      const scriptCount = (html.match(/<script/gi) || []).length;
      if (scriptCount > 5) return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Simple glob matching for path patterns.
 */
function pathMatchesGlob(path: string, pattern: string): boolean {
  // Convert glob to regex: * matches anything except /, ** matches everything
  const regexStr = pattern
    .replace(/\*\*/g, "§DOUBLESTAR§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DOUBLESTAR§/g, ".*");
  try {
    return new RegExp(`^${regexStr}$`).test(path);
  } catch {
    return false;
  }
}

/**
 * Rewrite a URL's hostname to match the crawl domain.
 * Handles www/non-www mismatch (e.g. sitemap has lecapybara.fr
 * but we crawl www.lecapybara.fr).
 * Returns null if the URL is for a completely different domain.
 */
function rewriteToSameDomain(
  url: string,
  targetDomain: string,
  targetProtocol: string,
): string | null {
  try {
    const u = new URL(url);
    const srcDomain = u.hostname;

    // Already matches
    if (srcDomain === targetDomain) return url;

    // Check www/non-www equivalence
    const srcBase = srcDomain.replace(/^www\./, "");
    const tgtBase = targetDomain.replace(/^www\./, "");
    if (srcBase !== tgtBase) return null; // Different site entirely

    // Rewrite to target domain + protocol
    u.hostname = targetDomain;
    u.protocol = targetProtocol;
    return u.href;
  } catch {
    return null;
  }
}
