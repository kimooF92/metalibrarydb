import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

import { db } from "../db";
import { trackedPages, creativeScans } from "../db/schema";
import { getBrowserSession, closeBrowserSession } from "./browser";
import { scanMetaAdPage } from "./scanner";
import { scanAdCreatives } from "./spy-scanner";
import {
  getNextPendingJob,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  markCreativeJobCompleted,
  markCreativeJobFailed,
  resetStuckJobs,
  enqueueAllPagesForRefresh,
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
  const isSingleRun = args.includes("--once") || process.env.SINGLE_RUN === "true";
  const shouldRefreshAll = args.includes("--refresh-all") || process.env.REFRESH_ALL === "true";

  if (shouldRefreshAll) {
    console.log("[Refresh Mode] Enqueuing all tracked pages for auto-refresh...");
    await enqueueAllPagesForRefresh();
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
    
    // Create or fetch real test tracked page and scan records for valid UUIDs
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

  let ranJobs = 0;

  try {
    while (true) {
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

      const { queueJob, trackedPage, creativeScan } = nextJob;
      const jobType = queueJob.jobType || "count";

      console.log(
        `\n[Processing ${jobType.toUpperCase()} Job] ID: ${queueJob.id} | Page: "${trackedPage.displayName || trackedPage.id}"`
      );

      // 4. Mark running
      await markJobRunning(queueJob.id, trackedPage.id, queueJob.creativeScanId);

      // 5. Route job by type
      const { page } = await getBrowserSession();

      if (jobType === "creative" && creativeScan) {
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
      } else {
        // Run Result Count scan
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

