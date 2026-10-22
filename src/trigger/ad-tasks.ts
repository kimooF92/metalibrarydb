import { task, logger } from "@trigger.dev/sdk";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { db } from "../../db";
import { trackedPages, queue } from "../../db/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { scanMetaAdPage } from "../../worker/scanner";
import { markJobCompleted } from "../../worker/db";
import { acquireLock, releaseLock, deleteCached, deleteByPrefix, setCached } from "../../lib/cache-service";

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
  machine: "medium-2x", // 2 vCPU, 4 GB RAM (prevents Playwright TASK_PROCESS_OOM_KILLED crashes)
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 3000,
  },
  queue: {
    concurrencyLimit: 2, // Protect against Meta rate limits
  },
  onFailure: async ({ payload, error }: any) => {
    const errMessage = (error as any)?.message || String(error) || "trigger_task_failed";
    logger.error(`[scan-page-count] onFailure hook triggered: ${errMessage}`);
    try {
      const rawTarget =
        (typeof payload === "string" ? payload : null) ||
        (payload as any)?.pageId ||
        (payload as any)?.id ||
        (payload as any)?.trackedPageId ||
        (payload as any)?.payload?.pageId ||
        (payload as any)?.payload?.id;

      if (!rawTarget || typeof rawTarget !== "string") return;
      const cleanId = rawTarget.trim();

      const [pageRecord] = await db
        .select({
          id: trackedPages.id,
          status: trackedPages.status,
          currentResults: trackedPages.currentResults,
          lastSuccessAt: trackedPages.lastSuccessAt,
          workspaceId: trackedPages.workspaceId,
        })
        .from(trackedPages)
        .where(or(eq(trackedPages.id, cleanId), eq(trackedPages.pageId, cleanId)))
        .limit(1);

      if (pageRecord && pageRecord.status === "scanning") {
        const now = new Date();
        const fallbackStatus =
          pageRecord.lastSuccessAt !== null || pageRecord.currentResults !== null ? "success" : "failed";

        await db
          .update(trackedPages)
          .set({
            status: fallbackStatus,
            lastChecked: now,
            updatedAt: now,
          })
          .where(eq(trackedPages.id, pageRecord.id))
          .catch(() => {});

        await db
          .update(queue)
          .set({
            status: "failed",
            finishedAt: now,
            failureReason: errMessage,
          })
          .where(and(eq(queue.trackedPageId, pageRecord.id), inArray(queue.status, ["pending", "running"])))
          .catch(() => {});

        await releaseLock(`lock:scrape:${pageRecord.id}`).catch(() => {});
        await setCached(
          `scan_step:${pageRecord.id}`,
          {
            pageId: pageRecord.id,
            step: "failed",
            label: `Scan failed: ${errMessage}`,
            percent: 100,
            timestamp: Date.now(),
          },
          60
        ).catch(() => {});

        if (pageRecord.workspaceId) {
          await deleteCached(`cache:stats:${pageRecord.workspaceId}`).catch(() => {});
          await deleteByPrefix(`cache:pages:${pageRecord.workspaceId}:`).catch(() => {});
        }
      }
    } catch (cleanupErr: any) {
      logger.error(`[scan-page-count] Error during onFailure cleanup: ${cleanupErr?.message || cleanupErr}`);
    }
  },
  run: async (payload: ScanPageCountPayload, { ctx }: any = {}) => {
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
      pageId: string | null;
      url: string;
      displayName: string | null;
      currentResults: number | null;
      workspaceId: string | null;
    } | undefined;

    if (cleanTargetId && isUuid(cleanTargetId)) {
      const [found] = await db
        .select({
          id: trackedPages.id,
          pageId: trackedPages.pageId,
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
          pageId: trackedPages.pageId,
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
          pageId: trackedPages.pageId,
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

    // Distributed lock with 60s TTL (instead of 180s)
    const lockKey = `lock:scrape:${pageRecord.id}`;

    // If this is a retry attempt (attempt > 1), release any dangling lock left by the previous crashed attempt
    if (ctx && ctx.attempt && ctx.attempt.number > 1) {
      logger.info(`[scan-page-count] Attempt ${ctx.attempt.number}: clearing lock from previous attempt`);
      await releaseLock(lockKey).catch(() => {});
    }

    const acquired = await acquireLock(lockKey, 60);
    if (!acquired) {
      logger.warn(`Page ${pageRecord.id} (${pageRecord.displayName || targetUrl}) is already locked by another worker.`);
      // Throw an error so Trigger.dev retries with backoff rather than falsely recording success
      throw new Error(`Page ${pageRecord.id} is currently locked by another worker.`);
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // Update status to scanning
      await db
        .update(trackedPages)
        .set({ status: "scanning", updatedAt: new Date() })
        .where(eq(trackedPages.id, pageRecord.id));

      await setCached(
        `scan_step:${pageRecord.id}`,
        {
          pageId: pageRecord.id,
          displayName: pageRecord.displayName || targetUrl,
          step: "launching",
          label: "1. Launching browser instance...",
          percent: 15,
          timestamp: Date.now(),
        },
        120
      );

      // 2. Launch headless browser with low-memory container flags (NO --single-process)
      const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== "false";
      browser = await chromium.launch({
        headless: isHeadless,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--disable-blink-features=AutomationControlled",
          "--disable-extensions",
          "--disable-component-extensions-with-background-pages",
          "--disable-default-apps",
          "--mute-audio",
          "--no-default-browser-check",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-ipc-flooding-protection",
          "--js-flags=--max-old-space-size=512",
        ],
      });

      context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale: "en-US",
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        },
      });

      page = await context.newPage();

      // Intercept and abort memory-heavy binary resources (video streams, images, fonts)
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "media", "font", "imageset"].includes(type)) {
          return route.abort();
        }
        return route.continue();
      });

      // 3. Perform the scrape with live progress updates
      const outcome = await scanMetaAdPage(
        page,
        targetUrl,
        async (step, label, pct) => {
          await setCached(
            `scan_step:${pageRecord.id}`,
            {
              pageId: pageRecord.id,
              displayName: pageRecord.displayName || targetUrl,
              step,
              label,
              percent: pct,
              timestamp: Date.now(),
            },
            120
          );
        },
        {
          previousCount: pageRecord.currentResults,
          brandName: pageRecord.displayName,
        }
      );
      logger.info(`Scrape outcome for ${pageRecord.displayName || targetUrl}: ${JSON.stringify(outcome)}`);

      await setCached(
        `scan_step:${pageRecord.id}`,
        {
          pageId: pageRecord.id,
          displayName: pageRecord.displayName || targetUrl,
          step: "saving",
          label: "4. Saving snapshot & updating sparkline...",
          percent: 90,
          timestamp: Date.now(),
        },
        120
      );

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

        await setCached(
          `scan_step:${pageRecord.id}`,
          {
            pageId: pageRecord.id,
            displayName: pageRecord.displayName || targetUrl,
            step: "completed",
            label: `Scan complete: ${outcome.results ?? 0} active ads found`,
            activeAds: outcome.results,
            percent: 100,
            timestamp: Date.now(),
          },
          60
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

        await setCached(
          `scan_step:${pageRecord.id}`,
          {
            pageId: pageRecord.id,
            displayName: pageRecord.displayName || targetUrl,
            step: "failed",
            label: `Scan failed: ${outcome.failureReason || "unknown error"}`,
            percent: 100,
            timestamp: Date.now(),
          },
          60
        );
      }

      // Explicitly dispose of browser resources immediately
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
        page = null;
      }
      if (context) {
        await context.close().catch(() => {});
        context = null;
      }
      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
      }

      return {
        success: outcome.status === "success",
        pageId: pageRecord.id,
        count: outcome.results,
        status: outcome.status,
        failureReason: outcome.failureReason,
      };
    } catch (taskErr: any) {
      logger.error(`[scan-page-count] Execution crashed for ${pageRecord.displayName || targetUrl}: ${taskErr?.message || taskErr}`);
      const now = new Date();
      // Ensure page does not stay stuck in 'scanning' status upon unhandled crash
      const fallbackStatus =
        pageRecord.currentResults !== null ? "success" : "failed";
      await db
        .update(trackedPages)
        .set({
          status: fallbackStatus,
          lastChecked: now,
          updatedAt: now,
        })
        .where(eq(trackedPages.id, pageRecord.id))
        .catch(() => {});

      await db
        .update(queue)
        .set({
          status: "failed",
          finishedAt: now,
          failureReason: taskErr?.message || "task_exception",
        })
        .where(and(eq(queue.trackedPageId, pageRecord.id), inArray(queue.status, ["pending", "running"])))
        .catch(() => {});

      throw taskErr;
    } finally {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
      if (context) {
        await context.close().catch(() => {});
      }
      if (browser) {
        await browser.close().catch(() => {});
      }
      // Release distributed lock
      await releaseLock(lockKey).catch(() => {});

      // Invalidate Upstash cache for workspace so UI reflects fresh counts
      if (pageRecord.workspaceId) {
        const canonicalKey = (pageRecord.pageId || pageRecord.id).toLowerCase();
        await Promise.allSettled([
          deleteCached(`cache:stats:${pageRecord.workspaceId}`),
          deleteByPrefix(`cache:pages:${pageRecord.workspaceId}:`),
          deleteByPrefix(`cache:products:${pageRecord.workspaceId}:`),
          deleteByPrefix(`cache:fresh_winners:${pageRecord.workspaceId}:`),
          deleteByPrefix(`cache:spy_ads:${pageRecord.workspaceId}:`),
          deleteByPrefix(`cache:brand:${pageRecord.workspaceId}:${canonicalKey}:`),
        ]);
      }
    }
  },
});

/**
 * Task: retryFailedPagesTask
 * Recovery task that enqueues failed pages as pending in the database queue
 * for local or GitHub Actions worker processing (avoiding multi-page Trigger.dev usage).
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

    const failedIds = failedPages.map((p) => p.id);
    const now = new Date();

    logger.info(`Setting ${failedPages.length} failed pages to pending in DB queue for local/GitHub worker...`);

    // 1. Mark as pending in tracked_pages
    await db
      .update(trackedPages)
      .set({ status: "pending", updatedAt: now })
      .where(inArray(trackedPages.id, failedIds));

    // 2. Fetch existing active queue jobs to avoid duplicate entries
    const existingQueueJobs = await db
      .select({ trackedPageId: queue.trackedPageId })
      .from(queue)
      .where(and(inArray(queue.trackedPageId, failedIds), inArray(queue.status, ["pending", "running"])));
    const existingSet = new Set(existingQueueJobs.map((q) => q.trackedPageId));
    const toEnqueue = failedIds.filter((id) => !existingSet.has(id));

    if (toEnqueue.length > 0) {
      await db.insert(queue).values(
        toEnqueue.map((id) => ({
          trackedPageId: id,
          jobType: "count" as const,
          status: "pending" as const,
          priority: 10,
        }))
      );
    }

    return {
      retriedCount: failedPages.length,
      mode: "pending_worker_queue",
      message: `Enqueued ${failedPages.length} failed page(s) into database queue. Waiting for GitHub worker or local worker.`,
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

export interface DispatchGithubWorkerPayload {
  target?: "worker" | "spy" | "scraper" | "favorites" | "all";
  runCanary?: boolean;
}

/**
 * Task: dispatchGithubWorkerTask
 * Lightweight orchestrator task that triggers GitHub Actions workflows via workflow_dispatch.
 * Consumes near-zero Trigger.dev compute credits (~200ms) while offloading heavy Playwright
 * scrapers to GitHub's free 2,000 runner minutes/month.
 */
export const dispatchGithubWorkerTask = task({
  id: "dispatch-github-worker",
  run: async (payload: DispatchGithubWorkerPayload = {}) => {
    const target = payload.target || "worker";
    const runCanary = payload.runCanary ? "true" : "false";

    const repoOwner = process.env.GITHUB_REPO_OWNER || "kimooF92";
    const repoName = process.env.GITHUB_REPO_NAME || "metalibrarydb";
    const token = process.env.GH_PAT_TOKEN || process.env.GITHUB_TOKEN;

    if (!token) {
      const errMsg = "Missing GH_PAT_TOKEN or GITHUB_TOKEN in environment variables.";
      logger.error(errMsg);
      throw new Error(errMsg);
    }

    logger.info(`Dispatching GitHub Actions workflow for target: ${target} (${repoOwner}/${repoName})`);

    const workflowMap: Record<string, { file: string; inputs?: Record<string, string> }> = {
      worker: { file: "worker.yml", inputs: { run_canary: runCanary } },
      spy: { file: "spy-worker.yml" },
      scraper: { file: "product-scraper.yml" },
      favorites: { file: "verify-favorites.yml" },
    };

    const targetsToRun = target === "all" ? ["worker", "spy", "scraper"] : [target];
    const results: Record<string, any> = {};

    for (const t of targetsToRun) {
      const config = workflowMap[t] || { file: "worker.yml" };
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${config.file}/dispatches`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "TriggerDev-Worker-Dispatcher",
            },
            body: JSON.stringify({
              ref: "main",
              ...(config.inputs ? { inputs: config.inputs } : {}),
            }),
          }
        );

        if (res.status === 204) {
          logger.info(`Successfully dispatched ${config.file} (HTTP 204)`);
          results[t] = { status: "dispatched", httpCode: 204, workflow: config.file };
        } else {
          const body = await res.text();
          logger.error(`Failed to dispatch ${config.file}: HTTP ${res.status} - ${body}`);
          results[t] = { status: "failed", httpCode: res.status, error: body };
        }
      } catch (err: any) {
        logger.error(`Error requesting GitHub API for ${config.file}: ${err.message}`);
        results[t] = { status: "error", error: err.message };
      }
    }

    const hasSuccess = Object.values(results).some((r) => r.status === "dispatched");
    if (!hasSuccess) {
      throw new Error(`Failed to dispatch any workflows: ${JSON.stringify(results)}`);
    }

    return {
      success: true,
      dispatchedAt: new Date().toISOString(),
      results,
    };
  },
});
