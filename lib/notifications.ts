import { db } from "@/db";
import { activityNotifications, trackedPages } from "@/db/schema";
import { eq, desc, and, inArray, gte } from "drizzle-orm";
import { stripEmojis } from "@/lib/utils";

export type NotificationType =
  | "count_scan"
  | "ad_spy"
  | "page_merged"
  | "multi_page_detected"
  | "domain_portfolio_linked"
  | "batch_summary"
  | "system_alert"
  | "breakout_alert";

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
  workspaceId?: string | null;
}

const isUuid = (str?: string | null) =>
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

export const getBrandActionUrl = (pageId?: string | null, brandName?: string | null, fallbackId?: string | null) => {
  const cleanFallback = fallbackId && !isUuid(fallbackId) ? fallbackId : null;
  const target = (pageId && !isUuid(pageId))
    ? pageId
    : (brandName && !isUuid(brandName))
      ? brandName
      : cleanFallback;

  return target ? `/spy/brand/${encodeURIComponent(target)}` : "/spy";
};

/**
 * Creates a persistent in-app notification record.
 * Deduplicates identical notifications created within the last 5 minutes.
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const cleanTitle = stripEmojis(params.title);
    const cleanMessage = stripEmojis(params.message);

    // Deduplication window: 6 hours for queued local scan notifications to avoid repeat spam, 5 minutes for general notifications
    const dedupWindowMs = params.metadata?.queuedForLocalScan ? 6 * 60 * 60 * 1000 : 5 * 60 * 1000;
    const windowStart = new Date(Date.now() - dedupWindowMs);
    const conditions = [
      eq(activityNotifications.type, params.type),
      eq(activityNotifications.title, cleanTitle),
      gte(activityNotifications.createdAt, windowStart),
    ];

    if (params.trackedPageId) {
      conditions.push(eq(activityNotifications.trackedPageId, params.trackedPageId));
    }

    const existing = await db.query.activityNotifications.findFirst({
      where: and(...conditions),
      columns: { id: true },
      orderBy: [desc(activityNotifications.createdAt)],
    });

    if (existing) {
      return existing;
    }

    let workspaceId = params.workspaceId || null;
    if (!workspaceId && params.trackedPageId) {
      try {
        const page = await db.query.trackedPages.findFirst({
          where: eq(trackedPages.id, params.trackedPageId),
          columns: { workspaceId: true },
        });
        if (page?.workspaceId) {
          workspaceId = page.workspaceId;
        }
      } catch (e) {}
    }

    const [record] = await db
      .insert(activityNotifications)
      .values({
        type: params.type,
        title: cleanTitle,
        message: cleanMessage,
        severity: params.severity || "info",
        trackedPageId: params.trackedPageId || null,
        workspaceId,
        adArchiveId: params.adArchiveId || null,
        actionUrl: params.actionUrl || null,
        metadata: params.metadata || null,
        isRead: false,
        createdAt: new Date(),
      })
      .returning({ id: activityNotifications.id });

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
  pageId?: string | null;
  isOnHold?: boolean;
  isAmbiguousZero?: boolean;
}) {
  const { trackedPageId, brandName, currentResults, difference, status, pageId, isOnHold, isAmbiguousZero } = params;
  const brandPath = getBrandActionUrl(pageId, brandName, trackedPageId);

  // 1. Log errors or unclear navigation warnings
  if (status !== "success") {
    return createNotification({
      type: "count_scan",
      title: `Count Check Incomplete: ${brandName}`,
      message: `Could not verify active ads. Will retry shortly.`,
      severity: "warning",
      trackedPageId,
      actionUrl: `/?search=${encodeURIComponent(brandName)}`,
      metadata: { currentResults, difference, status, brandName, pageId },
    });
  }

  const diffNum = difference || 0;
  const isMegaBrand = currentResults !== null && currentResults >= 50;

  // 2. High-Urgency: Brand completely shut off all ads (Active Ads -> 0)
  if (currentResults === 0 && diffNum < 0) {
    if (isOnHold || isAmbiguousZero) {
      return null;
    }
    return createNotification({
      type: "count_scan",
      title: `All Ads Stopped: ${brandName}`,
      message: `All ${Math.abs(diffNum)} ads were turned off (0 active).`,
      severity: "warning",
      trackedPageId,
      actionUrl: brandPath,
      metadata: { currentResults: 0, difference: diffNum, brandName, pageId, wentDark: true },
    });
  }

  // 3a. Mega-Brand High-Priority: 50+ active ads running with positive changes
  if (isMegaBrand && diffNum > 0) {
    return createNotification({
      type: "count_scan",
      title: `Large Brand Scaling: ${brandName}`,
      message: `${currentResults} active ads running (+${diffNum} new today).`,
      severity: "success",
      trackedPageId,
      actionUrl: brandPath,
      metadata: { currentResults, difference: diffNum, brandName, pageId, isMegaBrand: true, isSurge: diffNum >= 5, highPriority: true },
    });
  }

  // 3b. High-Signal: Scaling Surge (5 or more new ads launched at once)
  if (diffNum >= 5) {
    return createNotification({
      type: "count_scan",
      title: `Scaling Up: ${brandName} (+${diffNum} Ads)`,
      message: `Running ${currentResults ?? 0} active ads (+${diffNum} new today).`,
      severity: "success",
      trackedPageId,
      actionUrl: brandPath,
      metadata: { currentResults, difference: diffNum, brandName, pageId, isSurge: true, highPriority: true },
    });
  }

  // Minor changes (1 to 4 new ads, and pauses) are cleanly summarized in the Batch Summary digest
  // to avoid flooding the notification center with dozens of individual cards.
  return null;
}

export async function logHoldDetectedNotification(params: {
  trackedPageId: string;
  brandName: string;
  prevResults: number | null;
  pageId?: string | null;
}) {
  return createNotification({
    type: "count_scan",
    title: `Ads Inactive: ${params.brandName}`,
    message: `No active ads detected. Monitoring for a restart.`,
    severity: "warning",
    trackedPageId: params.trackedPageId,
    actionUrl: getBrandActionUrl(params.pageId, params.brandName, params.trackedPageId),
    metadata: { prevResults: params.prevResults, isOnHold: true },
  });
}

export async function logHoldLiftedNotification(params: {
  trackedPageId: string;
  brandName: string;
  recoveredResults: number;
  pageId?: string | null;
  isRelaunch?: boolean;
}) {
  const isRelaunch = params.isRelaunch ?? false;
  return createNotification({
    type: "count_scan",
    title: `Ads Resumed: ${params.brandName}`,
    message: `Back on air with ${params.recoveredResults} active ads.`,
    severity: "success",
    trackedPageId: params.trackedPageId,
    actionUrl: getBrandActionUrl(params.pageId, params.brandName, params.trackedPageId),
    metadata: { recoveredResults: params.recoveredResults, isOnHold: false, isRelaunch },
  });
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
  newProductsCount?: number;
  pageId?: string | null;
}) {
  const { trackedPageId, brandName, extractedCount, isFullScan, archivedCount, newProductsCount = 0, pageId } = params;

  // Don't log spammy 0-item notifications for delta scans where no new ads or products were found
  if (extractedCount === 0 && !isFullScan && (!archivedCount || archivedCount === 0) && newProductsCount === 0) {
    return null;
  }

  const brandPath = getBrandActionUrl(pageId, brandName, trackedPageId);

  if (extractedCount > 0 || newProductsCount > 0) {
    let title = `New Ads Added: ${brandName} (+${extractedCount})`;
    let message = `${extractedCount} new ads ready to view.`;

    if (newProductsCount > 0 && extractedCount > 0) {
      title = `New Ads & Products: ${brandName}`;
      message = `${extractedCount} new ads and ${newProductsCount} product page${newProductsCount === 1 ? "" : "s"} added.`;
    } else if (newProductsCount > 0) {
      title = `New Products Added: ${brandName}`;
      message = `${newProductsCount} new product page${newProductsCount === 1 ? "" : "s"} added.`;
    }

    return createNotification({
      type: "ad_spy",
      title,
      message,
      severity: "success",
      trackedPageId,
      actionUrl: brandPath,
      metadata: { extractedCount, isFullScan, newProductsCount, brandName, pageId },
    });
  }

  if (archivedCount && archivedCount > 0) {
    return createNotification({
      type: "ad_spy",
      title: `Ads Inactive: ${brandName} (${archivedCount})`,
      message: `${archivedCount} ads ended and moved to archive.`,
      severity: "info",
      trackedPageId,
      actionUrl: brandPath,
      metadata: { archivedCount, brandName, pageId },
    });
  }

  return null;
}

export interface BatchSummaryMover {
  name: string;
  diff?: number;
  extractedCount?: number;
  newProductsCount?: number;
  currentResults?: number;
  trackedPageId?: string;
  pageId?: string;
}

export interface LogBatchSummaryParams {
  runnerType: "count_worker" | "apify_spy" | "discovery";
  totalScanned: number;
  newAdsCount?: number;
  newProductsCount?: number;
  movers?: BatchSummaryMover[];
  unchangedCount?: number;
  failedCount?: number;
  durationSeconds?: number;
  actionUrl?: string;
  shardInfo?: string;
}

/**
 * Creates a single consolidated Executive Summary Notification for a completed batch run.
 */
export async function logBatchSummaryNotification(params: LogBatchSummaryParams) {
  const {
    runnerType,
    totalScanned,
    newAdsCount = 0,
    newProductsCount = 0,
    movers = [],
    unchangedCount = 0,
    failedCount = 0,
    durationSeconds = 0,
    actionUrl,
    shardInfo,
  } = params;

  if (totalScanned === 0) return null;

  // If a shard found 0 movers and 0 errors, stay silent to avoid spamming "0 unchanged" cards
  if (runnerType === "count_worker" && movers.length === 0 && failedCount === 0) {
    return null;
  }

  const shardPrefix = shardInfo ? `[${shardInfo}] ` : "";
  let title = `${shardPrefix}Catalog Sync Complete`;
  let message = "";
  let severity: NotificationSeverity = "info";

  if (runnerType === "apify_spy") {
    title = `${shardPrefix}Catalog Sync Complete`;
    if (newAdsCount > 0 || newProductsCount > 0) {
      severity = "success";
      const parts: string[] = [];
      if (newAdsCount > 0) parts.push(`${newAdsCount} new ads`);
      if (newProductsCount > 0) parts.push(`${newProductsCount} product pages`);
      message = `Added ${parts.join(" and ")} across ${movers.length} active brands.`;
    } else {
      message = `All ${totalScanned} brand catalogs are up to date.`;
    }
  } else if (runnerType === "count_worker") {
    title = `${shardPrefix}Daily Count Check Complete`;
    if (movers.length > 0) {
      severity = "success";
      message = `${movers.length} brands scaled new ads today (${unchangedCount} unchanged).`;
    } else {
      message = `Verified ${totalScanned} tracked brands.`;
    }
  } else {
    title = `${shardPrefix}Brand Discovery Complete`;
    message = `Checked ${totalScanned} candidate brands.`;
  }

  if (failedCount > 0) {
    message += ` • ${failedCount} error(s)`;
    if (movers.length === 0) severity = "warning";
  }

  if (durationSeconds > 0) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    message += ` (${timeStr})`;
  }

  const defaultActionUrl =
    runnerType === "apify_spy"
      ? "/spy?sortBy=started_running_on&sortOrder=desc"
      : runnerType === "count_worker"
      ? "/?sortBy=difference&sortOrder=desc"
      : "/discovery";

  return createNotification({
    type: "batch_summary",
    title,
    message,
    severity,
    actionUrl: actionUrl || defaultActionUrl,
    metadata: {
      runnerType,
      totalScanned,
      newAdsCount,
      newProductsCount,
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

  const title = `Brand Discovery: ${country}`;
  let message = `Discovered ${totalPagesDiscovered} new active brands (${totalAdsScanned} ads scanned).`;

  if (topBrands.length > 0) {
    const topSummary = topBrands
      .slice(0, 3)
      .map((b) => `${b.name} (${b.adCount} ads)`)
      .join(", ");
    message += ` Top: ${topSummary}${topBrands.length > 3 ? ` +${topBrands.length - 3} more` : ""}.`;
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
    title: `Brand Linked: ${params.resolvedPageName}`,
    message: `Matched "${params.originalName}" to official Facebook Page.`,
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
    title: `Multiple Pages Found: ${params.domainName}`,
    message: `Found ${count} Facebook pages running ads. Select the main page.`,
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
 * Helper to log successful domain portfolio linking.
 */
export async function logDomainPortfolioLinkedNotification(params: {
  trackedPageId?: string;
  domainName: string;
  brandDomainId: string;
  pageCount: number;
  primaryPageName: string;
}) {
  return createNotification({
    type: "domain_portfolio_linked",
    title: `Brands Grouped: ${params.domainName}`,
    message: `Grouped ${params.pageCount} pages under ${params.domainName} (Main: ${params.primaryPageName}).`,
    severity: "success",
    trackedPageId: params.trackedPageId,
    actionUrl: `/spy/brand/${encodeURIComponent(params.domainName)}`,
    metadata: {
      domainName: params.domainName,
      brandDomainId: params.brandDomainId,
      pageCount: params.pageCount,
      primaryPageName: params.primaryPageName,
    },
  });
}

/**
 * Convenience helper to log Breakout Velocity notifications.
 * Fired when an ad launched recently (<= 7 days) scales to 3+ copies or experiences a rapid duplication surge.
 */
export async function logBreakoutNotification(params: {
  trackedPageId?: string | null;
  brandName: string;
  pageId?: string | null;
  adArchiveId: string;
  productTitle?: string | null;
  prevDuplication: number;
  currentDuplication: number;
  daysRunning: number;
  winnerScore: number;
  mediaType?: string | null;
  actionUrl?: string;
  adId?: string;
  productId?: string | null;
}) {
  const {
    trackedPageId,
    brandName,
    pageId,
    adArchiveId,
    productTitle,
    prevDuplication,
    currentDuplication,
    daysRunning,
    winnerScore,
    mediaType,
    actionUrl,
    adId,
    productId,
  } = params;

  const title = `Breakout Winner: ${brandName}`;
  const productText = productTitle ? `"${productTitle}"` : "Ad";
  const message = `${productText} scaled to ${currentDuplication} active ads (Winner score: ${winnerScore}/100).`;

  const fallbackAction = actionUrl || `/fresh-winners?highlight=${encodeURIComponent(adId || adArchiveId)}`;

  return createNotification({
    type: "breakout_alert",
    title,
    message,
    severity: "success",
    trackedPageId,
    adArchiveId,
    actionUrl: fallbackAction,
    metadata: {
      adId,
      adArchiveId,
      productId,
      productTitle,
      brandName,
      pageId,
      prevDuplication,
      currentDuplication,
      daysRunning,
      winnerScore,
      mediaType,
      isBreakout: true,
      scaleJump: currentDuplication - prevDuplication,
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
