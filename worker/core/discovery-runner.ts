import { db } from "../../db";
import { discoveryRuns, discoveredPages } from "../../db/schema";
import { eq, desc } from "drizzle-orm";
import { getBrowserSession, closeBrowserSession } from "../browser";
import { runDiscoveryScan } from "../scanners/discovery-crawler";
import { recordSuccessfulScan, randomDelay } from "../throttle";
import { handleFailure, handleSuccess } from "../backoff";

export async function executeDiscoveryRun(pendingDiscoveryRun: any) {
  console.log(
    `\n[Processing DISCOVERY Job] ID: ${pendingDiscoveryRun.id} | Country: ${pendingDiscoveryRun.country}`
  );
  const discoveryStartTime = Date.now();
  let outcome: any;
  try {
    const { page } = await getBrowserSession();
    outcome = await runDiscoveryScan(
      page,
      pendingDiscoveryRun.id,
      pendingDiscoveryRun.searchUrl,
      pendingDiscoveryRun.country,
      {
        targetMaxAds: pendingDiscoveryRun.targetMaxAds,
        maxScrolls: pendingDiscoveryRun.maxScrolls,
        initialOutcomeDetails: pendingDiscoveryRun.outcomeDetails,
      }
    );
  } catch (scanErr: any) {
    console.error(`[Worker] Unhandled error during discovery scan ${pendingDiscoveryRun.id}:`, scanErr);
    const seqMatch = pendingDiscoveryRun.outcomeDetails?.match(/Sequence \d+\/\d+ · Batch [a-zA-Z0-9_-]+/i);
    const seqPrefix = seqMatch ? `${seqMatch[0]} — ` : "";
    const errorMsg = scanErr?.message || "Browser launch or worker failure";
    outcome = {
      status: "failed",
      totalAdsScanned: 0,
      totalPagesDiscovered: 0,
      failureReason: "timeout",
      outcomeDetails: `${seqPrefix}${errorMsg}`,
    };

    await db
      .update(discoveryRuns)
      .set({
        status: "failed",
        failureReason: "timeout",
        outcomeDetails: outcome.outcomeDetails,
        finishedAt: new Date(),
      })
      .where(eq(discoveryRuns.id, pendingDiscoveryRun.id))
      .catch((dbErr) => console.error("[Worker] Failed to update discovery run status to failed in DB:", dbErr));
  } finally {
    console.log(`[Worker] 🧹 Tearing down Chromium browser to reclaim 100% RAM memory after Discovery Run...`);
    await closeBrowserSession().catch((e) => console.warn("[Worker] Error closing browser session:", e?.message));
    if (typeof (global as any).gc === "function") {
      try {
        (global as any).gc();
      } catch {}
    }
  }

  console.log(
    `[Discovery Finished] Status: ${outcome.status} | Discovered: ${outcome.totalPagesDiscovered} pages from ${outcome.totalAdsScanned} ads`
  );
  if (outcome.status === "completed" || outcome.status === "partial") {
    await recordSuccessfulScan();
    await handleSuccess();

    try {
      const topPages = await db.query.discoveredPages.findMany({
        where: eq(discoveredPages.runId, pendingDiscoveryRun.id),
        orderBy: [desc(discoveredPages.matchingAdCount)],
        limit: 5,
      });

      const { logDiscoverySummaryNotification } = await import("../../lib/notifications");
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
      const { createNotification } = await import("../../lib/notifications");
      await createNotification({
        type: "system_alert",
        title: `Discovery Check Incomplete (${pendingDiscoveryRun.country})`,
        message: `Could not complete scan for ${pendingDiscoveryRun.country}. Will retry automatically.`,
        severity: "warning",
        actionUrl: `/discovery?country=${encodeURIComponent(pendingDiscoveryRun.country)}`,
      });
    } catch {}
  }

  const rawCooldown = parseInt(process.env.DISCOVERY_INTER_RUN_COOLDOWN_MS || "20000", 10);
  const cooldownMs = Number.isFinite(rawCooldown)
    ? Math.max(5000, Math.min(rawCooldown, 120000))
    : 20000;
  console.log(`[Discovery Cooldown] Resting ${Math.round(cooldownMs / 1000)}s before next discovery sequence...`);
  await randomDelay(cooldownMs, cooldownMs + 2000);
}

