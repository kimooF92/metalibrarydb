import { task, logger } from "@trigger.dev/sdk";
import { chromium } from "playwright";
import { db } from "../../db";
import { trackedPages, queue } from "../../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { scanMetaAdPage } from "../../worker/scanner";
import { markJobCompleted } from "../../worker/db";

export interface ScanPageCountPayload {
  pageId: string;
  url?: string;
  priority?: "normal" | "high";
}

/**
 * Task: scanPageCountTask
 * On-demand scrape of a single Meta Ad Library URL for active ad counts.
 */
export const scanPageCountTask = task({
  id: "scan-page-count",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 3000,
  },
  queue: {
    concurrencyLimit: 2, // Protect against Meta rate limits
  },
  run: async (payload: ScanPageCountPayload) => {
    logger.info(`Starting ad count scan for pageId: ${payload.pageId}`);

    // 1. Fetch tracked page record
    const [pageRecord] = await db
      .select({
        id: trackedPages.id,
        url: trackedPages.url,
        displayName: trackedPages.displayName,
        currentResults: trackedPages.currentResults,
      })
      .from(trackedPages)
      .where(eq(trackedPages.id, payload.pageId))
      .limit(1);

    if (!pageRecord) {
      throw new Error(`Tracked page ${payload.pageId} not found in database.`);
    }

    const targetUrl = payload.url || pageRecord.url;
    logger.info(`Navigating to Meta Ad Library: ${targetUrl}`);

    // Update status to scanning
    await db
      .update(trackedPages)
      .set({ status: "scanning", updatedAt: new Date() })
      .where(eq(trackedPages.id, pageRecord.id));

    // 2. Launch headless browser
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== "false";
    const browser = await chromium.launch({
      headless: isHeadless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale: "en-US",
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        },
      });

      const page = await context.newPage();

      // 3. Perform the scrape using existing battle-tested scanner
      const outcome = await scanMetaAdPage(page, targetUrl);
      logger.info(`Scrape outcome for ${pageRecord.displayName || targetUrl}: ${JSON.stringify(outcome)}`);

      // 4. Save results to database using existing state machine
      if (outcome.status === "success" || outcome.status === "unclear") {
        await markJobCompleted(
          "trigger-dev-run",
          pageRecord.id,
          outcome.results,
          outcome.status,
          {
            failureReason: outcome.failureReason,
            page,
          }
        );
      } else {
        // Mark as failed in trackedPages and queue
        const now = new Date();
        await db
          .update(trackedPages)
          .set({
            status: "failed",
            lastChecked: now,
            updatedAt: now,
          })
          .where(eq(trackedPages.id, pageRecord.id));

        await db
          .update(queue)
          .set({
            status: "failed",
            finishedAt: now,
            failureReason: outcome.failureReason || "scrape_failed",
          })
          .where(and(eq(queue.trackedPageId, pageRecord.id), inArray(queue.status, ["pending", "running"])));
      }

      return {
        success: outcome.status === "success",
        pageId: pageRecord.id,
        count: outcome.results,
        status: outcome.status,
        failureReason: outcome.failureReason,
      };
    } finally {
      await browser.close();
    }
  },
});

/**
 * Task: retryFailedPagesTask
 * 1-Click recovery task that finds all failed pages and triggers them in batches.
 */
export const retryFailedPagesTask = task({
  id: "retry-failed-pages",
  run: async () => {
    logger.info("Scanning for failed pages to recheck...");

    const failedPages = await db
      .select({ id: trackedPages.id, url: trackedPages.url })
      .from(trackedPages)
      .where(eq(trackedPages.status, "failed"))
      .limit(50);

    if (failedPages.length === 0) {
      logger.info("No failed pages found.");
      return { retriedCount: 0 };
    }

    logger.info(`Dispatching retry batch for ${failedPages.length} failed pages...`);

    // Batch trigger scanPageCountTask for all failed pages
    const batch = await scanPageCountTask.batchTrigger(
      failedPages.map((p) => ({
        payload: { pageId: p.id, url: p.url },
      }))
    );

    return {
      retriedCount: failedPages.length,
      batchId: batch.batchId,
    };
  },
});

/**
 * Task: helloWorldTask
 * Lightweight smoke test task to instantly verify Trigger.dev dev environment connectivity.
 */
export const helloWorldTask = task({
  id: "hello-world",
  run: async (payload: { message?: string } = {}) => {
    const text = payload.message || "Trigger.dev is connected and operational!";
    logger.info(text);
    return {
      success: true,
      timestamp: new Date().toISOString(),
      receivedMessage: text,
    };
  },
});
