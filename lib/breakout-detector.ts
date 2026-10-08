import { db } from "@/db";
import { activityNotifications } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { calculateWinnerScore } from "./winner-score";
import { logBreakoutNotification } from "./notifications";

export interface BreakoutDetectorParams {
  adId: string;
  adArchiveId: string;
  pageId: string;
  brandName?: string | null;
  trackedPageId?: string | null;
  currentDuplication: number;
  prevDuplication?: number | null;
  startedRunningOn?: string | Date | null;
  firstSeenAt?: string | Date | null;
  lastSeenAt?: string | Date | null;
  mediaType?: string | null;
  productId?: string | null;
  productTitle?: string | null;
  linkUrl?: string | null;
  isActive?: boolean;
}

export interface BreakoutEvaluation {
  isBreakout: boolean;
  reason: string;
  winnerScore: number;
  daysRunning: number;
  scaleJump: number;
}

export interface BreakoutDetectorResult {
  isBreakout: boolean;
  reason?: string;
  winnerScore?: number;
  daysRunning?: number;
  scaleJump?: number;
  notificationCreated?: boolean;
}

/**
 * Pure evaluation function for breakout velocity rules.
 * Zero database side-effects, fully testable.
 */
export function evaluateBreakoutCriteria(params: {
  currentDuplication: number;
  prevDuplication?: number | null;
  startedRunningOn?: string | Date | null;
  firstSeenAt?: string | Date | null;
  lastSeenAt?: string | Date | null;
  mediaType?: string | null;
  isActive?: boolean;
}): BreakoutEvaluation {
  const {
    currentDuplication,
    prevDuplication,
    startedRunningOn,
    firstSeenAt,
    lastSeenAt,
    mediaType,
    isActive = true,
  } = params;

  // Guard: Ad must be active and have at least 3 copies to qualify as a breakout
  if (!isActive || currentDuplication < 3) {
    return {
      isBreakout: false,
      reason: "Below scale threshold (min 3 copies required)",
      winnerScore: 0,
      daysRunning: 0,
      scaleJump: 0,
    };
  }

  // 1. Calculate Winner Metrics & Days Running
  const winnerMetrics = calculateWinnerScore({
    startedRunningOn,
    firstSeenAt,
    lastSeenAt,
    duplicationCount: currentDuplication,
    isActive,
    mediaType,
  });

  const daysRunning = winnerMetrics.daysRunning;

  // Guard: Only recently launched ads (<= 7 days) can qualify as fresh breakouts
  if (daysRunning > 7) {
    return {
      isBreakout: false,
      reason: `Ad running for ${daysRunning}d (> 7d fresh window)`,
      daysRunning,
      winnerScore: winnerMetrics.winnerScore,
      scaleJump: 0,
    };
  }

  // 2. Velocity Jump Trigger Logic
  const prevDup = typeof prevDuplication === "number" ? prevDuplication : null;
  let isVelocityTrigger = false;
  let triggerReason = "";

  if (prevDup !== null) {
    if (prevDup < 3 && currentDuplication >= 3) {
      // Classic test-to-scale breakout (e.g. 1 -> 3 or 1 -> 5 copies)
      isVelocityTrigger = true;
      triggerReason = `Crossed threshold (${prevDup} ➔ ${currentDuplication} copies)`;
    } else if (currentDuplication - prevDup >= 2) {
      // Rapid surge (e.g. 3 -> 6 copies in one scan interval)
      isVelocityTrigger = true;
      triggerReason = `Surge (+${currentDuplication - prevDup} copies)`;
    }
  } else {
    // First time this ad is observed by the system:
    // If it launched in the last 72 hours and already has 3+ copies, it's an instant breakout!
    if (daysRunning <= 3) {
      isVelocityTrigger = true;
      triggerReason = `Launched with high scale (${currentDuplication} copies in ${daysRunning}d)`;
    }
  }

  const scaleJump = prevDup !== null ? Math.max(0, currentDuplication - prevDup) : currentDuplication;

  return {
    isBreakout: isVelocityTrigger,
    reason: isVelocityTrigger ? triggerReason : "No velocity jump detected",
    winnerScore: winnerMetrics.winnerScore,
    daysRunning,
    scaleJump,
  };
}

/**
 * Evaluates whether an ad creative or product has crossed a breakout velocity threshold.
 * If verified and not duplicate-spammed, logs a "breakout_alert" to activity_notifications.
 */
export async function checkAndRecordBreakout(
  params: BreakoutDetectorParams
): Promise<BreakoutDetectorResult> {
  try {
    const {
      adId,
      adArchiveId,
      pageId,
      brandName = "Brand",
      trackedPageId,
      productId,
      productTitle,
    } = params;

    // 1. Evaluate pure criteria
    const evalResult = evaluateBreakoutCriteria(params);
    if (!evalResult.isBreakout) {
      return {
        isBreakout: false,
        reason: evalResult.reason,
        winnerScore: evalResult.winnerScore,
        daysRunning: evalResult.daysRunning,
      };
    }

    // 2. Smart Deduplication: Check if we recently alerted for this ad archive
    // 72-hour deduplication window unless escalating into a Super-Scaler (>= 8 copies)
    const dedupWindowStart = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const recentAlert = await db.query.activityNotifications.findFirst({
      where: and(
        eq(activityNotifications.type, "breakout_alert"),
        eq(activityNotifications.adArchiveId, adArchiveId),
        gte(activityNotifications.createdAt, dedupWindowStart)
      ),
      columns: { id: true, metadata: true },
      orderBy: [desc(activityNotifications.createdAt)],
    });

    if (recentAlert) {
      const prevAlertDup = (recentAlert.metadata as any)?.currentDuplication || 3;
      // Allow secondary alert only if it reached Mega-Scaler tier (>= 8 copies) from < 8
      const isMegaEscalation = params.currentDuplication >= 8 && prevAlertDup < 8;
      if (!isMegaEscalation) {
        return {
          isBreakout: true,
          reason: "Breakout detected but suppressed by 72h deduplication window",
          daysRunning: evalResult.daysRunning,
          winnerScore: evalResult.winnerScore,
          scaleJump: evalResult.scaleJump,
          notificationCreated: false,
        };
      }
    }

    // 3. Log the notification
    const cleanBrandName = brandName || "Brand";
    await logBreakoutNotification({
      trackedPageId,
      brandName: cleanBrandName,
      pageId,
      adArchiveId,
      productTitle,
      prevDuplication: params.prevDuplication ?? 1,
      currentDuplication: params.currentDuplication,
      daysRunning: evalResult.daysRunning,
      winnerScore: evalResult.winnerScore,
      mediaType: params.mediaType,
      adId,
      productId,
      actionUrl: `/fresh-winners?highlight=${encodeURIComponent(adId)}`,
    });

    console.log(
      `[Breakout Detector] 🚀 Alert fired for ${cleanBrandName} (Ad ${adArchiveId}): ${evalResult.reason}, score: ${evalResult.winnerScore}`
    );

    return {
      isBreakout: true,
      reason: evalResult.reason,
      winnerScore: evalResult.winnerScore,
      daysRunning: evalResult.daysRunning,
      scaleJump: evalResult.scaleJump,
      notificationCreated: true,
    };
  } catch (error: any) {
    console.warn(`[Breakout Detector] Error evaluating ad ${params.adArchiveId}:`, error?.message);
    return { isBreakout: false, reason: "Error in evaluation" };
  }
}
