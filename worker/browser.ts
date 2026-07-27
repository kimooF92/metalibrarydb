import { chromium, BrowserContext, Page } from "playwright";
import path from "path";

let contextInstance: BrowserContext | null = null;
let singlePageInstance: Page | null = null;

export async function getBrowserSession(): Promise<{ context: BrowserContext; page: Page }> {
  if (contextInstance && singlePageInstance && !singlePageInstance.isClosed()) {
    return { context: contextInstance, page: singlePageInstance };
  }

  const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  const userDataDir = path.join(process.cwd(), ".playwright_profile");

  const options = {
    headless: isHeadless,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  };

  try {
    contextInstance = await chromium.launchPersistentContext(userDataDir, options);
  } catch (err: any) {
    if (err?.message?.includes("existing browser session")) {
      const fallbackDir = path.join(process.cwd(), ".playwright_profile_fallback");
      contextInstance = await chromium.launchPersistentContext(fallbackDir, options);
    } else {
      throw err;
    }
  }

  const pages = contextInstance.pages();
  singlePageInstance = pages.length > 0 ? pages[0] : await contextInstance.newPage();

  return { context: contextInstance, page: singlePageInstance };
}

export async function closeBrowserSession() {
  if (contextInstance) {
    try {
      await contextInstance.close();
    } catch {
      // Ignore cleanup errors
    } finally {
      contextInstance = null;
      singlePageInstance = null;
    }
  }
}
