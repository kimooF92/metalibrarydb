import type { ExtractedProductData } from "@/types";
import { isCategoryUrl } from "@/lib/url-parser";
import { isSafePublicUrl } from "./ssrf-validator";
import { parseProductHtmlContent } from "./content-extractor";

// Re-export isSafePublicUrl for callers importing from html-fetcher
export { isSafePublicUrl } from "./ssrf-validator";

/**
 * Direct fallback product extraction from landing page HTML.
 * Parses JSON-LD, OpenGraph, Twitter Cards, and common e-commerce HTML DOM structures.
 * Hardened with SSRF protection (BUG-08), manual redirect validation, byte-capping (512 KB), and active monotonic deadlines.
 */
export async function scrapeProductDirectHtml(
  url: string,
  timeoutMs = 10000,
  maxRedirects = 2,
  options?: { defaultCurrency?: string; defaultCurrencySymbol?: string },
  deadlineMs?: number
): Promise<{
  success: boolean;
  data?: ExtractedProductData;
  error?: string;
  rawHtml?: string;
  finalUrl?: string;
}> {
  const currentDeadline = deadlineMs || Date.now() + timeoutMs;
  const remainingMs = currentDeadline - Date.now();

  if (remainingMs <= 0) {
    return {
      success: false,
      error: "Scrape deadline exceeded before fetch completed",
    };
  }

  if (isCategoryUrl(url)) {
    return {
      success: false,
      error: `[Ignored] Category URL detected: ${url}. Category listing pages are excluded from product scraping.`,
    };
  }

  if (!isSafePublicUrl(url)) {
    return {
      success: false,
      error: `[Security] Blocked unsafe target: ${url}`,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), remainingMs);

  try {
    let currentUrl = url;
    let res: Response | null = null;
    let redirectHops = 0;
    const maxHttpRedirects = Math.max(1, maxRedirects || 2);

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7,ar;q=0.6",
      "Cache-Control": "no-cache",
    };

    while (true) {
      if (!isSafePublicUrl(currentUrl)) {
        return {
          success: false,
          error: `[Security] Blocked unsafe target: ${currentUrl}`,
        };
      }

      res = await fetch(currentUrl, {
        headers,
        signal: controller.signal,
        redirect: "manual",
      });

      const isRedirect = res.status >= 300 && res.status < 400;
      if (isRedirect) {
        redirectHops++;
        if (redirectHops > maxHttpRedirects) {
          return {
            success: false,
            error: `Too many redirects (exceeded limit of ${maxHttpRedirects})`,
          };
        }

        const locationHeader = res.headers.get("location");
        if (!locationHeader) {
          return {
            success: false,
            error: `Redirect status HTTP ${res.status} returned without Location header`,
          };
        }

        let nextUrl: string;
        try {
          nextUrl = new URL(locationHeader, currentUrl).toString();
        } catch {
          return {
            success: false,
            error: `Invalid redirect Location header: ${locationHeader}`,
          };
        }

        if (!isSafePublicUrl(nextUrl)) {
          return {
            success: false,
            error: `[Security] Blocked redirect to unsafe URL: ${nextUrl}`,
          };
        }

        currentUrl = nextUrl;
        continue;
      }

      break;
    }

    if (!res || !res.ok) {
      const status = res?.status || 500;
      const statusText = res?.statusText || "Internal Server Error";
      const isDead = status === 404 || status === 410;
      return {
        success: false,
        error: isDead
          ? `[Dead link] HTTP ${status}: ${statusText}`
          : `Landing page returned HTTP ${status}: ${statusText}`,
      };
    }

    // Verify content-length header if provided
    const contentLength = Number(res.headers.get("content-length"));
    if (contentLength && contentLength > 3 * 1024 * 1024) {
      return {
        success: false,
        error: `Response size exceeds limit (${contentLength} bytes)`,
      };
    }

    // Stream up to 512 KB to prevent memory exhaustion
    // The timeout remains active throughout the streaming process
    let html = "";
    if (res.body) {
      const maxBytes = 512 * 1024;
      const reader = res.body.getReader();
      let receivedBytes = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          if (receivedBytes >= maxBytes) {
            reader.cancel();
            break;
          }
        }
      }

      const totalBuffer = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const c of chunks) {
        totalBuffer.set(c.slice(0, Math.min(c.length, receivedBytes - offset)), offset);
        offset += c.length;
        if (offset >= receivedBytes) break;
      }
      html = new TextDecoder("utf-8").decode(totalBuffer);
    } else {
      html = await res.text();
    }

    const cleanUrl = currentUrl;
    const baseOrigin = new URL(cleanUrl).origin;

    // Check for deleted / expired short URLs (e.g. shorturl.at, bit.ly 404s)
    if (
      html.includes("This link does not exist") ||
      (html.includes("404 Not Found") &&
        (cleanUrl.includes("shorturl.at") || cleanUrl.includes("bit.ly") || cleanUrl.includes("tinyurl.com")))
    ) {
      return {
        success: false,
        error: "[Dead link] Short link expired or deleted by creator (404).",
        rawHtml: html,
      };
    }

    // Follow HTML Meta-Refresh redirects (e.g. <meta http-equiv="refresh" content="0; url=...">)
    if (maxRedirects > 0) {
      const metaRefreshMatch = /<meta\s+[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>\s]+)["']/i.exec(
        html
      );
      if (metaRefreshMatch && metaRefreshMatch[1]) {
        let nextUrl = metaRefreshMatch[1].trim();
        if (!nextUrl.startsWith("http")) {
          try {
            nextUrl = new URL(nextUrl, baseOrigin).toString();
          } catch {}
        }
        if (nextUrl.startsWith("http") && nextUrl !== url && nextUrl !== cleanUrl && isSafePublicUrl(nextUrl)) {
          return scrapeProductDirectHtml(nextUrl, timeoutMs, maxRedirects - 1, options, currentDeadline);
        }
      }

      // Follow JavaScript-based window.location redirects on redirect landing pages
      const jsRedirectMatch = /(?:window\.)?location(?:\.href|\.replace)?\s*=\s*["'](https?:\/\/[^"']+)["']/i.exec(
        html
      );
      if (jsRedirectMatch && jsRedirectMatch[1]) {
        const nextUrl = jsRedirectMatch[1].trim();
        if (
          nextUrl !== url &&
          nextUrl !== cleanUrl &&
          !html.includes("schema.org/Product") &&
          !html.includes("og:price") &&
          isSafePublicUrl(nextUrl)
        ) {
          return scrapeProductDirectHtml(nextUrl, timeoutMs, maxRedirects - 1, options, currentDeadline);
        }
      }
    }

    const parsed = parseProductHtmlContent(html, cleanUrl, undefined, options);
    return {
      ...parsed,
      finalUrl: cleanUrl,
      rawHtml: html,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return {
        success: false,
        error: "Scrape request timed out (deadline exceeded)",
      };
    }
    const isDead =
      err.code === "ENOTFOUND" ||
      err.message?.includes("ENOTFOUND") ||
      err.message?.includes("ECONNREFUSED") ||
      err.message?.includes("ERR_NAME_NOT_RESOLVED");
    return {
      success: false,
      error: isDead
        ? `[Dead link] Domain unreachable (${err.message})`
        : err.message || "Failed to fetch and scrape landing page HTML.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

