import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

import { db } from "../db";
import { trackedPages, creativeScans, discoveryRuns, discoveredPages, queue } from "../db/schema";
import { getBrowserSession, closeBrowserSession } from "./browser";
import { scanMetaAdPage } from "./scanner";
import { scanAdCreatives } from "./spy-scanner";
import { runDiscoveryScan } from "./discovery-scanner";
import { mergeExactMatchWithPageId } from "../actions/merge-pages";
import { isValidPageId } from "../lib/utils";
import { eq, asc, desc, sql } from "drizzle-orm";
import {
  getNextPendingJob,
  claimNextPendingDiscoveryRun,
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
  enqueueOrEscalateJob,
  getAppSettings,
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
import { acquireLock, releaseLock, deleteCached, deleteByPrefix } from "../lib/cache-service";

async function runWorker() {
  const shardIndex = process.env.SHARD_INDEX !== undefined ? parseInt(process.env.SHARD_INDEX, 10) : 0;
  const totalShards = process.env.TOTAL_SHARDS !== undefined ? parseInt(process.env.TOTAL_SHARDS, 10) : 1;
  const isMultiShard = totalShards > 1;
  const shardTag = isMultiShard ? ` [Shard ${shardIndex + 1}/${totalShards}]` : "";
  const isCoordinator = shardIndex === 0;

  console.log("==========================================");
  console.log(` Meta Ad Library Tracker — Worker Started${shardTag} `);
  console.log("==========================================");

  // Check command line arguments and environment variables
  const args = process.argv.slice(2);

  const shouldSkipStartupSweep =
    args.includes("--skip-sweep") ||
    args.includes("--no-sweep") ||
    args.includes("--skip-maintenance") ||
    process.env.SKIP_STARTUP_SWEEP === "true";

  // Load live application settings from database (with fallback defaults)
  const settings = await getAppSettings();

  const isForceRefresh = args.includes("--refresh-all") || process.env.REFRESH_ALL === "true";
  const shouldRefreshAll =
    isForceRefresh ||
    process.env.AUTO_BURST_ENQUEUE !== "false";

  // Only the primary coordinator (Shard 0 or standalone runner) clears orphaned jobs and enqueues
  if (isCoordinator) {
    await resetStuckJobs();

    // 1. Immediately enqueue pending/refresh pages FIRST so all worker shards have jobs ready right away
    if (shouldRefreshAll) {
      const cooldownHours = isForceRefresh
        ? 0
        : parseInt(process.env.AUTO_REFRESH_COOLDOWN_HOURS || String(settings.staleHours || 12), 10);
      console.log(
        `[Refresh Mode] Enqueuing eligible pages for auto-refresh (cooldown: ${cooldownHours}h)...`
      );
      await enqueueAllPagesForRefresh(cooldownHours);
    }

    if (!shouldSkipStartupSweep) {
      // Check and immediately rescue any stuck or failed product scrapings on worker startup
      try {
        const { rescueFailedProductsBatch } = await import("./product-rescue");
        console.log("[Worker Startup] Checking for stuck or failed product scrapings to rescue...");
        const rescuedCount = await rescueFailedProductsBatch(5, true);
        if (rescuedCount > 0) {
          console.log(`[Worker Startup] 🟢 Rescued ${rescuedCount} stuck product(s) via local residential browser.`);
        }
      } catch (rescueErr: any) {
        console.warn("[Worker Startup] Product rescue notice:", rescueErr?.message);
      }

      // Run Jev Decision Engine startup sweep (reclassify General Merchandise & resolve 0 DT)
      try {
        const { runJevMaintenanceSweep } = await import("./jev-maintenance");
        console.log("[Worker Startup] Checking active products for General Merchandise reclassification & 0 DT price resolution...");
        const jevStats = await runJevMaintenanceSweep();
        if (jevStats.reclassified > 0 || jevStats.pricesResolved > 0) {
          console.log(`[Worker Startup] 🚀 Jev Sweep: Reclassified ${jevStats.reclassified} products, Resolved ${jevStats.pricesResolved} prices.`);
        }
      } catch (jevErr: any) {
        console.warn("[Worker Startup] Jev maintenance notice:", jevErr?.message);
      }
    } else {
      console.log("[Worker Startup] ⏩ Startup rescue & maintenance sweep skipped by flag.");
    }
  }

  if (args.includes("--headed") || args.includes("--head") || args.includes("--show")) {
    process.env.PLAYWRIGHT_HEADLESS = "false";
  } else if (args.includes("--headless")) {
    process.env.PLAYWRIGHT_HEADLESS = "true";
  }
  const isBrowserHeadless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  console.log(`[Browser Mode] 🖥️  ${isBrowserHeadless ? "HEADLESS (background)" : "NORMAL / HEADED (visible window)"}`);

  if (args.includes("--jev-sweep")) {
    const { runJevMaintenanceSweep } = await import("./jev-maintenance");
    const jevStats = await runJevMaintenanceSweep();
    console.log(`[Jev Sweep CLI] Finished: Reclassified ${jevStats.reclassified}, Resolved ${jevStats.pricesResolved}`);
    process.exit(0);
  }
  const testUrlIdx = args.indexOf("--test-url");
  const testSpyIdx = args.indexOf("--test-spy-url");
  const testDiscoveryIdx = args.indexOf("--discovery-url");
  const isSingleRun = args.includes("--once") || process.env.SINGLE_RUN === "true";

  if (args.includes("--count-only")) {
    process.env.COUNT_ONLY = "true";
  }
  if (args.includes("--creative-only")) {
    process.env.CREATIVE_ONLY = "true";
  }
  const isCountOnly =
    process.env.COUNT_ONLY === "true" ||
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true";

  // Canary Sanity Check (Verification of Meta Ad Library health)
  if (isCoordinator && (args.includes("--canary") || process.env.RUN_CANARY_CHECK === "true")) {
    try {
      const { runCanarySanityCheck } = await import("./circuit-breaker");
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
        const { logBatchSummaryNotification } = await import("../lib/notifications");
        await logBatchSummaryNotification({
          runnerType: "count_worker",
          totalScanned: sessionScanned,
          newAdsCount: sessionMovers.reduce((acc, m) => acc + (m.diff || 0), 0),
          movers: sessionMovers,
          unchangedCount: sessionScanned - sessionMovers.length - sessionErrors,
          failedCount: sessionErrors,
          durationSeconds: Math.round((Date.now() - sessionStartTime) / 1000),
          actionUrl: "/?sortBy=difference&sortOrder=desc",
          shardInfo: isMultiShard ? `Shard ${shardIndex + 1}/${totalShards}` : undefined,
        });
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
  const MAX_STARTUP_EMPTY_RETRIES = 10;
  let lastJevSweepAt = Date.now();
  const JEV_SWEEP_FREQUENCY_MS = parseInt(process.env.JEV_SWEEP_INTERVAL_MS || "600000", 10); // default 10 minutes

  try {
    while (true) {
      // Heartbeat update (throttled to once every 30 seconds to reduce Supabase query frequency)
      if (Date.now() - lastHeartbeatAt >= 30_000) {
        lastHeartbeatAt = Date.now();
        await updateWorkerState({ updatedAt: new Date() }).catch(() => {});
      }

      // 0. Check for pending country discovery runs first (claimed atomically with FOR UPDATE SKIP LOCKED)
      const pendingDiscoveryRun = await claimNextPendingDiscoveryRun();

      if (pendingDiscoveryRun) {
        console.log(
          `\n[Processing DISCOVERY Job] ID: ${pendingDiscoveryRun.id} | Country: ${pendingDiscoveryRun.country}`
        );
        const discoveryStartTime = Date.now();
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

          // Rich Executive Summary for Discovery Run
          try {
            const topPages = await db.query.discoveredPages.findMany({
              where: eq(discoveredPages.runId, pendingDiscoveryRun.id),
              orderBy: [desc(discoveredPages.matchingAdCount)],
              limit: 5,
            });

            const { logDiscoverySummaryNotification } = await import("../lib/notifications");
            await logDiscoverySummaryNotification({
              country: pendingDiscoveryRun.country || "ALL",
              totalAdsScanned: outcome.totalAdsScanned || 0,
              totalPagesDiscovered: outcome.totalPagesDiscovered || 0,
              topBrands: topPages.map((p) => ({
                name: p.displayName || `Page ${p.pageId}`,
                pageId: p.pageId,
                adCount: p.matchingAdCount || p.verifiedAdCount || 0,
              })),
              durationSeconds: Math.round((Date.now() - discoveryStartTime) / 1000),
              runId: pendingDiscoveryRun.id,
            });
          } catch (notifErr) {
            console.error("[Worker] Failed to emit discovery notification:", notifErr);
          }
        } else {
          await handleFailure();
          try {
            const { createNotification } = await import("../lib/notifications");
            await createNotification({
              type: "system_alert",
              title: `⚠️ Discovery Scan Failed (${pendingDiscoveryRun.country})`,
              message: `Discovery run ended with status: ${outcome.status}. Reason: ${outcome.failureReason || outcome.outcomeDetails || "Scan error"}.`,
              severity: "warning",
              actionUrl: `/discovery?country=${encodeURIComponent(pendingDiscoveryRun.country)}`,
            });
          } catch {}
        }
        ranJobs++;
        continue;
      }
      // 1. Check backoff / pause status
      const backoff = await checkBackoffStatus();
      if (backoff.inBackoff) {
        console.log(`[Worker Paused] ${backoff.reason}`);
        if (Date.now() - lastBackoffNotifiedAt > 30 * 60 * 1000) {
          lastBackoffNotifiedAt = Date.now();
          try {
            const { createNotification } = await import("../lib/notifications");
            await createNotification({
              type: "system_alert",
              title: "⏸️ Scraper Backoff Active",
              message: backoff.reason || "Worker paused temporarily due to rate detection.",
              severity: "warning",
            });
          } catch {}
        }
        if (isSingleRun) {
          console.log("[Single Run] Worker paused due to backoff. Exiting.");
          await emitSessionSummary();
          process.exit(0);
        }
        await randomDelay(15000, 30000);
        continue;
      }

      // 2. Check hourly / daily scan caps
      const caps = await checkRateCaps();
      if (!caps.allowed) {
        console.log(`[Rate Limit] ${caps.reason}`);
        if (Date.now() - lastRateCapNotifiedAt > 60 * 60 * 1000) {
          lastRateCapNotifiedAt = Date.now();
          try {
            const { createNotification } = await import("../lib/notifications");
            await createNotification({
              type: "system_alert",
              title: "🛑 Daily / Hourly Scan Cap Reached",
              message: caps.reason || "Worker reached safety limits. Scanning will resume in next window.",
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
        // Multi-shard coordination grace period: If this shard just booted (ranJobs === 0)
        // in a multi-shard environment, wait for the coordinator to finish enqueuing before exiting.
        if (isMultiShard && ranJobs === 0 && emptyQueueStartupRetries < MAX_STARTUP_EMPTY_RETRIES) {
          emptyQueueStartupRetries++;
          console.log(
            `[Queue Warmup] Waiting for coordinator to populate queue... (attempt ${emptyQueueStartupRetries}/${MAX_STARTUP_EMPTY_RETRIES})`
          );
          await randomDelay(3000, 4000);
          continue;
        }

        console.log(`[Queue Empty] All pending jobs completed. Worker idling (${ranJobs} processed).`);
        await emitSessionSummary();

        // Automatic Fallback: rescue any failed/incomplete product scrapings locally via residential IP & browser
        try {
          const { rescueFailedProductsBatch } = await import("./product-rescue");
          await rescueFailedProductsBatch(3);
        } catch (rescueErr: any) {
          console.warn("[Local Rescue] Background rescue cycle warning:", rescueErr?.message);
        }

        // Jev Frequency Sweep: Periodically reclassify General Merchandise & Resolve 0 DT prices
        const now = Date.now();
        if (now - lastJevSweepAt >= JEV_SWEEP_FREQUENCY_MS) {
          lastJevSweepAt = now;
          try {
            const { runJevMaintenanceSweep } = await import("./jev-maintenance");
            const jevStats = await runJevMaintenanceSweep();
            if (jevStats.reclassified > 0 || jevStats.pricesResolved > 0) {
              console.log(
                `[Jev Frequency Sweep] 🚀 Reclassified ${jevStats.reclassified} products, Resolved ${jevStats.pricesResolved} prices.`
              );
            }
          } catch (jevErr: any) {
            console.warn("[Jev Frequency Sweep] Notice:", jevErr?.message);
          }
        }

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

      // Acquire distributed scrape lock to synchronize with cloud workers
      let lockKey: string | null = null;
      if (trackedPage) {
        lockKey = `lock:scrape:${trackedPage.id}`;
        const acquired = await acquireLock(lockKey, 180);
        if (!acquired) {
          console.log(
            `[Worker] 🔒 Page "${targetDisplayName}" is already locked by cloud or another worker. Skipping duplicate scrape.`
          );
          if (queueJob.id) {
            await db
              .update(queue)
              .set({ status: "completed", finishedAt: new Date() })
              .where(eq(queue.id, queueJob.id))
              .catch(() => {});
          }
          continue;
        }
      }

      try {
        // 4. Route job by type
        const { page } = await getBrowserSession();

      if (jobType === "discovery_count" && discoveredPage) {
        // Run Discovery Page Verification count scan using the page's selected country
        const selectedCountry = discoveredPage.country || "TN";
        const discoveryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${selectedCountry}&view_all_page_id=${discoveredPage.pageId}&search_type=page&media_type=all`;
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
        // Run Ad Spy GraphQL & DOM extraction
        const outcome = await scanAdCreatives(
          page,
          trackedPage.id,
          trackedPage.url,
          creativeScan.id,
          "ALL"
        );
        const pageIdsFound = (outcome.extractedPageIds || []).filter(isValidPageId);

        // Multi-page candidate detection is logged via multi-page notification and reviewed in Candidate Modal

        // Case A: Exactly 1 Page ID found -> Auto-merge exact match entry into official Page ID record
        if (pageIdsFound.length === 1 && trackedPage.searchType !== "page") {
          const singlePageId = pageIdsFound[0];
          console.log(
            `[Auto-Merge] Exact match page "${targetDisplayName}" resolved to single Meta Page ID "${singlePageId}". Merging records and queueing Page ID creative scan...`
          );
          const mergeRes = await mergeExactMatchWithPageId(trackedPage.id, singlePageId);
          const finalPageId = mergeRes.mergedPageId || trackedPage.id;

          const { logPageMergedNotification } = await import("../lib/notifications");
          await logPageMergedNotification({
            trackedPageId: finalPageId,
            originalName: trackedPage.displayName || trackedPage.url,
            resolvedPageName: `Page ${singlePageId}`,
            resolvedPageId: singlePageId,
          }).catch(() => {});

          if (mergeRes.mergedPageId) {
            await enqueueOrEscalateJob(mergeRes.mergedPageId, "creative", 10);
            await markCreativeJobCompleted(
              queueJob.id,
              creativeScan.id,
              0,
              "completed"
            );
            await recordSuccessfulScan();
            await handleSuccess();
            ranJobs++;
            continue;
          }
        } else if (pageIdsFound.length > 1) {
          console.log(
            `[Discovered Pages] Keyword search target "${targetDisplayName}" revealed ${pageIdsFound.length} unique Facebook Page IDs (${pageIdsFound.join(", ")}). Saved to Discovered Pages for user review.`
          );
          const { logMultiPageDetectedNotification } = await import("../lib/notifications");
          await logMultiPageDetectedNotification({
            trackedPageId: trackedPage.id,
            domainName: trackedPage.displayName || trackedPage.url,
            candidatePages: pageIdsFound.map((pid) => ({ pageId: pid })),
          }).catch(() => {});
        }

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

          // Invalidate Upstash cache for workspace so UI reflects fresh creatives
          if (trackedPage.workspaceId) {
            Promise.allSettled([
              deleteCached(`cache:stats:${trackedPage.workspaceId}`),
              deleteByPrefix(`cache:pages:${trackedPage.workspaceId}:`),
              deleteByPrefix(`cache:products:${trackedPage.workspaceId}:`),
              deleteByPrefix(`cache:fresh_winners:${trackedPage.workspaceId}:`),
              deleteByPrefix(`cache:spy_ads:${trackedPage.workspaceId}:`),
            ]).catch(() => {});
          }
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
        const outcome = await scanMetaAdPage(page, trackedPage.url, undefined, {
          previousCount: trackedPage.currentResults,
          brandName: trackedPage.displayName,
        });

        if (outcome.status === "success" || outcome.status === "unclear") {
          console.log(
            `[Count Success] Status: ${outcome.status} | Results: ${outcome.results ?? "N/A"}`
          );
          const res = await markJobCompleted(
            queueJob.id,
            trackedPage.id,
            outcome.results,
            outcome.status,
            { failureReason: outcome.failureReason, page }
          );

          if (res?.circuitBreakerTripped) {
            console.warn(
              "[Worker] 🛑 Circuit Breaker tripped during count scan. Halting scanning batch to protect data integrity."
            );
            if (isSingleRun) {
              console.log("[Single Run] Circuit Breaker tripped. Exiting worker cleanly.");
              await emitSessionSummary();
              process.exit(0);
            }
            continue;
          }

          sessionScanned++;
          if (res && res.difference && res.difference > 0) {
            sessionMovers.push({
              name: res.brandName || trackedPage.displayName || "Brand",
              diff: res.difference,
              currentResults: res.results || 0,
              trackedPageId: trackedPage.id,
              pageId: trackedPage.pageId || undefined,
            });
          }

          // 4c. Auto-Resolve / Auto-Merge Exact Match Search Targets during Local Count Scan
          if (trackedPage.searchType !== "page" || !trackedPage.pageId) {
            try {
              const { extractPageIdsFromPage } = await import("./dom-scanner");
              const rawCandidates = await extractPageIdsFromPage(page);
              const pageCandidates = rawCandidates.filter((c) => isValidPageId(c.pageId));

              if (pageCandidates.length === 1) {
                const single = pageCandidates[0];
                console.log(
                  `[Local Count Auto-Merge] Exact match page "${targetDisplayName}" resolved to Meta Page ID "${single.pageId}" (${single.pageName || "Verified Brand"}). Auto-upgrading...`
                );
                const mergeRes = await mergeExactMatchWithPageId(
                  trackedPage.id,
                  single.pageId,
                  single.pageName
                );

                const finalPageId = mergeRes.mergedPageId || trackedPage.id;
                const { logPageMergedNotification } = await import("../lib/notifications");
                await logPageMergedNotification({
                  trackedPageId: finalPageId,
                  originalName: trackedPage.displayName || trackedPage.url,
                  resolvedPageName: single.pageName || `Page ${single.pageId}`,
                  resolvedPageId: single.pageId,
                });

                // Immediately schedule creative scan workflow for the newly resolved brand page
                await enqueueOrEscalateJob(finalPageId, "creative", 10);
              } else if (pageCandidates.length > 1) {
                console.log(
                  `[Local Multi-Page Conflict] Detected ${pageCandidates.length} candidate Facebook Pages for "${targetDisplayName}". Posting notification for user review.`
                );
                await db
                  .update(trackedPages)
                  .set({ discoveredPagesCount: pageCandidates.length })
                  .where(eq(trackedPages.id, trackedPage.id));

                const { logMultiPageDetectedNotification } = await import("../lib/notifications");
                await logMultiPageDetectedNotification({
                  trackedPageId: trackedPage.id,
                  domainName: trackedPage.displayName || trackedPage.url,
                  candidatePages: pageCandidates.map((c) => ({
                    pageId: c.pageId,
                    pageName: c.pageName,
                    adCount: outcome.results || 0,
                  })),
                });
              }
            } catch (err) {
              console.warn("[Local Count Page Extraction] Non-fatal error resolving Page ID:", err);
            }
          }

          await recordSuccessfulScan();
          await handleSuccess();

          // Invalidate Upstash cache for workspace so UI reflects fresh counts
          if (trackedPage.workspaceId) {
            Promise.allSettled([
              deleteCached(`cache:stats:${trackedPage.workspaceId}`),
              deleteByPrefix(`cache:pages:${trackedPage.workspaceId}:`),
              deleteByPrefix(`cache:products:${trackedPage.workspaceId}:`),
              deleteByPrefix(`cache:fresh_winners:${trackedPage.workspaceId}:`),
              deleteByPrefix(`cache:spy_ads:${trackedPage.workspaceId}:`),
            ]).catch(() => {});
          }
        } else {
          console.warn(
            `[Count Failed] Reason: ${outcome.failureReason}`
          );
          sessionScanned++;
          sessionErrors++;
          await markJobFailed(
            queueJob.id,
            trackedPage.id,
            outcome.failureReason || "navigation_error"
          );
          await handleFailure();
        }
      }
    } finally {
      if (lockKey) {
        await releaseLock(lockKey).catch(() => {});
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
  } catch (err: any) {
    console.error("Worker process fatal error:", err);
    try {
      const { createNotification } = await import("../lib/notifications");
      await createNotification({
        type: "system_alert",
        title: "🚨 Worker Process Stopped",
        message: `Worker encountered an unexpected error: ${err?.message || "Unknown error"}. Restarting worker is recommended.`,
        severity: "error",
      });
    } catch {}
  } finally {
    await closeBrowserSession();
  }
}

// Global Process Exception Handlers
process.on("uncaughtException", async (err) => {
  console.error("Worker fatal uncaughtException:", err);
  try {
    const { createNotification } = await import("../lib/notifications");
    await createNotification({
      type: "system_alert",
      title: "🚨 Worker Crash (Uncaught Exception)",
      message: `Fatal error: ${err?.message || "Unknown exception"}. Worker is halting.`,
      severity: "error",
    });
  } catch {}
  await resetStuckJobs().catch(() => {});
  await closeBrowserSession().catch(() => {});
  process.exit(1);
});

process.on("unhandledRejection", async (reason: any) => {
  console.error("Worker unhandledRejection:", reason);
  try {
    const { createNotification } = await import("../lib/notifications");
    await createNotification({
      type: "system_alert",
      title: "⚠️ Worker Unhandled Rejection",
      message: `Asynchronous error: ${reason?.message || String(reason) || "Unknown promise rejection"}.`,
      severity: "warning",
    });
  } catch {}
});

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

