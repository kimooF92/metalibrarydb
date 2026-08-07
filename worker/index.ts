import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

import { db } from "../db";
import { trackedPages, creativeScans, discoveryRuns } from "../db/schema";
import { getBrowserSession, closeBrowserSession } from "./browser";
import { scanMetaAdPage } from "./scanner";
import { scanAdCreatives } from "./spy-scanner";
import { runDiscoveryScan } from "./discovery-scanner";
import { extractUrlMetadata } from "../lib/url-parser";
import { eq, asc } from "drizzle-orm";
import {
  getNextPendingJob,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  markCreativeJobCompleted,
  markCreativeJobFailed,
  markDiscoveryJobCompleted,
  markDiscoveryJobFailed,
  resetStuckJobs,
  enqueueAllPagesForRefresh,
  enqueuePagesForCreativeScan,
  updateWorkerState,
} from "./db";
import {
  checkRateCaps,
  recordSuccessfulScan,
  randomDelay,
  DELAY_CONFIG,
} from "./throttle";
import {
  checkBackoffStatus,
  handleFailure,
  handleSuccess,
} from "./backoff";

async function runWorker() {
  console.log("==========================================");
  console.log(" Meta Ad Library Tracker — Worker Started ");
  console.log("==========================================");

  // Clear any orphaned scanning/running jobs from previous unexpected shutdowns
  await resetStuckJobs();

  // Check command line arguments and environment variables
  const args = process.argv.slice(2);
  const testUrlIdx = args.indexOf("--test-url");
  const testSpyIdx = args.indexOf("--test-spy-url");
  const testDiscoveryIdx = args.indexOf("--discovery-url");
  const isSingleRun = args.includes("--once") || process.env.SINGLE_RUN === "true";

  const isForceRefresh = args.includes("--refresh-all") || process.env.REFRESH_ALL === "true";
  const shouldRefreshAll =
    isForceRefresh ||
    process.env.AUTO_BURST_ENQUEUE !== "false";

  if (shouldRefreshAll) {
    const cooldownHours = isForceRefresh
      ? 0
      : parseInt(process.env.AUTO_REFRESH_COOLDOWN_HOURS || "6", 10);
    console.log(
      `[Refresh Mode] Enqueuing eligible pages for auto-refresh (cooldown: ${cooldownHours}h)...`
    );
    await enqueueAllPagesForRefresh(cooldownHours);
  }

  const shouldEnqueueSpy = args.includes("--enqueue-spy") || process.env.ENQUEUE_SPY === "true";
  if (shouldEnqueueSpy) {
    const spyCooldownDays = parseInt(process.env.SPY_COOLDOWN_DAYS || "3", 10);
    const spyMaxPages = parseInt(process.env.SPY_MAX_PAGES_PER_RUN || "25", 10);
    console.log(
      `[Spy Mode] Enqueuing eligible pages for Ad Spy creative scan (cooldown: ${spyCooldownDays}d, max: ${spyMaxPages} pages/round)...`
    );
    await enqueuePagesForCreativeScan(spyCooldownDays, spyMaxPages);
  }

  if (testUrlIdx !== -1 && args[testUrlIdx + 1]) {
    const testUrl = args[testUrlIdx + 1];
    console.log(`[Test Mode] Running single result-count scan for URL: ${testUrl}`);
    const { page } = await getBrowserSession();
    const outcome = await scanMetaAdPage(page, testUrl);
    console.log("[Test Mode] Result outcome:", outcome);
    await closeBrowserSession();
    process.exit(0);
  }

  if (testSpyIdx !== -1 && args[testSpyIdx + 1]) {
    const testUrl = args[testSpyIdx + 1];
    console.log(`[Test Mode] Running single Ad Spy Creative scan for URL: ${testUrl}`);
    
    const [testPage] = await db
      .insert(trackedPages)
      .values({
        url: testUrl,
        displayName: "Test Page",
        searchType: "page",
        status: "scanning",
      })
      .onConflictDoUpdate({
        target: trackedPages.url,
        set: { updatedAt: new Date() },
      })
      .returning();

    const [testScan] = await db
      .insert(creativeScans)
      .values({
        trackedPageId: testPage.id,
        status: "running",
      })
      .returning();

    const { page } = await getBrowserSession();
    const outcome = await scanAdCreatives(page, testPage.id, testUrl, testScan.id);
    console.log("[Test Mode] Creative scan outcome:", outcome);
    await closeBrowserSession();
    process.exit(0);
  }

  if (testDiscoveryIdx !== -1 && args[testDiscoveryIdx + 1]) {
    const discoveryUrl = args[testDiscoveryIdx + 1];
    console.log(`[Discovery Mode] Running standalone country discovery scan for URL: ${discoveryUrl}`);

    const [runRecord] = await db
      .insert(discoveryRuns)
      .values({
        country: "TN",
        searchUrl: discoveryUrl,
        status: "running",
        startedAt: new Date(),
      })
      .returning();

    const { page } = await getBrowserSession();
    const outcome = await runDiscoveryScan(page, runRecord.id, discoveryUrl, "TN");
    console.log("[Discovery Mode] Discovery scan outcome:", outcome);
    await closeBrowserSession();
    process.exit(0);
  }

  let ranJobs = 0;

  try {
    while (true) {
      // Heartbeat update
      await updateWorkerState({ updatedAt: new Date() }).catch(() => {});

      // 0. Check for pending country discovery runs first
      const pendingDiscoveryRun = await db.query.discoveryRuns.findFirst({
        where: eq(discoveryRuns.status, "pending"),
        orderBy: [asc(discoveryRuns.createdAt)],
      });

      if (pendingDiscoveryRun) {
        console.log(
          `\n[Processing DISCOVERY Job] ID: ${pendingDiscoveryRun.id} | Country: ${pendingDiscoveryRun.country}`
        );
        const { page } = await getBrowserSession();
        const outcome = await runDiscoveryScan(
          page,
          pendingDiscoveryRun.id,
          pendingDiscoveryRun.searchUrl,
          pendingDiscoveryRun.country
        );
        console.log(
          `[Discovery Finished] Status: ${outcome.status} | Discovered: ${outcome.totalPagesDiscovered} pages from ${outcome.totalAdsScanned} ads`
        );
        if (outcome.status === "completed" || outcome.status === "partial") {
          await recordSuccessfulScan();
          await handleSuccess();
        } else {
          await handleFailure();
        }
        ranJobs++;
        continue;
      }
      // 1. Check backoff / pause status
      const backoff = await checkBackoffStatus();
      if (backoff.inBackoff) {
        console.log(`[Worker Paused] ${backoff.reason}`);
        if (isSingleRun) {
          console.log("[Single Run] Worker paused due to backoff. Exiting.");
          process.exit(0);
        }
        await randomDelay(15000, 30000);
        continue;
      }

      // 2. Check hourly / daily scan caps
      const caps = await checkRateCaps();
      if (!caps.allowed) {
        console.log(`[Rate Limit] ${caps.reason}`);
        if (isSingleRun) {
          console.log("[Single Run] Rate cap reached. Exiting.");
          process.exit(0);
        }
        await randomDelay(30000, 60000);
        continue;
      }

      // 3. Fetch next job
      const nextJob = await getNextPendingJob();

      if (!nextJob) {
        console.log(`[Queue Empty] All pending jobs completed. Worker idling (${ranJobs} processed).`);
        if (isSingleRun) {
          console.log("[Single Run] Queue is empty. Exiting worker cleanly.");
          process.exit(0);
        }
        await randomDelay(15000, 30000);
        continue;
      }

      const { queueJob, trackedPage, discoveredPage, creativeScan } = nextJob;
      const jobType = queueJob.jobType || "count";
      const targetDisplayName =
        trackedPage?.displayName ||
        trackedPage?.id ||
        discoveredPage?.displayName ||
        discoveredPage?.pageId ||
        queueJob.id;

      console.log(
        `\n[Processing ${jobType.toUpperCase()} Job (Priority: ${queueJob.priority || 1})] ID: ${queueJob.id} | Target: "${targetDisplayName}"`
      );

      // 4. Route job by type
      const { page } = await getBrowserSession();

      if (jobType === "discovery_count" && discoveredPage) {
        // Run Discovery Page Verification count scan
        const discoveryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${discoveredPage.country || "TN"}&view_all_page_id=${discoveredPage.pageId}&search_type=page&media_type=all`;
        const outcome = await scanMetaAdPage(page, discoveryUrl);

        if (outcome.status === "success" || outcome.status === "unclear") {
          console.log(
            `[Discovery Verify Success] Status: ${outcome.status} | Verified Ad Count: ${outcome.results ?? "N/A"}`
          );
          await markDiscoveryJobCompleted(
            queueJob.id,
            discoveredPage.id,
            outcome.results
          );
          await recordSuccessfulScan();
          await handleSuccess();
        } else {
          console.warn(
            `[Discovery Verify Failed] Reason: ${outcome.failureReason}`
          );
          await markDiscoveryJobFailed(
            queueJob.id,
            discoveredPage.id,
            outcome.failureReason || "navigation_error"
          );
          await handleFailure();
        }
      } else if (jobType === "creative" && creativeScan && trackedPage) {
        // Smart Page ID Resolution: check DB column or URL parameter
        const urlMeta = extractUrlMetadata(trackedPage.url);
        const effectivePageId = trackedPage.pageId || urlMeta.pageId;

        if (!effectivePageId) {
          console.warn(
            `[Creative Guard] Page ID unresolved for target "${targetDisplayName}". Running initial count scan first to resolve Page ID...`
          );
          const countOutcome = await scanMetaAdPage(page, trackedPage.url);
          if (countOutcome.status === "success" || countOutcome.status === "unclear") {
            await markJobCompleted(
              queueJob.id,
              trackedPage.id,
              countOutcome.results,
              countOutcome.status
            );
            await recordSuccessfulScan();
            await handleSuccess();
          } else {
            await markCreativeJobFailed(
              queueJob.id,
              creativeScan.id,
              "unverified_page",
              "Page count scan failed prior to creative scan"
            );
            await handleFailure();
            continue;
          }
        } else if (!trackedPage.pageId && effectivePageId) {
          // Backfill pageId into trackedPages DB record if extracted from URL
          await db
            .update(trackedPages)
            .set({ pageId: effectivePageId, updatedAt: new Date() })
            .where(eq(trackedPages.id, trackedPage.id));
        }

        // Run Ad Spy GraphQL extraction
        const outcome = await scanAdCreatives(
          page,
          trackedPage.id,
          trackedPage.url,
          creativeScan.id
        );

        if (outcome.status === "completed" || outcome.status === "partial") {
          console.log(
            `[Creative Success] Status: ${outcome.status} | Extracted: ${outcome.extractedCount} ads`
          );
          await markCreativeJobCompleted(
            queueJob.id,
            creativeScan.id,
            outcome.extractedCount,
            outcome.status
          );
          await recordSuccessfulScan();
          await handleSuccess();
        } else {
          console.warn(
            `[Creative Failed] Reason: ${outcome.failureReason} | Details: ${outcome.outcomeDetails}`
          );
          await markCreativeJobFailed(
            queueJob.id,
            creativeScan.id,
            outcome.failureReason || "timeout",
            outcome.outcomeDetails
          );
          await handleFailure();
        }
      } else if (trackedPage) {
        // Run Result Count scan for Tracked Page
        const outcome = await scanMetaAdPage(page, trackedPage.url);

        if (outcome.status === "success" || outcome.status === "unclear") {
          console.log(
            `[Count Success] Status: ${outcome.status} | Results: ${outcome.results ?? "N/A"}`
          );
          await markJobCompleted(
            queueJob.id,
            trackedPage.id,
            outcome.results,
            outcome.status
          );
          await recordSuccessfulScan();
          await handleSuccess();
        } else {
          console.warn(
            `[Count Failed] Reason: ${outcome.failureReason}`
          );
          await markJobFailed(
            queueJob.id,
            trackedPage.id,
            outcome.failureReason || "navigation_error"
          );
          await handleFailure();
        }
      }

      ranJobs++;

      // 6. Inter-page delay
      console.log(`[Cooldown] Waiting before next request...`);
      await randomDelay(
        DELAY_CONFIG.beforeNextPageMin,
        DELAY_CONFIG.beforeNextPageMax
      );
    }
  } catch (err) {
    console.error("Worker process error:", err);
  } finally {
    await closeBrowserSession();
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down worker...");
  await resetStuckJobs();
  await closeBrowserSession();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down worker...");
  await resetStuckJobs();
  await closeBrowserSession();
  process.exit(0);
});

runWorker();

