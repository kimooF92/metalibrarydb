import { parseProductHtmlContent } from "./html-scraper";
import { ExtractedProductData } from "./firecrawl";

let localBrowserContext: any = null;

/**
 * High-speed local Playwright browser extractor designed to bypass Cloudflare WAF,
 * Turnstile challenges, and JavaScript-rendered SPA shells using the local residential IP.
 */
export async function scrapeUrlWithLocalPlaywright(
  url: string,
  timeoutMs = 25000
): Promise<{
  success: boolean;
  data?: ExtractedProductData;
  error?: string;
  rawHtml?: string;
  engine?: string;
}> {
  // If running in a serverless environment (e.g. Vercel), Playwright local binary is not available
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return {
      success: false,
      error: "Local browser scraping is only available on desktop / local worker environments.",
    };
  }

  let page: any = null;
  let browserToClose: any = null;

  try {
    const { chromium } = await import("playwright");

    // Launch Chromium with anti-detection flags
    const browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu-sandbox",
      ],
    });
    browserToClose = browser;

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 768 },
      locale: "fr-FR",
      extraHTTPHeaders: {
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7,ar;q=0.6",
      },
    });

    page = await context.newPage();

    console.log(`[Local Browser Fallback] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs }).catch((e: any) => {
      console.warn(`[Local Browser Fallback] Initial navigation notice: ${e.message}`);
    });

    // Check for Cloudflare Waiting Room / Challenge
    const initialContent = await page.content();
    if (
      initialContent.includes("cf-challenge") ||
      initialContent.includes("Checking your browser") ||
      initialContent.includes("Attention Required! | Cloudflare") ||
      initialContent.includes("Just a moment...")
    ) {
      console.log("[Local Browser Fallback] 🛡️ Cloudflare challenge detected! Waiting 5s for residential IP resolution...");
      await page.waitForTimeout(5000);
    } else {
      // Allow dynamic SPA / price hydration
      await page.waitForTimeout(1500);
    }

    const html = await page.content();
    const finalUrl = page.url();

    const parsed = parseProductHtmlContent(html, finalUrl);
    if (!parsed.success || !parsed.data || (!parsed.data.title && !parsed.data.current_price)) {
      return {
        success: false,
        error: parsed.error || "Could not parse product details from page DOM via local browser.",
        rawHtml: html,
        engine: "local_playwright_browser",
      };
    }

    return {
      success: true,
      data: parsed.data,
      rawHtml: html,
      engine: "local_playwright_browser",
    };
  } catch (err: any) {
    console.warn(`[Local Browser Fallback] Error for ${url}:`, err.message);
    return {
      success: false,
      error: `Local browser error: ${err.message}`,
    };
  } finally {
    if (page) {
      await page.close().catch(() => null);
    }
    if (browserToClose) {
      await browserToClose.close().catch(() => null);
    }
  }
}
