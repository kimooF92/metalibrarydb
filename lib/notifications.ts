import { eq, desc, and, inArray, gte } from "drizzle-orm";

export type NotificationType =
  | "count_scan"
  | "ad_spy"
  | "page_merged"
  | "multi_page_detected"
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
 * Deduplicates identical notifications created within the last 60 seconds.
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    // Deduplication window: Prevent duplicate identical notifications within the last 60 seconds
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    const conditions = [
      eq(activityNotifications.type, params.type),
      eq(activityNotifications.title, params.title),
      gte(activityNotifications.createdAt, sixtySecondsAgo),
    ];

    if (params.trackedPageId) {
      conditions.push(eq(activityNotifications.trackedPageId, params.trackedPageId));
    }

    const existing = await db.query.activityNotifications.findFirst({
      where: and(...conditions),
      orderBy: [desc(activityNotifications.createdAt)],
    });

    if (existing) {
      console.log(`[Notification] Deduplicated duplicate notification "${params.title}" within 60s.`);
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

    return record;
  } catch (error) {
    console.error("[Notification] Failed to create notification:", error);
    return null;
  }
}

/**
 * Convenience helper to log Count Scan activities (differences, zero changes, or issues).
 */
export async function logCountScanNotification(params: {
  trackedPageId: string;
  brandName: string;
  currentResults: number | null;
  difference: number | null;
  status: "success" | "failed" | "unclear";
}) {
  const { trackedPageId, brandName, currentResults, difference, status } = params;

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
  let title = "Count Checked";
  let message = `Checked "${brandName}": ${currentResults ?? 0} active ads (No change).`;
  let severity: NotificationSeverity = "info";

  if (diffNum > 0) {
    title = `+${diffNum} New Ads Detected!`;
    message = `"${brandName}" launched +${diffNum} new ad(s)! Total active ads: ${currentResults ?? 0}.`;
    severity = "success";
  } else if (diffNum < 0) {
    title = `${diffNum} Ads Turned Off`;
    message = `"${brandName}" paused ${Math.abs(diffNum)} ad(s). Total active ads: ${currentResults ?? 0}.`;
    severity = "info";
  }

  return createNotification({
    type: "count_scan",
    title,
    message,
    severity,
    trackedPageId,
    actionUrl: `/spy?trackedPageId=${trackedPageId}`,
    metadata: { currentResults, difference: diffNum },
  });
}

/**
 * Convenience helper to log Ad Spy creative scans.
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

  const title = `Ad Spy Synced: ${brandName}`;
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
    metadata: { extractedCount, isFullScan, archivedCount },
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
    title: "Brand Verified & Auto-Merged",
    message: `Exact match "${params.originalName}" was resolved and linked to official Meta Page "${params.resolvedPageName}" (ID: ${params.resolvedPageId}).`,
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
    message: `Found ${count} Facebook Pages running ads for "${params.domainName}". Review and assign the primary brand page.`,
    severity: "warning",
    trackedPageId: params.trackedPageId,
    actionUrl: `/?search=${encodeURIComponent(params.domainName)}&resolveModal=${params.trackedPageId}`,
    metadata: {
      domainName: params.domainName,
      candidates: params.candidatePages,
    },
  });
}
