/**
 * SSRF-safe fetch — blocks requests to private/internal IP ranges.
 * Used by crawler, sitemap, robots, and asset checker.
 */

import { lookup } from "node:dns/promises";

const MAX_REDIRECTS = 10;

const PRIVATE_IP_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Private class A
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private class B
  /^192\.168\./, // Private class C
  /^169\.254\./, // Link-local (AWS metadata)
  /^0\./, // Current network
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // Shared address space
  /^198\.1[89]\./, // Benchmarking
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 unique local
  /^fe80:/, // IPv6 link-local
  /^fd/, // IPv6 private
  /^::ffff:127\./, // IPv4-mapped loopback
  /^::ffff:10\./, // IPv4-mapped private A
  /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./, // IPv4-mapped private B
  /^::ffff:192\.168\./, // IPv4-mapped private C
  /^::ffff:169\.254\./, // IPv4-mapped link-local
];

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "metadata",
  "kubernetes.default",
];

/**
 * Validate that a URL points to a public internet address.
 * Throws if the URL targets a private/internal address.
 */
export function validatePublicUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Block non-HTTP protocols
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked: non-HTTP protocol '${parsed.protocol}'`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known internal hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new Error(`Blocked: internal hostname '${hostname}'`);
  }

  // Block IPs in private ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Blocked: private IP address '${hostname}'`);
    }
  }

  // Block hosts that look like internal services
  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".corp") ||
    hostname.endsWith(".lan")
  ) {
    throw new Error(`Blocked: internal domain '${hostname}'`);
  }
}

/**
 * Resolve hostname to IP and validate it's not private (prevents DNS rebinding).
 */
async function validateResolvedIp(hostname: string): Promise<void> {
  // Skip if hostname is already an IP literal
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    return; // Already checked by validatePublicUrl
  }

  try {
    const { address } = await lookup(hostname);
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(address)) {
        throw new Error(
          `Blocked: '${hostname}' resolves to private IP '${address}'`,
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Blocked:")) {
      throw err;
    }
    // DNS resolution failed — let fetch handle the error
  }
}

/**
 * SSRF-safe fetch wrapper. Validates the URL and resolved IP before fetching.
 * Also validates redirect targets with a max redirect limit.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit,
  remainingRedirects = MAX_REDIRECTS,
): Promise<Response> {
  if (remainingRedirects <= 0) {
    throw new Error("Too many redirects");
  }

  validatePublicUrl(url);

  // Resolve DNS and check actual IP (prevents DNS rebinding)
  const parsed = new URL(url);
  await validateResolvedIp(parsed.hostname);

  // Fetch with redirect: manual to validate redirect targets
  const response = await fetch(url, {
    ...init,
    redirect: "manual",
  });

  // Handle redirects safely
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      const redirectUrl = new URL(location, url).href;
      validatePublicUrl(redirectUrl);
      return safeFetch(redirectUrl, init, remainingRedirects - 1);
    }
  }

  return response;
}
