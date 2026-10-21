import { task, logger } from "@trigger.dev/sdk";
import { chromium } from "playwright";
import { db } from "../../db";
import { trackedPages, queue } from "../../db/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { scanMetaAdPage } from "../../worker/scanner";
import { markJobCompleted } from "../../worker/db";
import { acquireLock, releaseLock, deleteCached, deleteByPrefix } from "../../lib/cache-service";

export interface ScanPageCountPayload {
  pageId?: string;
  id?: string;
  trackedPageId?: string;
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
    // 0. Extract identifier flexibly
    const rawTarget =
      (typeof payload === "string" ? payload : null) ||
      (payload as any)?.pageId ||
      (payload as any)?.id ||
      (payload as any)?.trackedPageId ||
      (payload as any)?.payload?.pageId ||
      (payload as any)?.payload?.id;

    const inputUrl = (payload as any)?.url || (typeof rawTarget === "string" && rawTarget.startsWith("http") ? rawTarget : null);

    if ((!rawTarget || typeof rawTarget !== "string" || !rawTarget.trim()) && !inputUrl) {
      const errMsg = `[scan-page-count] Missing or empty pageId in payload. Received: ${JSON.stringify(payload)}. Example payload: { "pageId": "your-page-uuid" }`;
      logger.error(errMsg);
      throw new Error(errMsg);
    }

    const cleanTargetId = typeof rawTarget === "string" ? rawTarget.trim() : "";
    logger.info(`Starting ad count scan for target: "${cleanTargetId || inputUrl}"`);

    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    // 1. Fetch tracked page record safely by UUID, Facebook Page ID, or URL
    let pageRecord: {
      id: string;
      url: string;
      displayName: string | null;
      currentResults: number | null;
      workspaceId: string | null;
    } | undefined;

    if (cleanTargetId && isUuid(cleanTargetId)) {
      const [found] = await db
        .select({
          id: trackedPages.id,
          url: trackedPages.url,
          displayName: trackedPages.displayName,
          currentResults: trackedPages.currentResults,
          workspaceId: trackedPages.workspaceId,
        })
        .from(trackedPages)
        .where(eq(trackedPages.id, cleanTargetId))
        .limit(1);
      pageRecord = found;
    }

    if (!pageRecord && cleanTargetId) {
      const [found] = await db
        .select({
          id: trackedPages.id,
          url: trackedPages.url,
          displayName: trackedPages.displayName,
          currentResults: trackedPages.currentResults,
          workspaceId: trackedPages.workspaceId,
        })
        .from(trackedPages)
        .where(or(eq(trackedPages.pageId, cleanTargetId), eq(trackedPages.url, cleanTargetId)))
        .limit(1);
      pageRecord = found;
    }

    if (!pageRecord && inputUrl) {
      const [found] = await db
        .select({
          id: trackedPages.id,
          url: trackedPages.url,
          displayName: trackedPages.displayName,
          currentResults: trackedPages.currentResults,
          workspaceId: trackedPages.workspaceId,
        })
        .from(trackedPages)
        .where(eq(trackedPages.url, inputUrl))
        .limit(1);
      pageRecord = found;
    }

    if (!pageRecord) {
      throw new Error(`Tracked page "${cleanTargetId || inputUrl}" not found in database.`);
    }

    const targetUrl = inputUrl || pageRecord.url;
    logger.info(`Navigating to Meta Ad Library: ${targetUrl}`);

    // Acquire atomic distributed lock to prevent duplicate concurrent scrapes
    const lockKey = `lock:scrape:${pageRecord.id}`;
    const acquired = await acquireLock(lockKey, 180);
    if (!acquired) {
      logger.warn(`Page ${pageRecord.id} (${pageRecord.displayName || targetUrl}) is already locked by another worker. Skipping duplicate scrape.`);
      return {
        skipped: true,
        pageId: pageRecord.id,
        reason: "concurrent_scrape_locked",
      };
    }

    let browser: any = null;

    try {
      // Update status to scanning
      await db
        .update(trackedPages)
        .set({ status: "scanning", updatedAt: new Date() })
        .where(eq(trackedPages.id, pageRecord.id));

      // 2. Launch headless browser
      const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== "false";
      browser = await chromium.launch({
        headless: isHeadless,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
        ],
      });

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
      if (browser) {
        await browser.close().catch(() => {});
      }
      // Release distributed lock
      await releaseLock(lockKey);

      // Invalidate Upstash cache for workspace so UI reflects fresh counts
      if (pageRecord.workspaceId) {
        await Promise.allSettled([
          deleteCached(`cache:stats:${pageRecord.workspaceId}`),
          deleteByPrefix(`cache:pages:${pageRecord.workspaceId}:`),
        ]);
      }
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
