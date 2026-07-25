import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getBrowserSession, closeBrowserSession } from "./browser";
import { scanMetaAdPage } from "./scanner";
import {
  getNextPendingJob,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
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

  // Check command line arguments for test mode
  const args = process.argv.slice(2);
  const testUrlIdx = args.indexOf("--test-url");

  if (testUrlIdx !== -1 && args[testUrlIdx + 1]) {
    const testUrl = args[testUrlIdx + 1];
    console.log(`[Test Mode] Running single scan for URL: ${testUrl}`);
    const { page } = await getBrowserSession();
    const outcome = await scanMetaAdPage(page, testUrl);
    console.log("[Test Mode] Result outcome:", outcome);
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
        await randomDelay(15000, 30000);
        continue;
      }

      // 2. Check hourly / daily scan caps
      const caps = await checkRateCaps();
      if (!caps.allowed) {
        console.log(`[Rate Limit] ${caps.reason}`);
        await randomDelay(30000, 60000);
        continue;
      }

      // 3. Fetch next job
      const nextJob = await getNextPendingJob();

      if (!nextJob) {
        console.log(`[Queue Empty] All pending jobs completed. Worker idling (${ranJobs} processed).`);
        await randomDelay(15000, 30000);
        continue;
      }

      const { queueJob, trackedPage } = nextJob;
      console.log(`\n[Processing Job] ID: ${queueJob.id} | Page: "${trackedPage.displayName || trackedPage.id}"`);

      // 4. Mark running
      await markJobRunning(queueJob.id, trackedPage.id);

      // 5. Get browser & scan page
      const { page } = await getBrowserSession();
      const outcome = await scanMetaAdPage(page, trackedPage.url);

      // 6. Handle scan result
      if (outcome.status === "success" || outcome.status === "unclear") {
        console.log(
          `[Success] Status: ${outcome.status} | Results: ${outcome.results ?? "N/A"}`
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
          `[Failed] Reason: ${outcome.failureReason}`
        );
        await markJobFailed(
          queueJob.id,
          trackedPage.id,
          outcome.failureReason || "navigation_error"
        );
        await handleFailure();
      }

      ranJobs++;

      // 7. Inter-page delay
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
  await closeBrowserSession();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down worker...");
  await closeBrowserSession();
  process.exit(0);
});

runWorker();
