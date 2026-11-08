import { db } from "../../db";
import { trackedPages, creativeScans, discoveryRuns, discoveredPages, queue } from "../../db/schema";
import { getBrowserSession, closeBrowserSession } from "../browser";
import { scanMetaAdPage } from "../scanner";
import { scanAdCreatives } from "../scanners/ad-spy-crawler";
import { runDiscoveryScan } from "../scanners/discovery-crawler";
import { eq, desc } from "drizzle-orm";
import {
  getNextPendingJob,
  claimNextPendingDiscoveryRun,
  enqueuePagesForCreativeScan,
  updateWorkerState,
  getAppSettings,
  resetStuckJobs,
} from "../db";
import { checkRateCaps, randomDelay, DELAY_CONFIG } from "../throttle";
import { checkBackoffStatus } from "../backoff";
import { broadcastBatchSummary } from "../../lib/realtime-scan";
import { runStartupMaintenance } from "./startup-maintenance";
import { executeDiscoveryRun } from "./discovery-runner";
import { withDistributedScrapeLock } from "./distributed-lock";
import { dispatchQueueJob } from "./job-dispatcher";

export async function runWorker() {
  const shardIndex = process.env.SHARD_INDEX !== undefined ? parseInt(process.env.SHARD_INDEX, 10) : 0;
  const totalShards = process.env.TOTAL_SHARDS !== undefined ? parseInt(process.env.TOTAL_SHARDS, 10) : 1;
  const isMultiShard = totalShards > 1;
  const shardTag = isMultiShard ? ` [Shard ${shardIndex + 1}/${totalShards}]` : "";
  const isCoordinator = shardIndex === 0;

  console.log("==========================================");
  console.log(` Meta Ad Library Tracker — Worker Started${shardTag} `);
  console.log("==========================================");

  const args = process.argv.slice(2);
  const settings = await getAppSettings();

  const isForceRefresh = args.includes("--refresh-all") || process.env.REFRESH_ALL === "true";
  const shouldRefreshAll = isForceRefresh || process.env.AUTO_BURST_ENQUEUE !== "false";
  const shouldSkipEnqueue =
    args.includes("--skip-enqueue") ||
    args.includes("--no-enqueue") ||
    process.env.SKIP_ENQUEUE === "true";
  const shouldSkipStartupSweep =
    args.includes("--skip-sweep") ||
    args.includes("--no-sweep") ||
    args.includes("--skip-maintenance") ||
    process.env.SKIP_STARTUP_SWEEP === "true";

  // Run startup maintenance (stuck jobs reset, refresh enqueue, product rescue, Jev sweep, raw extract purge)
  await runStartupMaintenance({
    isCoordinator,
    shouldSkipEnqueue,
    shouldSkipStartupSweep,
    isForceRefresh,
    shouldRefreshAll,
    staleHours: settings.staleHours || 12,
  });

  if (args.includes("--headed") || args.includes("--head") || args.includes("--show")) {
    process.env.PLAYWRIGHT_HEADLESS = "false";
  } else if (args.includes("--headless")) {
    process.env.PLAYWRIGHT_HEADLESS = "true";
  }
  const isBrowserHeadless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  console.log(`[Browser Mode] 🖥️  ${isBrowserHeadless ? "HEADLESS (background)" : "NORMAL / HEADED (visible window)"}`);

  if (args.includes("--jev-sweep")) {
    const { runJevMaintenanceSweep } = await import("../jev-maintenance");
    const jevStats = await runJevMaintenanceSweep();
    console.log(`[Jev Sweep CLI] Finished: Reclassified ${jevStats.reclassified}, Resolved ${jevStats.pricesResolved}`);
    process.exit(0);
  }

  const testUrlIdx = args.indexOf("--test-url");
  const testSpyIdx = args.indexOf("--test-spy-url");
  const testDiscoveryIdx = args.indexOf("--discovery-url");
  const isSingleRun =
    args.includes("--once") ||
    args.includes("--single-run") ||
    process.env.SINGLE_RUN === "true" ||
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true";
  const isCountOnly =
    process.env.COUNT_ONLY === "true" ||
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true";

  // Canary check if coordinator
  if (isCoordinator && (args.includes("--canary") || process.env.RUN_CANARY_CHECK === "true")) {
    try {
      const { runCanarySanityCheck } = await import("../circuit-breaker");
      const { page } = await getBrowserSession();
      const canaryRes = await runCanarySanityCheck(page);
      if (!canaryRes.isHealthy) {
        console.warn(`[Worker Startup] 🛑 Canary check failed (${canaryRes.reason}). Meta Ad Library is unavailable.`);
        if (isSingleRun) {
          console.log("[Worker Startup] Single run mode with failed canary. Exiting cleanly.");
          process.exit(0);
        }
      }
    } catch (canaryErr: any) {
      console.warn("[Worker Startup] Canary check warning:", canaryErr?.message);
    }
  }

  if (isCountOnly) {
    console.log(
      "[Worker Mode] ⚡ Count-Only Mode Active: Creative spy scans will be skipped and reserved for local residential runner."
    );
  } else if (process.env.CREATIVE_ONLY === "true") {
    console.log(
      "[Worker Mode] 🎨 Creative-Only Mode Active: Only Ad Spy creative scans will be processed."
    );
  }

  const shouldEnqueueSpy =
    !isCountOnly &&
    (args.includes("--enqueue-spy") ||
      process.env.ENQUEUE_SPY === "true" ||
      process.env.AUTO_ENQUEUE_SPY !== "false");
  if (shouldEnqueueSpy && isCoordinator) {
    const spyCooldownDays = parseInt(process.env.SPY_COOLDOWN_DAYS || "3", 10);
    const spyMaxPages = parseInt(process.env.SPY_MAX_PAGES_PER_RUN || "25", 10);
    const spyThreshold = settings.autoSpyThreshold || 1;
    console.log(
      `[Spy Mode] Checking eligible pages with ads count updates for Ad Spy scan (cooldown: ${spyCooldownDays}d, max: ${spyMaxPages}, min diff: +${spyThreshold})...`
    );
    await enqueuePagesForCreativeScan(spyCooldownDays, spyMaxPages, spyThreshold);
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

    let extractedCountry = "TN";
    try {
      const p = new URL(discoveryUrl);
      extractedCountry = p.searchParams.get("country") || "TN";
    } catch {}

    const [runRecord] = await db
      .insert(discoveryRuns)
      .values({
        country: extractedCountry,
        searchUrl: discoveryUrl,
        status: "running",
        startedAt: new Date(),
      })
      .returning();

    const { page } = await getBrowserSession();
    const outcome = await runDiscoveryScan(page, runRecord.id, discoveryUrl, extractedCountry);
    console.log("[Discovery Mode] Discovery scan outcome:", outcome);
    await closeBrowserSession();
    process.exit(0);
  }

  let ranJobs = 0;
  let sessionScanned = 0;
  let sessionErrors = 0;
  const sessionMovers: Array<{ name: string; diff: number; currentResults: number; trackedPageId: string; pageId?: string }> = [];
  let sessionStartTime = Date.now();
  let lastBackoffNotifiedAt = 0;
  let lastRateCapNotifiedAt = 0;

  const emitSessionSummary = async () => {
    if (sessionScanned > 0) {
      try {
        const { logBatchSummaryNotification } = await import("../../lib/notifications");
        const durationSec = Math.round((Date.now() - sessionStartTime) / 1000);
        await logBatchSummaryNotification({
          runnerType: "count_worker",
          totalScanned: sessionScanned,
          newAdsCount: sessionMovers.reduce((acc, m) => acc + (m.diff || 0), 0),
          movers: sessionMovers,
          unchangedCount: sessionScanned - sessionMovers.length - sessionErrors,
          failedCount: sessionErrors,
          durationSeconds: durationSec,
          actionUrl: "/?sortBy=difference&sortOrder=desc",
          shardInfo: isMultiShard ? `Shard ${shardIndex + 1}/${totalShards}` : undefined,
        });

        await broadcastBatchSummary({
          finishedAt: Date.now(),
          totalScanned: sessionScanned,
          newAdsCount: sessionMovers.reduce((acc, m) => acc + (m.diff || 0), 0),
          moversCount: sessionMovers.length,
          durationSeconds: durationSec,
          shardInfo: isMultiShard ? `Shard ${shardIndex + 1}/${totalShards}` : undefined,
        }).catch(() => {});
      } catch (err) {
        console.error("[Worker] Failed to emit batch summary:", err);
      }
      sessionScanned = 0;
      sessionErrors = 0;
      sessionMovers.length = 0;
      sessionStartTime = Date.now();
    }
  };

  let lastHeartbeatAt = 0;
  let emptyQueueStartupRetries = 0;
  const MAX_STARTUP_EMPTY_RETRIES = 25;
  let lastJevSweepAt = Date.now();
  const JEV_SWEEP_FREQUENCY_MS = parseInt(process.env.JEV_SWEEP_INTERVAL_MS || "600000", 10);

  try {
    while (true) {
      // Heartbeat update throttled to 30s
      if (Date.now() - lastHeartbeatAt >= 30_000) {
        lastHeartbeatAt = Date.now();
        await updateWorkerState({
          updatedAt: new Date(),
        }).catch(() => {});
      }

      // 1. Backoff Check
      const backoff = await checkBackoffStatus();
      if (backoff.inBackoff) {
        console.log(`[Worker Idle] ${backoff.reason || "Paused"}. Waiting 15s...`);
        if (Date.now() - lastBackoffNotifiedAt > 300_000) {
          lastBackoffNotifiedAt = Date.now();
          try {
            const { createNotification } = await import("../../lib/notifications");
            await createNotification({
              type: "system_alert",
              title: "Worker Paused",
              message: backoff.reason || "The scanning worker is currently paused.",
              severity: "warning",
            });
          } catch {}
        }
        await randomDelay(15000, 20000);
        continue;
      }

      // 1b. Check for pending Discovery Runs
      const pendingDiscoveryRun = await claimNextPendingDiscoveryRun();
      if (pendingDiscoveryRun) {
        await executeDiscoveryRun(pendingDiscoveryRun);
        continue;
      }

      // 2. Rate Cap Check
      const rateCaps = await checkRateCaps();
      if (!rateCaps.allowed) {
        console.log(`[Worker Capped] ${rateCaps.reason}. Waiting before retry...`);
        if (Date.now() - lastRateCapNotifiedAt > 300_000) {
          lastRateCapNotifiedAt = Date.now();
          try {
            const { createNotification } = await import("../../lib/notifications");
            await createNotification({
              type: "system_alert",
              title: "Rate Limit Cooldown",
              message: rateCaps.reason || "Hourly scan limit reached.",
              severity: "info",
            });
          } catch {}
        }
        if (isSingleRun) {
          console.log("[Single Run] Rate cap reached. Exiting.");
          await emitSessionSummary();
          process.exit(0);
        }
        await randomDelay(30000, 60000);
        continue;
      }

      // 3. Fetch next job
      const nextJob = await getNextPendingJob();

      if (!nextJob) {
        const maxWarmupRetries = shouldSkipEnqueue ? 2 : MAX_STARTUP_EMPTY_RETRIES;
        if (isMultiShard && ranJobs === 0 && emptyQueueStartupRetries < maxWarmupRetries) {
          emptyQueueStartupRetries++;
          console.log(
            `[Queue Warmup] Waiting for coordinator to populate queue... (attempt ${emptyQueueStartupRetries}/${maxWarmupRetries})`
          );
          await randomDelay(shouldSkipEnqueue ? 1500 : 3000, shouldSkipEnqueue ? 2500 : 4000);
          continue;
        }

        console.log(`[Queue Empty] All pending jobs completed. Worker idling (${ranJobs} processed).`);
        await emitSessionSummary();

        // Product rescue fallback
        try {
          const { rescueFailedProductsBatch, validateForeignCurrencyProductsBatch } = await import("../product-rescue");
          await rescueFailedProductsBatch(3);
          await validateForeignCurrencyProductsBatch(3);
        } catch (rescueErr: any) {
          console.warn("[Local Rescue] Background rescue cycle warning:", rescueErr?.message);
        }

        // Periodic Jev sweep
        const now = Date.now();
        if (now - lastJevSweepAt >= JEV_SWEEP_FREQUENCY_MS) {
          lastJevSweepAt = now;
          try {
            const { runJevMaintenanceSweep } = await import("../jev-maintenance");
            const jevStats = await runJevMaintenanceSweep();
            if (jevStats.reclassified > 0 || jevStats.pricesResolved > 0) {
              console.log(
                `[Jev Frequency Sweep] 🚀 Reclassified ${jevStats.reclassified} products, Resolved ${jevStats.pricesResolved} prices.`
              );
            }
          } catch (jevErr: any) {
            console.warn("[Jev Frequency Sweep] Notice:", jevErr?.message);
          }

          try {
            const { purgeOldRawExtracts } = await import("../repositories/scan-history-repo");
            const purged = await purgeOldRawExtracts();
            if (purged > 0) {
              console.log(`[Periodic Maintenance] 🧹 Purged ${purged} expired rawExtract JSON payload(s).`);
            }
          } catch {}
        }

        if (isSingleRun) {
          try {
            const { hasActiveApifyDeltaTasks, waitForApifyDeltaQueueDrain } = await import("../db");
            if (hasActiveApifyDeltaTasks()) {
              console.log("[Single Run] Queue is empty, but background Apify delta scans are in flight. Awaiting completion...");
              await waitForApifyDeltaQueueDrain(90000);
            }
          } catch {}
          console.log("[Single Run] Queue is empty. Exiting worker cleanly.");
          process.exit(0);
        }
        await randomDelay(15000, 30000);
        continue;
      }

      const { queueJob, trackedPage } = nextJob;
      const jobType = queueJob.jobType || "count";
      const targetDisplayName =
        trackedPage?.displayName ||
        trackedPage?.id ||
        nextJob.discoveredPage?.displayName ||
        nextJob.discoveredPage?.pageId ||
        queueJob.id;

      console.log(
        `\n[Processing ${jobType.toUpperCase()} Job (Priority: ${queueJob.priority || 1})] ID: ${queueJob.id} | Target: "${targetDisplayName}"`
      );

      // Handle product scraping jobs directly
      if (jobType === "product_scrape") {
        const { page } = await getBrowserSession();
        await dispatchQueueJob({
          ...nextJob,
          browserPage: page,
          ranJobs,
          isCountOnly,
        });
        ranJobs++;
        continue;
      }

      // Handle tracked page scraping with distributed lock
      if (trackedPage) {
        const lockRes = await withDistributedScrapeLock(trackedPage.id, targetDisplayName, async () => {
          const { page } = await getBrowserSession();
          return dispatchQueueJob({
            ...nextJob,
            browserPage: page,
            ranJobs,
            isCountOnly,
            onMoverDetected: (m) => sessionMovers.push(m),
          });
        });

        if (!lockRes.acquired) {
          if (queueJob.id) {
            await db
              .update(queue)
              .set({ status: "completed", finishedAt: new Date() })
              .where(eq(queue.id, queueJob.id))
              .catch(() => {});
          }
          continue;
        }

        if (lockRes.result?.circuitBreakerTripped) {
          if (isSingleRun) {
            console.log("[Single Run] Circuit Breaker tripped. Exiting worker cleanly.");
            await emitSessionSummary();
            process.exit(0);
          }
          continue;
        }

        if (lockRes.result?.success) {
          sessionScanned++;
        } else {
          sessionScanned++;
          sessionErrors++;
        }
      } else if (nextJob.discoveredPage) {
        const { page } = await getBrowserSession();
        await dispatchQueueJob({
          ...nextJob,
          browserPage: page,
          ranJobs,
          isCountOnly,
        });
      }

      ranJobs++;

      console.log(`[Cooldown] Waiting before next request...`);
      await randomDelay(
        DELAY_CONFIG.beforeNextPageMin,
        DELAY_CONFIG.beforeNextPageMax
      );
    }
  } catch (err: any) {
    console.error("Worker process fatal error:", err);
    try {
      const { createNotification } = await import("../../lib/notifications");
      await createNotification({
        type: "system_alert",
        title: "Scanner Stopped",
        message: "Background scanner stopped unexpectedly and will restart automatically.",
        severity: "error",
      });
    } catch {}
  } finally {
    await closeBrowserSession();
  }
}
