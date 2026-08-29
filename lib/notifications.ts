import { db } from "@/db";
import { activityNotifications } from "@/db/schema";
import { eq, desc, and, inArray, gte } from "drizzle-orm";

export type NotificationType =
  | "count_scan"
  | "ad_spy"
  | "page_merged"
  | "multi_page_detected"
  | "batch_summary"
  | "system_alert";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  trackedPageId?: string | null;
  adArchiveId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Creates a persistent in-app notification record.
 * Deduplicates identical notifications created within the last 5 minutes.
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    // Deduplication window: 6 hours for queued local scan notifications to avoid repeat spam, 5 minutes for general notifications
    const dedupWindowMs = params.metadata?.queuedForLocalScan ? 6 * 60 * 60 * 1000 : 5 * 60 * 1000;
    const windowStart = new Date(Date.now() - dedupWindowMs);
    const conditions = [
      eq(activityNotifications.type, params.type),
      eq(activityNotifications.title, params.title),
      gte(activityNotifications.createdAt, windowStart),
    ];

    if (params.trackedPageId) {
      conditions.push(eq(activityNotifications.trackedPageId, params.trackedPageId));
    }

    const existing = await db.query.activityNotifications.findFirst({
      where: and(...conditions),
      orderBy: [desc(activityNotifications.createdAt)],
    });

    if (existing) {
      return existing;
    }

    const [record] = await db
      .insert(activityNotifications)
      .values({
        type: params.type,
        title: params.title,
        message: params.message,
        severity: params.severity || "info",
        trackedPageId: params.trackedPageId || null,
        adArchiveId: params.adArchiveId || null,
        actionUrl: params.actionUrl || null,
        metadata: params.metadata || null,
        isRead: false,
        createdAt: new Date(),
      })
      .returning();

    // Auto-prune old notifications in background to keep table lightweight
    pruneOldNotifications(120).catch(() => {});

    return record;
  } catch (error) {
    console.error("[Notification] Failed to create notification:", error);
    return null;
  }
}

/**
 * Convenience helper to log Count Scan activities.
 * SMART FILTER: Silences routine 'no-change' scans (difference = 0) and minor 1-2 ad churn to avoid spam.
 * Logs high-signal events: positive differences (+new ads), scaling surges (+5+), zero-ad drops ("Brand Went Dark"), notice drops (<= -3), or errors.
 */
export async function logCountScanNotification(params: {
  trackedPageId: string;
  brandName: string;
  currentResults: number | null;
  difference: number | null;
  status: "success" | "failed" | "unclear";
}) {
  const { trackedPageId, brandName, currentResults, difference, status } = params;

  // 1. Log errors or unclear navigation warnings
  if (status !== "success") {
    return createNotification({
      type: "count_scan",
      title: "Count Scan Warning",
      message: `Count check for "${brandName}" finished with status: ${status}.`,
      severity: "warning",
      trackedPageId,
      actionUrl: `/?search=${encodeURIComponent(brandName)}`,
      metadata: { currentResults, difference, status },
    });
  }

  const diffNum = difference || 0;
  const isMegaBrand = currentResults !== null && currentResults >= 50;

  // 2. High-Urgency: Brand completely shut off all ads (Active Ads -> 0)
  if (currentResults === 0 && diffNum < 0) {
    return createNotification({
      type: "count_scan",
      title: `🚨 Brand Went Dark: ${brandName}`,
      message: `"${brandName}" paused all active ads (${Math.abs(diffNum)} ads turned off, 0 active ads remaining).`,
      severity: "warning",
      trackedPageId,
      actionUrl: `/spy?trackedPageId=${trackedPageId}`,
      metadata: { currentResults: 0, difference: diffNum, brandName, wentDark: true },
    });
  }

  // 3a. Mega-Brand High-Priority: 50+ active ads running with positive changes
  if (isMegaBrand && diffNum > 0) {
    return createNotification({
      type: "count_scan",
      title: `👑 Mega-Brand: ${brandName} (+${diffNum} Ads | ${currentResults} Total)`,
      message: `"${brandName}" is running a massive catalog of ${currentResults} active ads (+${diffNum} new). High-priority Apify cloud scan auto-triggered.`,
      severity: "success",
      trackedPageId,
      actionUrl: `/spy?trackedPageId=${trackedPageId}`,
      metadata: { currentResults, difference: diffNum, brandName, isMegaBrand: true, isSurge: diffNum >= 5, highPriority: true },
    });
  }

  // 3b. High-Signal: Scaling Surge (5 or more new ads launched at once)
  if (diffNum >= 5) {
    return createNotification({
      type: "count_scan",
      title: `🚀 Ad Scaling Surge: +${diffNum} Ads on ${brandName}!`,
      message: `"${brandName}" aggressively launched +${diffNum} new ad creatives! Total active ads: ${currentResults ?? 0}. Apify cloud scan auto-triggered.`,
      severity: "success",
      trackedPageId,
      actionUrl: `/spy?trackedPageId=${trackedPageId}`,
      metadata: { currentResults, difference: diffNum, brandName, isSurge: true, highPriority: true },
    });
  }

  // 4. Positive difference (+new ads launched, minor churn < 5 on small/medium page)
  if (diffNum > 0) {
    return createNotification({
      type: "count_scan",
      title: `+${diffNum} New Ads on ${brandName}`,
      message: `"${brandName}" launched +${diffNum} new ad(s). Queued for free local scan ($0 credits).`,
      severity: "info",
      trackedPageId,
      actionUrl: `/spy?trackedPageId=${trackedPageId}`,
      metadata: { currentResults, difference: diffNum, brandName, queuedForLocalScan: true },
    });
  }

  // 5. Noticeable drop: 3 or more ads turned off
  if (diffNum <= -3) {
    return createNotification({
      type: "count_scan",
      title: `${Math.abs(diffNum)} Ads Paused on ${brandName}`,
      message: `"${brandName}" paused ${Math.abs(diffNum)} ad(s). Total active ads: ${currentResults ?? 0}.`,
      severity: "info",
      trackedPageId,
      actionUrl: `/spy?trackedPageId=${trackedPageId}`,
      metadata: { currentResults, difference: diffNum, brandName },
    });
  }

  // 6. Routine check with 0 or minor (-1, -2) difference -> SILENT (recorded to scan_history only)
  return null;
}

/**
 * Convenience helper to log Ad Spy creative scans.
 * Only logs when actual new creatives are ingested or ads archived.
 */
export async function logAdSpyNotification(params: {
  trackedPageId: string;
  brandName: string;
  extractedCount: number;
  isFullScan?: boolean;
  archivedCount?: number;
}) {
  const { trackedPageId, brandName, extractedCount, isFullScan, archivedCount } = params;

  // Don't log spammy 0-item notifications for delta scans where no new ads were found
  if (extractedCount === 0 && !isFullScan && (!archivedCount || archivedCount === 0)) {
    return null;
  }

  const title = `✨ +${extractedCount} Creatives Synced: ${brandName}`;
  let message = `Ingested ${extractedCount} ad creative(s) for "${brandName}".`;
  if (archivedCount && archivedCount > 0) {
    message += ` Archived ${archivedCount} turned-off ad(s).`;
  }

  return createNotification({
    type: "ad_spy",
    title,
    message,
    severity: "success",
    trackedPageId,
    actionUrl: `/spy?trackedPageId=${trackedPageId}`,
    metadata: { extractedCount, isFullScan, archivedCount, brandName },
  });
}

export interface BatchSummaryMover {
  name: string;
  diff?: number;
  extractedCount?: number;
  currentResults?: number;
  trackedPageId?: string;
}

export interface LogBatchSummaryParams {
  runnerType: "count_worker" | "apify_spy" | "discovery";
  totalScanned: number;
  newAdsCount?: number;
  movers?: BatchSummaryMover[];
  unchangedCount?: number;
  failedCount?: number;
  durationSeconds?: number;
  actionUrl?: string;
}

/**
 * Creates a single consolidated Executive Summary Notification for a completed batch run.
 */
export async function logBatchSummaryNotification(params: LogBatchSummaryParams) {
  const {
    runnerType,
    totalScanned,
    newAdsCount = 0,
    movers = [],
    unchangedCount = 0,
    failedCount = 0,
    durationSeconds = 0,
    actionUrl,
  } = params;

  if (totalScanned === 0) return null;

  let title = "🏁 Scan Round Complete";
  let message = "";
  let severity: NotificationSeverity = "info";

  if (runnerType === "apify_spy") {
    title = `⚡ Apify Spy Sync (${totalScanned} Brands)`;
    if (newAdsCount > 0) {
      severity = "success";
      const moverSummary = movers.slice(0, 3).map((m) => `${m.name} (+${m.extractedCount || m.diff || 1})`).join(", ");
      message = `Ingested ${newAdsCount} new ad creatives across ${movers.length} active advertiser(s): ${moverSummary}${movers.length > 3 ? ` +${movers.length - 3} more` : ""}.`;
    } else {
      message = `All ${totalScanned} advertiser catalogs up to date (no new creatives detected).`;
    }
  } else if (runnerType === "count_worker") {
    title = `🏁 Count Check Complete (${totalScanned} Brands)`;
    if (movers.length > 0) {
      severity = "success";
      const moverSummary = movers.slice(0, 3).map((m) => `${m.name} (+${m.diff})`).join(", ");
      message = `🚀 ${movers.length} brand(s) launched new ads: ${moverSummary}${movers.length > 3 ? ` +${movers.length - 3} more` : ""}. (${unchangedCount} unchanged)`;
    } else {
      message = `Verified ${totalScanned} tracked pages. All counts unchanged.`;
    }
  } else {
    title = `🌐 Discovery Round Complete (${totalScanned} Pages)`;
    message = `Processed discovery scan across ${totalScanned} candidates.`;
  }

  if (failedCount > 0) {
    message += ` • ⚠️ ${failedCount} error(s)`;
    if (movers.length === 0) severity = "warning";
  }

  if (durationSeconds > 0) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    message += ` (${timeStr})`;
  }

  return createNotification({
    type: "batch_summary",
    title,
    message,
    severity,
    actionUrl: actionUrl || (runnerType === "apify_spy" ? "/spy" : "/"),
    metadata: {
      runnerType,
      totalScanned,
      newAdsCount,
      movers,
      unchangedCount,
      failedCount,
      durationSeconds,
    },
  });
}

export interface DiscoverySummaryTopBrand {
  name: string;
  pageId: string;
  adCount: number;
}

export interface LogDiscoverySummaryParams {
  country: string;
  totalAdsScanned: number;
  totalPagesDiscovered: number;
  topBrands?: DiscoverySummaryTopBrand[];
  durationSeconds?: number;
  runId?: string;
}

/**
 * Creates a single consolidated Executive Summary Notification for a completed Discovery Run.
 */
export async function logDiscoverySummaryNotification(params: LogDiscoverySummaryParams) {
  const {
    country,
    totalAdsScanned,
    totalPagesDiscovered,
    topBrands = [],
    durationSeconds = 0,
    runId,
  } = params;

  const title = `🌐 Discovery Complete: ${totalPagesDiscovered} Brands in ${country}`;
  let message = `Scanned ${totalAdsScanned} live ads across ${country} and discovered ${totalPagesDiscovered} active brand pages.`;

  if (topBrands.length > 0) {
    const topSummary = topBrands
      .slice(0, 3)
      .map((b) => `${b.name} (${b.adCount} ads)`)
      .join(", ");
    message += ` Top advertisers: ${topSummary}${topBrands.length > 3 ? ` +${topBrands.length - 3} more` : ""}.`;
  }

  if (durationSeconds > 0) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    message += ` (${timeStr})`;
  }

  return createNotification({
    type: "batch_summary",
    title,
    message,
    severity: totalPagesDiscovered > 0 ? "success" : "info",
    actionUrl: `/discovery?country=${encodeURIComponent(country)}`,
    metadata: {
      runnerType: "discovery",
      country,
      totalAdsScanned,
      totalPagesDiscovered,
      topBrands,
      durationSeconds,
      runId,
    },
  });
}

/**
 * Helper to log auto-merges (Exact phrase -> Page ID).
 */
export async function logPageMergedNotification(params: {
  trackedPageId: string;
  originalName: string;
  resolvedPageName: string;
  resolvedPageId: string;
}) {
  return createNotification({
    type: "page_merged",
    title: `🔗 Brand Auto-Merged: ${params.resolvedPageName}`,
    message: `Exact match "${params.originalName}" was resolved and upgraded to official Page ID "${params.resolvedPageName}" (${params.resolvedPageId}).`,
    severity: "success",
    trackedPageId: params.trackedPageId,
    actionUrl: `/?search=${encodeURIComponent(params.resolvedPageName)}`,
    metadata: {
      originalName: params.originalName,
      resolvedPageName: params.resolvedPageName,
      resolvedPageId: params.resolvedPageId,
    },
  });
}

/**
 * Helper to log multi-page conflicts (Exact phrase has multiple candidate pages).
 */
export async function logMultiPageDetectedNotification(params: {
  trackedPageId: string;
  domainName: string;
  candidatePages: Array<{ pageId: string; pageName?: string | null; adCount?: number }>;
}) {
  const count = params.candidatePages.length;
  return createNotification({
    type: "multi_page_detected",
    title: `⚠️ ${count} Facebook Pages Found`,
    message: `Found ${count} candidate Facebook Pages running ads for "${params.domainName}". Review and assign the primary brand page.`,
    severity: "warning",
    trackedPageId: params.trackedPageId,
    actionUrl: `/?search=${encodeURIComponent(params.domainName)}&resolveModal=${params.trackedPageId}`,
    metadata: {
      domainName: params.domainName,
      candidates: params.candidatePages,
    },
  });
}

/**
 * Prunes older notifications to keep the database table compact and fast.
 */
export async function pruneOldNotifications(maxKeep = 120) {
  try {
    const rows = await db.query.activityNotifications.findMany({
      columns: { id: true },
      orderBy: [desc(activityNotifications.createdAt)],
      offset: maxKeep,
      limit: 200,
    });

    if (rows.length > 0) {
      const idsToDelete = rows.map((r) => r.id);
      await db.delete(activityNotifications).where(inArray(activityNotifications.id, idsToDelete));
    }
  } catch (err) {
    // Non-fatal background cleanup
  }
}
