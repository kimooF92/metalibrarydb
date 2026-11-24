import type { Page, Route } from "playwright";

export const ABORTED_RESOURCE_TYPES = new Set(["image", "media", "font", "imageset"]);

/**
 * Attaches a non-fatal Playwright route interceptor that aborts heavy binary
 * media payloads (images, videos/audio, fonts, imagesets) while allowing API
 * and document traffic (`document`, `script`, `xhr`, `fetch`, `stylesheet`) through.
 *
 * Returns an idempotent `detach()` cleanup helper that safely skips `unroute`
 * if already detached, registration failed, or the page is already closed.
 */
export async function attachMediaAbortRoute(page: Page): Promise<() => Promise<void>> {
  const handler = (route: Route) => {
    if (ABORTED_RESOURCE_TYPES.has(route.request().resourceType())) {
      return Promise.resolve(route.abort()).catch(() => {});
    }
    return Promise.resolve(route.continue()).catch(() => {});
  };

  let attached = false;
  let detached = false;

  try {
    await page.route("**/*", handler);
    attached = true;
  } catch {
    // Non-fatal if page route registration fails (e.g. closed or crashed page)
  }

  return async () => {
    if (detached || !attached) return;
    detached = true;
    if (!page.isClosed()) {
      await page.unroute("**/*", handler).catch(() => {});
    }
  };
}
