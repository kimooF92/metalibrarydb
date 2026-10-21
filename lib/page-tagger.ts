/**
 * Page Archetype Tagger & Doubt Referee Engine
 *
 * Implements the hybrid mathematical sweet-spot scoring engine + Span/Jev decision referee.
 *
 * 1. 88% of cases: 100% deterministic mathematical sweet-spot equations (0ms latency, $0 token cost).
 * 2. 12% of cases: When mathematical doubt is triggered (borderline score clash between top contenders),
 *    invokes respan/span-02 (fallback typesafe/jev-1.13) via OpenRouter Decisions API to break ties.
 * 3. Persists resolved tags to tracked_pages.tags in PostgreSQL.
 */

import { db } from "@/db";
import { trackedPages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  classifyScalingPattern,
  ScalingArchetype,
  ScalingPatternResult,
  extractTelemetryFromScans,
  calculateAllArchetypeScores,
  PageContext,
} from "./scaling-classifier";
import { callJevDecisions, JevChoiceAnswer } from "./typesafe-jev";

export interface PageScanInput {
  results: number;
  checkedAt?: Date | string | null;
}

export interface TaggingResult {
  tag: ScalingArchetype;
  confidence: "high" | "medium" | "low";
  resolvedByReferee: boolean;
  refereeModel?: string;
  refereeProbabilities?: Record<string, number>;
  mathematicalScores: Record<string, number>;
  doubt: boolean;
  pattern: ScalingPatternResult;
}

const ARCHETYPE_CRITERIA_MAP: Record<string, string> = {
  scaling: "Sustained multi-day expansion of ad budget and creative variations behind proven winning SKUs, maintaining volume at or near peak.",
  breakout: "Sudden impulse explosion of new ads (+12+ new ads in last 24-36h) representing a brand-new campaign launch or flash event.",
  burst: "Cyclical testing wave: launches large test batches followed by rapid pruning of underperforming creatives within 24-72h.",
  stable: "Mature evergreen baseline: consistent active ad volume with minimal drift and low creative churn.",
  heavy_tester: "Active creative lab: continuously rotating SKUs and ad angles in small batches without scaling volume copies.",
  descaling: "Sustained budget contraction, ad fatigue, or shutting down declining creatives from historical peak.",
};

/**
 * Computes deterministic mathematical archetype tag for a page with hold protection and time-interval coupling.
 */
export function computeMathematicalTag(
  scans: PageScanInput[],
  currentResults?: number | null,
  pageContext?: PageContext | null
): {
  tag: ScalingArchetype;
  doubt: boolean;
  doubtContenders: string[];
  scores: Record<string, number>;
  pattern: ScalingPatternResult;
} {
  const points = scans.map((s) => s.results);
  const timestamps = scans.map((s) => s.checkedAt || null);
  const pattern = classifyScalingPattern(points, currentResults, timestamps, pageContext);

  return {
    tag: pattern.archetype,
    doubt: Boolean(pattern.doubt),
    doubtContenders: pattern.doubtContenders || [],
    scores: pattern.scores || {},
    pattern,
  };
}

/**
 * Resolves page tag using hybrid architecture:
 * 1. Computes mathematical sweet-spot scores (with cluster epoch downsampling & hold protection).
 * 2. If doubt is triggered, calls Span/Jev referee to break the clash.
 */
export async function resolvePageTag(
  page: { id?: string; displayName?: string | null; currentResults?: number | null },
  scans: PageScanInput[],
  options?: { disableReferee?: boolean },
  pageContext?: PageContext | null
): Promise<TaggingResult> {
  const math = computeMathematicalTag(scans, page.currentResults, pageContext);

  // If no doubt detected, or referee disabled, return deterministic mathematical tag immediately
  if (!math.doubt || options?.disableReferee || math.doubtContenders.length === 0) {
    return {
      tag: math.tag,
      confidence: math.pattern.confidence,
      resolvedByReferee: false,
      mathematicalScores: math.scores,
      doubt: math.doubt,
      pattern: math.pattern,
    };
  }

  // DOUBT CASE: Invoke Span/Jev Decision Referee (respan/span-02)
  try {
    const points = scans.map((s) => s.results);
    const timestamps = scans.map((s) => s.checkedAt || null);
    const telemetry = extractTelemetryFromScans(points, timestamps, pageContext);

    const filteredCriteria: Record<string, string> = {};
    for (const contender of math.doubtContenders) {
      if (ARCHETYPE_CRITERIA_MAP[contender]) {
        filteredCriteria[contender] = ARCHETYPE_CRITERIA_MAP[contender];
      }
    }
    // Also include top and runner-up criteria fallback
    if (Object.keys(filteredCriteria).length < 2) {
      filteredCriteria.scaling = ARCHETYPE_CRITERIA_MAP.scaling;
      filteredCriteria.burst = ARCHETYPE_CRITERIA_MAP.burst;
    }

    const statePayload = {
      brand_name: page.displayName || "Unknown",
      current_active_ads: telemetry.current,
      recent_scan_trajectory: points.slice(-10),
      total_span_days: telemetry.spanDays,
      effective_epochs: telemetry.effectiveEpochs,
      daily_ad_velocity: telemetry.velocityPerDay,
      delta_volatility: telemetry.volatility,
      sawtooth_reversion_rate: telemetry.reversionRate,
      is_on_hold: telemetry.isOnHold,
      mathematical_clash_scores: math.scores,
      doubt_reason: `Mathematical tie between ${math.doubtContenders.join(" and ")}`,
    };

    const response = await callJevDecisions(
      statePayload,
      {
        archetype_tag: {
          type: "choice",
          instructions:
            "Select the single most accurate advertising archetype tag for this competitor brand based on its ad count telemetry and scan trajectory.",
          criteria: filteredCriteria,
        },
      },
      { timeoutMs: 6000 }
    );

    const answer = response?.answers?.archetype_tag as JevChoiceAnswer | undefined;

    if (answer?.choice && (answer.choice in ARCHETYPE_CRITERIA_MAP || answer.choice === "breakout")) {
      const refereeTag = answer.choice as ScalingArchetype;
      return {
        tag: refereeTag,
        confidence: (answer.confidence && answer.confidence >= 0.6) ? "high" : "medium",
        resolvedByReferee: true,
        refereeModel: response?.model,
        refereeProbabilities: answer.probabilities,
        mathematicalScores: math.scores,
        doubt: true,
        pattern: {
          ...math.pattern,
          archetype: refereeTag,
          shortLabel: refereeTag.toUpperCase(),
        },
      };
    }
  } catch (err: any) {
    console.warn(`[Page Tagger] Span/Jev referee notice for "${page.displayName}":`, err?.message || err);
  }

  // Graceful fallback to mathematical top tag if referee call is unreachable or fails
  return {
    tag: math.tag,
    confidence: math.pattern.confidence,
    resolvedByReferee: false,
    mathematicalScores: math.scores,
    doubt: true,
    pattern: math.pattern,
  };
}

/**
 * Persists resolved archetype tag to tracked_pages.tags in PostgreSQL.
 * Strict adherence to egress rules: zero gratuitous .returning().
 */
export async function persistPageTag(pageId: string, tag: ScalingArchetype): Promise<void> {
  try {
    await db
      .update(trackedPages)
      .set({
        tags: [tag],
        updatedAt: sql`NOW()`,
      })
      .where(eq(trackedPages.id, pageId));
  } catch (err: any) {
    console.error(`[Page Tagger] Failed to persist tag "${tag}" for page ${pageId}:`, err?.message || err);
  }
}

/**
 * Convenient single-page pipeline: Fetches recent scans, resolves tag (via math or referee),
 * and updates tracked_pages.tags in PostgreSQL.
 */
export async function updateAndPersistPageTag(
  pageId: string,
  options?: { disableReferee?: boolean }
): Promise<ScalingArchetype | null> {
  try {
    const pageRows = await db
      .select({
        id: trackedPages.id,
        displayName: trackedPages.displayName,
        currentResults: trackedPages.currentResults,
        holdStatus: trackedPages.holdStatus,
        lastKnownValidResults: trackedPages.lastKnownValidResults,
        consecutiveZeroScans: trackedPages.consecutiveZeroScans,
      })
      .from(trackedPages)
      .where(eq(trackedPages.id, pageId))
      .limit(1);

    if (pageRows.length === 0) return null;
    const page = pageRows[0];

    const { scanHistory } = await import("@/db/schema");
    const scansRaw = await db
      .select({
        results: scanHistory.results,
        checkedAt: scanHistory.checkedAt,
      })
      .from(scanHistory)
      .where(
        sql`${scanHistory.trackedPageId} = ${pageId} AND ${scanHistory.results} IS NOT NULL`
      )
      .orderBy(sql`${scanHistory.checkedAt} ASC`)
      .limit(15);

    const scans: PageScanInput[] = scansRaw
      .filter((s) => s.results !== null)
      .map((s) => ({ results: s.results!, checkedAt: s.checkedAt }));

    const pageContext: PageContext = {
      holdStatus: page.holdStatus,
      lastKnownValidResults: page.lastKnownValidResults,
      consecutiveZeroScans: page.consecutiveZeroScans,
    };

    const result = await resolvePageTag(page, scans, options, pageContext);
    await persistPageTag(pageId, result.tag);

    return result.tag;
  } catch (err: any) {
    console.error(`[Page Tagger] Error in updateAndPersistPageTag for ${pageId}:`, err?.message || err);
    return null;
  }
}

