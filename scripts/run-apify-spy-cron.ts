import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { trackedPages, creativeScans, scanHistory, appSettings } from "../db/schema";
import { eq, sql, desc, asc } from "drizzle-orm";
import {
  getApifyTokens,
  startApifyDeltaScan,
  fetchApifyDatasetItems,
  getApifyAccountBalance,
  ensureMostRecentSortingUrl,
} from "../lib/apify";
import { getApifyRunStatus } from "../lib/apify-sync";
import { ingestApifyDatasetItems } from "../lib/apify-ingest";

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface CronOptions {
  maxPages: number;
  forceAll: boolean;
  pageId?: string;
  maxWaitPerRunSeconds: number;
}

function parseCliArgs(): CronOptions {
  const args = process.argv.slice(2);
  const options: CronOptions = {
    maxPages: parseInt(process.env.SPY_MAX_PAGES_PER_RUN || "25", 10),
    forceAll: process.env.SPY_FORCE_ALL === "true",
    maxWaitPerRunSeconds: parseInt(process.env.APIFY_RUN_TIMEOUT_SECONDS || "300", 10), // 5 min default
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--max-pages" && args[i + 1]) {
      options.maxPages = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--force-all") {
      options.forceAll = true;
    } else if (arg === "--page-id" && args[i + 1]) {
      options.pageId = args[i + 1];
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Meta Ad Tracker — Apify Ad Spy Smart Delta Runner

Usage:
  npx tsx scripts/run-apify-spy-cron.ts [options]

Options:
  --max-pages <N>       Maximum eligible pages to scan in this run (default: 25)
  --force-all           Force-scan all pages with active ads (bypasses +1 diff requirement)
  --page-id <ID>        Target a specific tracked page ID
  --help, -h            Show this help message
      `);
      process.exit(0);
    }
  }

  return options;
}

async function pollAndIngestApifyRun(
  scanId: string,
  runId: string,
  defaultDatasetId: string | undefined,
  maxWaitSeconds: number
): Promise<{ success: boolean; extractedCount: number; newProductsCount: number; error?: string }> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;
  let resolvedDatasetId = defaultDatasetId;

  while (Date.now() - startTime < maxWaitMs) {
    const details = await getApifyRunStatus(runId);
    if (!details) {
      console.log(`[Apify Poller] Waiting for run status (Run ID: ${runId})...`);
      await sleep(6000);
      continue;
    }

    resolvedDatasetId = details.defaultDatasetId || resolvedDatasetId;
    const status = details.status;

    if (status === "SUCCEEDED") {
      if (!resolvedDatasetId) {
        return { success: false, extractedCount: 0, newProductsCount: 0, error: "Run succeeded but no dataset ID found" };
      }
      console.log(`✅ [Apify Succeeded] Fetching dataset items for Dataset: ${resolvedDatasetId}...`);
      const items = await fetchApifyDatasetItems(resolvedDatasetId);
      console.log(`📦 [Apify Ingest] Received ${items.length} raw item(s). Ingesting to DB...`);
      const ingestResult = await ingestApifyDatasetItems(scanId, items);
      return {
        success: true,
        extractedCount: ingestResult.extractedCount,
        newProductsCount: ingestResult.newProductsCount || 0,
      };
    }

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      await db
        .update(creativeScans)
        .set({
          status: "failed",
          failureReason: `apify_${status.toLowerCase()}`,
          outcomeDetails: `Apify run ended with status: ${status}`,
          finishedAt: new Date(),
        })
        .where(eq(creativeScans.id, scanId));
      return { success: false, extractedCount: 0, newProductsCount: 0, error: `Apify run status: ${status}` };
    }

    console.log(`⏳ [Apify Poller] Status: ${status} (elapsed: ${Math.round((Date.now() - startTime) / 1000)}s)...`);
    await sleep(7000);
  }

  // Timed out waiting
  await db
    .update(creativeScans)
    .set({
      status: "failed",
      failureReason: "timeout",
      outcomeDetails: `Timed out waiting for Apify run after ${maxWaitSeconds}s`,
      finishedAt: new Date(),
    })
    .where(eq(creativeScans.id, scanId));

  return { success: false, extractedCount: 0, newProductsCount: 0, error: `Timed out waiting for Apify run after ${maxWaitSeconds}s` };
}

interface TargetScanPlan {
  page: any;
  reason: string;
  delta: number;
  isFullScan: boolean;
}

async function main() {
  const options = parseCliArgs();

  // Load dynamic app settings from DB
  const dbSettings = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, "default"),
  }).catch(() => null);
  const autoSpyThreshold = Math.max(2, dbSettings?.autoSpyThreshold ?? 5);

  console.log("=================================================");
  console.log(" 🚀 Meta Ad Tracker — Apify Cloud Spy Worker   ");
  console.log("=================================================");
  console.log(`Mode: ${options.forceAll ? "⚡ FORCE ALL ACTIVE PAGES" : `🎯 SMART +${autoSpyThreshold} DIFFERENCE ONLY`} | Max Pages: ${options.maxPages}`);

  // 1. Verify Apify API Tokens
  const tokens = getApifyTokens();
  if (tokens.length === 0) {
    console.error("❌ ERROR: No APIFY_API_TOKEN or APIFY_API_TOKENS configured in environment.");
    console.error("Please add APIFY_API_TOKEN to your .env.local or GitHub repository secrets.");
    process.exit(1);
  }

  console.log(`🔑 Configured Apify Tokens: ${tokens.length} available.`);
  const balanceInfo = await getApifyAccountBalance().catch(() => null);
  if (balanceInfo) {
    console.log(`💳 Active Token Balance: $${balanceInfo.remainingUsd.toFixed(2)} remaining / $${balanceInfo.maxMonthlyUsageUsd.toFixed(2)} limit (${balanceInfo.usagePercent.toFixed(1)}% used)`);
  }

  // 2. Fetch Active Scans to prevent concurrency collision
  const activeScans = await db.query.creativeScans.findMany({
    where: eq(creativeScans.status, "running"),
    columns: { trackedPageId: true, createdAt: true },
  });
  // Exclude scans older than 30 mins (stuck/orphaned)
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
  const activePageIds = new Set(
    activeScans
      .filter((s) => s.createdAt && s.createdAt > thirtyMinsAgo)
      .map((s) => s.trackedPageId)
  );

  // 3. Query All Tracked Pages and evaluate exact +1 difference eligibility
  let candidatePages = await db.query.trackedPages.findMany({
    where: options.pageId ? eq(trackedPages.id, options.pageId) : undefined,
    orderBy: [asc(trackedPages.createdAt)],
  });

  const eligiblePlans: TargetScanPlan[] = [];
  let skippedUpToDateCount = 0;
  let skippedNoDiffCount = 0;

  for (const page of candidatePages) {
    if (activePageIds.has(page.id)) {
      console.log(`[Skip] "${page.displayName || page.id}": creative scan already in progress.`);
      continue;
    }

    const isPageTarget = Boolean(
      page.searchType === "page" ||
      (page.pageId && page.pageId !== "0" && !page.pageId.includes(" "))
    );

    // If targeted by page-id or force-all:
    if (options.pageId || options.forceAll) {
      if ((page.currentResults || 0) < 1 && !isPageTarget) continue;
      const isFirstTime = !page.lastCreativeScan;
      const delta = isFirstTime || isPageTarget
        ? Math.max(15, Math.min(100, page.currentResults || 30))
        : 20;
      eligiblePlans.push({
        page,
        reason: options.forceAll ? "Forced refresh" : "Targeted page-id scan",
        delta,
        isFullScan: isFirstTime || isPageTarget,
      });
      continue;
    }

    // Standard Smart Delta Rule:
    const isFirstTime = !page.lastCreativeScan;

    // Rule 1: Brand new page (never scanned before) with active ads
    if (isFirstTime) {
      if ((page.currentResults || 0) >= 1 || isPageTarget) {
        const delta = Math.max(15, Math.min(100, page.currentResults || 30));
        eligiblePlans.push({
          page,
          reason: `Initial catalog scan (never scanned, active ads: ${page.currentResults ?? "N/A"})`,
          delta,
          isFullScan: true,
        });
      }
      continue;
    }

    // Rule 2: Check latest count scan history for difference >= autoSpyThreshold OR total results >= 50 (Mega-Brand)
    const latestHistory = await db.query.scanHistory.findFirst({
      where: eq(scanHistory.trackedPageId, page.id),
      orderBy: [desc(scanHistory.checkedAt)],
    });

    const diff = latestHistory?.difference || 0;
    const isMegaBrand = (page.currentResults || 0) >= 50 && diff >= 1;

    if (!latestHistory || (!isMegaBrand && diff < autoSpyThreshold)) {
      skippedNoDiffCount++;
      continue;
    }

    const checkedAt = latestHistory.checkedAt ? new Date(latestHistory.checkedAt) : new Date();

    // Check if we ALREADY scanned this difference
    if (page.lastCreativeScan && page.lastCreativeScan >= checkedAt) {
      skippedUpToDateCount++;
      continue;
    }

    // ELIGIBLE: New ads detected and not yet scanned!
    const lastScanTimeStr = page.lastCreativeScan ? page.lastCreativeScan.toLocaleTimeString() : "Never";
    eligiblePlans.push({
      page,
      reason: `+${diff} new ad(s) detected (Diff logged at ${checkedAt.toLocaleTimeString()}, Last spy scan: ${lastScanTimeStr})`,
      delta: diff,
      isFullScan: false, // Delta scan only (does not archive active catalog)
    });
  }

  if (eligiblePlans.length === 0) {
    console.log("\n✨ No pages have newly detected ad increases (+1 diff). Everything is up to date!");
    console.log(`(Checked ${candidatePages.length} pages | ${skippedUpToDateCount} already synced | ${skippedNoDiffCount} had 0 diff)`);
    process.exit(0);
  }

  // Sort eligible plans: Highest delta first, then oldest lastCreativeScan
  eligiblePlans.sort((a, b) => {
    if (b.delta !== a.delta) return b.delta - a.delta;
    const aTime = a.page.lastCreativeScan ? a.page.lastCreativeScan.getTime() : 0;
    const bTime = b.page.lastCreativeScan ? b.page.lastCreativeScan.getTime() : 0;
    return aTime - bTime;
  });

  const selectedPlans = eligiblePlans.slice(0, options.maxPages);
  const deferredCount = eligiblePlans.length - selectedPlans.length;

  console.log(`\n📋 Found ${eligiblePlans.length} page(s) needing Apify Ad Spy creative sync:`);
  console.log(`Processing top ${selectedPlans.length} pages (Cap: ${options.maxPages}${deferredCount > 0 ? `, ${deferredCount} deferred` : ""}):\n`);

  selectedPlans.forEach((plan, idx) => {
    const p = plan.page;
    console.log(`  ${idx + 1}. "${p.displayName || p.pageId || p.id}"`);
    console.log(`     ↳ Action: ${plan.isFullScan ? "Full Catalog Scan" : `Delta Scan (+${plan.delta} ads)`}`);
    console.log(`     ↳ Trigger: ${plan.reason}`);
  });

  // 4. Process each page sequentially with Apify
  let successCount = 0;
  let totalAdsIngested = 0;
  let totalProductsIngested = 0;
  let failedCount = 0;
  const movers: Array<{
    name: string;
    extractedCount: number;
    newProductsCount?: number;
    currentResults?: number;
    trackedPageId: string;
    pageId?: string;
  }> = [];

  for (let i = 0; i < selectedPlans.length; i++) {
    const { page, delta, isFullScan } = selectedPlans[i];
    const pageName = page.displayName || page.pageId || page.id;
    
    // Ensure URL has Most Recent sorting: &sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc
    const sortedUrl = ensureMostRecentSortingUrl(page.url);

    console.log(`\n-------------------------------------------------`);
    console.log(`[${i + 1}/${selectedPlans.length}] Launching Apify Cloud Scan for: "${pageName}"`);
    console.log(`Type: ${isFullScan ? "Full Catalog Scan" : `Delta Scan (+${delta} ads)`}`);
    console.log(`Target URL (Most Recent): ${sortedUrl}`);

    const configObj = {
      runner: "apify",
      delta,
      maxResults: delta + Math.max(3, Math.ceil(delta * 0.2)),
      isFullScan,
      isDeltaScan: !isFullScan,
      sorting: "relevancy_monthly_grouped",
    };

    // Insert creative_scans record
    const [newScan] = await db
      .insert(creativeScans)
      .values({
        trackedPageId: page.id,
        status: "running",
        startedAt: new Date(),
        configSnapshot: JSON.stringify(configObj),
        outcomeDetails: `Apify Cloud ${isFullScan ? "Full" : "Delta"} Scan launched (Limit: ${delta} ads, Most Recent Sorting)`,
      })
      .returning();

    // Mark tracked page status as scanning for real-time UI visibility
    await db
      .update(trackedPages)
      .set({ status: "scanning", updatedAt: new Date() })
      .where(eq(trackedPages.id, page.id));

    try {
      // Launch Apify Actor run
      const runRes = await startApifyDeltaScan({
        pageUrl: sortedUrl,
        delta,
        creativeScanId: newScan.id,
      });

      if (!runRes?.id) {
        throw new Error("Failed to get Apify run ID from start response.");
      }

      console.log(`⚡ [Apify Started] Run ID: ${runRes.id} | Dataset: ${runRes.defaultDatasetId || "N/A"}`);

      // Update scan with run identifiers
      await db
        .update(creativeScans)
        .set({
          configSnapshot: JSON.stringify({
            ...configObj,
            apifyRunId: runRes.id,
            defaultDatasetId: runRes.defaultDatasetId,
          }),
        })
        .where(eq(creativeScans.id, newScan.id));

      // Poll until finished & ingest
      const pollResult = await pollAndIngestApifyRun(
        newScan.id,
        runRes.id,
        runRes.defaultDatasetId,
        options.maxWaitPerRunSeconds
      );

      if (pollResult.success) {
        console.log(`🎉 Successfully ingested ${pollResult.extractedCount} ad(s) and ${pollResult.newProductsCount} product(s) for "${pageName}".`);
        successCount++;
        totalAdsIngested += pollResult.extractedCount;
        totalProductsIngested += pollResult.newProductsCount || 0;
        if (pollResult.extractedCount > 0 || (pollResult.newProductsCount && pollResult.newProductsCount > 0)) {
          movers.push({
            name: pageName,
            extractedCount: pollResult.extractedCount,
            newProductsCount: pollResult.newProductsCount || 0,
            currentResults: page.currentResults || 0,
            trackedPageId: page.id,
            pageId: page.pageId || undefined,
          });
        }
      } else {
        console.warn(`⚠️ Scan for "${pageName}" failed: ${pollResult.error}`);
        await db
          .update(trackedPages)
          .set({
            status: page.lastSuccessAt || page.currentResults !== null ? "success" : "failed",
            updatedAt: new Date(),
          })
          .where(eq(trackedPages.id, page.id));
        failedCount++;
      }
    } catch (err: any) {
      console.error(`❌ Error launching/processing Apify scan for "${pageName}":`, err.message || err);
      await db
        .update(creativeScans)
        .set({
          status: "failed",
          failureReason: "apify_error",
          outcomeDetails: err?.message || "Apify invocation error",
          finishedAt: new Date(),
        })
        .where(eq(creativeScans.id, newScan.id));

      await db
        .update(trackedPages)
        .set({
          status: page.lastSuccessAt || page.currentResults !== null ? "success" : "failed",
          updatedAt: new Date(),
        })
        .where(eq(trackedPages.id, page.id));
      failedCount++;
    }

    // Short polite pause between pages
    if (i < selectedPlans.length - 1) {
      console.log(`Sleeping 3s before next page...`);
      await sleep(3000);
    }
  }

  // 5. Emit single consolidated Batch Summary notification
  if (selectedPlans.length > 0) {
    try {
      const { logBatchSummaryNotification } = await import("../lib/notifications");
      await logBatchSummaryNotification({
        runnerType: "apify_spy",
        totalScanned: selectedPlans.length,
        newAdsCount: totalAdsIngested,
        newProductsCount: totalProductsIngested,
        movers,
        unchangedCount: selectedPlans.length - movers.length - failedCount,
        failedCount,
        actionUrl: "/spy?sortBy=started_running_on&sortOrder=desc",
      });
    } catch (err) {
      console.error("Failed to log batch summary notification:", err);
    }
  }

  console.log("\n=================================================");
  console.log(" 📊 Apify Spy Batch Run Summary                 ");
  console.log("=================================================");
  console.log(`Total Eligible Pages Processed : ${selectedPlans.length}`);
  console.log(`Successful Scans               : ${successCount}`);
  console.log(`Failed Scans                   : ${failedCount}`);
  console.log(`Total Ad Creatives Ingested    : ${totalAdsIngested}`);
  console.log(`Total Product Pages Ingested   : ${totalProductsIngested}`);
  console.log("=================================================\n");

  process.exit(failedCount > 0 && successCount === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error running Apify spy cron:", err);
  process.exit(1);
});
