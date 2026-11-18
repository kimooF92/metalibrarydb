/**
 * Apify Scan Policy & 3-Day History Decision Engine
 *
 * Centralized decision engine governing creative extraction scans across:
 * 1. scripts/run-apify-spy-cron.ts (12-hour batch cron)
 * 2. worker/services/scan-completion-service.ts (real-time post-count completion)
 *
 * Core Invariant: Strictly enforces the 3-day rolling window in chronological order:
 * [s5 (T-72h) -> s4 (T-60h) -> s3 (T-48h) -> s2 (T-36h) -> s1 (T-24h) -> s0 (TODAY)]
 * Left = Past, Right = Today.
 */

import { db } from "../db";
import { trackedPages, scanHistory, creativeScans } from "../db/schema";
import { eq, and, gt, desc, sql } from "drizzle-orm";

export type ScanAction =
  | "DELTA_SCAN"        // Pattern 1: Genuine New Product Launch / Scaling
  | "FULL_RECONCILE"    // Pattern 2: Confirmed Descaling (Turned-Off Ads)
  | "MAINTENANCE_FULL"  // Pattern 4: Staleness Heartbeat (Silent Ad Swaps)
  | "BOOTSTRAP_FULL"    // Initial Onboarding Scan for new brand
  | "SKIP";             // Pattern 3 (Bounce-Back Jitter), Cooldown, or Idle

export type WorkloadTier = "tier1_gh" | "tier2_local" | "tier3_apify";

export interface ScanDecision {
  action: ScanAction;
  reason: string;
  limit: number;
  isFullScan: boolean;
  tier: WorkloadTier;
  pageId: string;
  displayName: string;
  targetUrl: string | null;
  currentResults: number;
  historicalPeak: number;
  netDelta: number;
  history: number[]; // Chronological: [s5, s4, s3, s2, s1, s0] (Left=Past, Right=Today)
}

export interface PolicyEvaluationInput {
  pageId: string;
  displayName?: string | null;
  url?: string | null;
  currentResults?: number | null;
  lastCreativeScan?: Date | null;
  autoCreativeScan?: boolean | null;
  holdStatus?: string | null;
  historyChronological: Array<{ results: number | null; checkedAt?: Date | null }>;
  lastReconcileFinishedAt?: Date | null;
  latestFailedScanFinishedAt?: Date | null;
  latestFailedScanReason?: string | null;
  now?: Date;
}

export interface PreloadedTrackedPage {
  id: string;
  url?: string | null;
  displayName?: string | null;
  currentResults?: number | null;
  lastCreativeScan?: Date | null;
  autoCreativeScan?: boolean | null;
  isWatchlisted?: boolean | null;
  holdStatus?: string | null;
}

/**
 * Pure deterministic state machine evaluating 3-day history & safety circuit breakers.
 */
export function evaluateScanRules(input: PolicyEvaluationInput): ScanDecision {
  const pageId = input.pageId;
  const displayName = input.displayName || pageId;
  const currentResults = Math.max(0, input.currentResults ?? 0);
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const tier = resolveTier(currentResults);

  const skip = (reason: string, historicalPeak = currentResults): ScanDecision => ({
    action: "SKIP",
    reason,
    limit: 0,
    isFullScan: false,
    tier,
    pageId,
    displayName,
    targetUrl: input.url || null,
    currentResults,
    historicalPeak,
    netDelta: 0,
    history: input.historyChronological.map((h) => h.results ?? 0),
  });

  if (!input.url) {
    return skip("Tracked page has no URL");
  }

  // Guard: User explicitly paused auto-scanning
  if (input.autoCreativeScan === false) {
    return skip("Auto creative scan paused by user");
  }

  // Guard: Brand is currently on hold (zero-result grace period)
  if (input.holdStatus === "on_hold") {
    return skip("Brand is currently on hold (grace period)");
  }

  // Guard: 24-Hour Cooldown per brand
  const twentyFourHoursAgo = new Date(nowMs - 24 * 60 * 60 * 1000);
  if (input.lastCreativeScan && input.lastCreativeScan > twentyFourHoursAgo) {
    return skip("24h cooldown active (scanned recently)");
  }

  // Guard: 12-Hour Failure Circuit Breaker
  const twelveHoursAgo = new Date(nowMs - 12 * 60 * 60 * 1000);
  if (
    input.latestFailedScanFinishedAt &&
    input.latestFailedScanFinishedAt > twelveHoursAgo
  ) {
    return skip(
      `12h failure cooldown active (${input.latestFailedScanReason || "previous scan failed"})`
    );
  }

  // Guard: Dark catalog (0 active ads)
  if (currentResults === 0) {
    return skip("0 active ads in catalog (dark)");
  }

  // Check 1: Brand-New Page Bootstrap (never scanned before)
  const isFirstTime = !input.lastCreativeScan;
  if (isFirstTime) {
    const bootstrapLimit = Math.min(100, Math.max(10, currentResults + 10));
    return {
      action: "BOOTSTRAP_FULL",
      reason: `Initial onboarding scan (never scanned, active ads: ${currentResults})`,
      limit: bootstrapLimit,
      isFullScan: true,
      tier,
      pageId,
      displayName,
      targetUrl: input.url,
      currentResults,
      historicalPeak: currentResults,
      netDelta: currentResults,
      history: [currentResults],
    };
  }

  // 2. Evaluate 6-Scan Rolling Window (chronological: Left=Past -> Right=Today)
  const historyCounts = input.historyChronological.map((h) => h.results ?? 0);

  if (input.historyChronological.length < 2) {
    return skip("Insufficient history entries (< 2 scans) to evaluate trend");
  }

  const s0 = currentResults;
  const s1 = historyCounts[historyCounts.length - 2] ?? s0;

  // 3. Descaling Recovery Anchor Fix:
  // If a Full Reconciliation Scan previously completed, bound peak calculation
  // to only scans that occurred AFTER that reconciliation.
  const reconcileCutoff = input.lastReconcileFinishedAt || null;

  const pastScans = input.historyChronological.slice(0, -1);
  const validPastCounts = pastScans
    .filter((h) => !reconcileCutoff || (h.checkedAt && h.checkedAt >= reconcileCutoff))
    .map((h) => h.results ?? 0);

  const historicalPeak = validPastCounts.length > 0
    ? Math.max(...validPastCounts)
    : s1;

  const netDelta = s0 - historicalPeak;

  // --- Pattern 1: Genuine New Product Launch / Scaling (Today > Peak_3d) ---
  if (s0 > historicalPeak) {
    const deltaLimit = Math.max(10, netDelta + 5);
    return {
      action: "DELTA_SCAN",
      reason: `New product launch / scaling (+${netDelta} ad(s) above 3-day peak of ${historicalPeak})`,
      limit: deltaLimit,
      isFullScan: false,
      tier,
      pageId,
      displayName,
      targetUrl: input.url,
      currentResults: s0,
      historicalPeak,
      netDelta,
      history: historyCounts,
    };
  }

  // --- Pattern 2: Confirmed Descaling (Today <= Peak_3d - 5) ---
  // Requires:
  // 1. Drop of >= 5 ads below 3-day peak
  // 2. Sustained across checks: |s0 - s1| <= 2 (jitter tolerance)
  const isSignificantDrop = s0 <= historicalPeak - 5;
  const isSustainedDrop = Math.abs(s0 - s1) <= 2;

  if (isSignificantDrop && isSustainedDrop) {
    const dropAmount = historicalPeak - s0;
    const reconcileLimit = s0 + 5;
    return {
      action: "FULL_RECONCILE",
      reason: `Confirmed descaling (-${dropAmount} ads below 3-day peak of ${historicalPeak}, sustained across checks)`,
      limit: reconcileLimit,
      isFullScan: true,
      tier,
      pageId,
      displayName,
      targetUrl: input.url,
      currentResults: s0,
      historicalPeak,
      netDelta,
      history: historyCounts,
    };
  }

  // --- Pattern 3: Bounce-Back Noise Filter (Suppressed) ---
  // If s0 > s1 (small bounce) BUT s0 <= historicalPeak
  if (s0 > s1 && s0 <= historicalPeak) {
    return skip(
      `Bounce-back jitter (s0=${s0} > s1=${s1}, but <= 3-day peak of ${historicalPeak})`,
      historicalPeak
    );
  }

  // --- Pattern 4: Staleness Heartbeat (Flatline for >= 6 Days) ---
  const sixDaysAgo = new Date(nowMs - 6 * 24 * 60 * 60 * 1000);
  const isStale = Boolean(input.lastCreativeScan && input.lastCreativeScan < sixDaysAgo);

  if (isStale && s0 >= 1) {
    return {
      action: "MAINTENANCE_FULL",
      reason: `Staleness heartbeat (no creative scan for >= 6 days, syncing ${s0} live ads)`,
      limit: s0 + 5,
      isFullScan: true,
      tier,
      pageId,
      displayName,
      targetUrl: input.url,
      currentResults: s0,
      historicalPeak,
      netDelta: 0,
      history: historyCounts,
    };
  }

  // Default: Stable catalog / minor normal fluctuation
  return skip(`Stable catalog / minor fluctuation (${s0} ads, peak ${historicalPeak})`, historicalPeak);
}

/**
 * Evaluates whether a brand needs a creative scan, reading necessary DB context.
 */
export async function evaluateScanAction(
  pageId: string,
  preloadedPage?: PreloadedTrackedPage
): Promise<ScanDecision> {
  const page =
    preloadedPage ||
    (await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, pageId),
      columns: {
        id: true,
        url: true,
        displayName: true,
        currentResults: true,
        lastCreativeScan: true,
        autoCreativeScan: true,
        isWatchlisted: true,
        holdStatus: true,
      },
    }));

  if (!page) {
    return {
      action: "SKIP",
      reason: "Tracked page not found",
      limit: 0,
      isFullScan: false,
      tier: "tier1_gh",
      pageId,
      displayName: pageId,
      targetUrl: null,
      currentResults: 0,
      historicalPeak: 0,
      netDelta: 0,
      history: [],
    };
  }

  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  // 1. Fetch latest failed scan (for 12h circuit breaker)
  const recentFailedScan = await db.query.creativeScans.findFirst({
    where: and(
      eq(creativeScans.trackedPageId, page.id),
      eq(creativeScans.status, "failed"),
      gt(creativeScans.finishedAt, twelveHoursAgo)
    ),
    columns: { finishedAt: true, failureReason: true },
    orderBy: [desc(creativeScans.finishedAt)],
  });

  // 2. Fetch last successful full reconciliation scan (for peak recovery anchor)
  const lastFullReconcile = await db.query.creativeScans.findFirst({
    where: and(
      eq(creativeScans.trackedPageId, page.id),
      eq(creativeScans.status, "completed"),
      sql`${creativeScans.configSnapshot}::jsonb->>'isFullScan' = 'true'`
    ),
    columns: { finishedAt: true },
    orderBy: [desc(creativeScans.finishedAt)],
  });

  // 3. Fetch 6-scan rolling window (lean projection)
  const rawHistory = await db.query.scanHistory.findMany({
    where: and(
      eq(scanHistory.trackedPageId, page.id),
      eq(scanHistory.status, "success")
    ),
    columns: {
      results: true,
      difference: true,
      checkedAt: true,
    },
    orderBy: [desc(scanHistory.checkedAt)],
    limit: 6,
  });

  // Convert DESC to chronological [s5..s0]
  const historyChronological = [...rawHistory].reverse();

  return evaluateScanRules({
    pageId: page.id,
    displayName: page.displayName,
    url: page.url,
    currentResults: page.currentResults ?? null,
    lastCreativeScan: page.lastCreativeScan,
    autoCreativeScan: page.autoCreativeScan,
    holdStatus: page.holdStatus,
    historyChronological,
    lastReconcileFinishedAt: lastFullReconcile?.finishedAt ? new Date(lastFullReconcile.finishedAt) : null,
    latestFailedScanFinishedAt: recentFailedScan?.finishedAt ? new Date(recentFailedScan.finishedAt) : null,
    latestFailedScanReason: recentFailedScan?.failureReason,
    now,
  });
}

/**
 * Resolves the workload tier based on active catalog size:
 * - Tier 1: 1 to 8 ads -> GitHub Actions Playwright ($0)
 * - Tier 2: 9 to 30 ads -> Local Worker ($0)
 * - Tier 3: 31+ ads -> Apify Cloud ($0.0075 / run)
 */
export function resolveTier(results: number): WorkloadTier {
  if (results <= 8) return "tier1_gh";
  if (results <= 30) return "tier2_local";
  return "tier3_apify";
}
