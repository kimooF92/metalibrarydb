/**
 * Ad Count Doubt Detector & Span/Jev Decision Referee
 *
 * $0 Token Rule: Evaluates ad count scans with zero-cost deterministic heuristics.
 * If the ad count is clean and consistent (95%+ of scans), Span/Jev is NEVER called ($0 cost).
 *
 * When genuine ambiguity is detected:
 * 1. Sudden massive jump (+20 or more new ads)
 * 2. Sudden drop to 0 on an established active brand (prev >= 10)
 * 3. Multiple conflicting candidate numbers on page
 * 4. Micro-brand explosion (<= 5 ads jumping to >= 15 ads)
 * 5. Dramatic cliff drop (>= 50% drop from >= 30 ads)
 * 6. Match without authentic Meta '~' prefix
 * 7. Plausibility anomaly (>= 5,000 ads or 14-16 digit IDs)
 * 8. Search suggestion / related advertiser fallback detected
 *
 * When doubt is triggered, invokes Span (respan/span-02) with Jev (typesafe/jev-1.13)
 * backup via OpenRouter Decisions API to arbitrate the true active ad count.
 */

import { callJevDecisions, JevChoiceAnswer, DEFAULT_DECISION_MODEL } from "./typesafe-jev";

export interface AdCountCandidate {
  count: number;
  hasTilde: boolean;
  context: string;
  keyword: string;
}

export type AdCountDoubtType =
  | "spike_20_plus"
  | "drop_to_zero"
  | "multiple_candidates"
  | "micro_explosion"
  | "cliff_drop"
  | "missing_tilde"
  | "out_of_bounds"
  | "suggested_search";

export interface AdCountDoubtResult {
  hasDoubt: boolean;
  reasons: string[];
  doubtTypes: AdCountDoubtType[];
  candidates: AdCountCandidate[];
}

export interface AdCountRefereeParams {
  scannedCount: number | null;
  previousCount?: number | null;
  bodyText?: string | null;
  brandName?: string | null;
  url?: string | null;
  hasTilde?: boolean;
}

export interface AdCountRefereeResult {
  resolvedCount: number | null;
  modelUsed: string;
  confidence: number;
  wasRefereed: boolean;
  doubtReasons: string[];
}

/**
 * Harvests all plausible ad count numbers and surrounding context from Meta Ad Library page text.
 */
export function harvestAdCountCandidates(bodyText?: string | null): AdCountCandidate[] {
  if (!bodyText || bodyText.length < 5) return [];

  const candidatesMap = new Map<number, AdCountCandidate>();

  // Match "~209 results", "190 résultats", "381 ads", "25 active ads", etc.
  const candidateRegex =
    /(~)?\s*(\d[\d,\.\s\u00A0\u202F]{0,10})\s*(?:active\s+)?(results?|résultats?|resultados?|ergebnisse?|ads?|publicités?|anuncios?|anzeigen?)/gi;

  let match: RegExpExecArray | null;
  while ((match = candidateRegex.exec(bodyText)) !== null) {
    const isTilde = Boolean(match[1]);
    const rawNumberStr = match[2]
      .replace(/[\s\u00A0\u202F]/g, "")
      .replace(/[,.]/g, "");

    const count = parseInt(rawNumberStr, 10);

    // Filter out obvious noise: 0 (unless explicit), extreme IDs (>= 1,000,000), or NaN
    if (isNaN(count) || count < 0 || count >= 1_000_000) continue;

    // Grab 35 chars of context before and after
    const startIdx = Math.max(0, match.index - 35);
    const endIdx = Math.min(bodyText.length, match.index + match[0].length + 35);
    const snippet = bodyText
      .slice(startIdx, endIdx)
      .replace(/\s+/g, " ")
      .trim();

    // Prefer tilde-prefixed match if count already exists in map
    const existing = candidatesMap.get(count);
    if (!existing || (!existing.hasTilde && isTilde)) {
      candidatesMap.set(count, {
        count,
        hasTilde: isTilde,
        context: snippet,
        keyword: match[3]?.toLowerCase() || "results",
      });
    }
  }

  // Sort: tilde first, then descending
  return Array.from(candidatesMap.values()).sort((a, b) => {
    if (a.hasTilde !== b.hasTilde) return a.hasTilde ? -1 : 1;
    return b.count - a.count;
  });
}

/**
 * Deterministically checks for ad count doubt ($0 token cost).
 * Evaluates 8 distinct ambiguity vectors including sudden +20 spikes.
 */
export function detectAdCountDoubt(params: AdCountRefereeParams): AdCountDoubtResult {
  const reasons: string[] = [];
  const doubtTypes: AdCountDoubtType[] = [];
  const candidates = harvestAdCountCandidates(params.bodyText);

  const { scannedCount, previousCount, bodyText } = params;

  // 1. Core Rule: Sudden Massive Jump (+20 or more new ads)
  if (
    scannedCount !== null &&
    previousCount !== null &&
    previousCount !== undefined &&
    previousCount >= 0
  ) {
    const diff = scannedCount - previousCount;
    if (diff >= 20) {
      reasons.push(
        `Sudden massive surge of +${diff} new ads (jumped from ${previousCount} to ${scannedCount})`
      );
      doubtTypes.push("spike_20_plus");
    }
  }

  // 2. Sudden Drop to Zero on Established Brand (prev >= 10, new = 0)
  if (
    scannedCount === 0 &&
    previousCount !== null &&
    previousCount !== undefined &&
    previousCount >= 10
  ) {
    reasons.push(
      `Established active brand (${previousCount} ads) suddenly reported 0 ads (possible rate-limit or empty container)`
    );
    doubtTypes.push("drop_to_zero");
  }

  // 3. Multiple Conflicting Candidates in DOM
  const uniqueCandidateCounts = Array.from(new Set(candidates.map((c) => c.count)));
  if (uniqueCandidateCounts.length > 1) {
    // Only flag if difference between candidates is significant (>= 5)
    const maxCand = Math.max(...uniqueCandidateCounts);
    const minCand = Math.min(...uniqueCandidateCounts);
    if (maxCand - minCand >= 5) {
      reasons.push(
        `Multiple conflicting ad count candidates in DOM (${uniqueCandidateCounts.join(", ")})`
      );
      doubtTypes.push("multiple_candidates");
    }
  }

  // 4. Micro-Brand Explosive Jump (baseline <= 5 ads, jumps to >= 15 ads)
  if (
    scannedCount !== null &&
    previousCount !== null &&
    previousCount !== undefined &&
    previousCount <= 5 &&
    scannedCount >= 15
  ) {
    if (!doubtTypes.includes("spike_20_plus")) {
      reasons.push(
        `Micro-brand (${previousCount} ads) multiplied into ${scannedCount} ads (possible broad keyword match)`
      );
      doubtTypes.push("micro_explosion");
    }
  }

  // 5. Dramatic Cliff Drop (>= 50% drop on high-volume page >= 30 ads)
  if (
    scannedCount !== null &&
    previousCount !== null &&
    previousCount !== undefined &&
    previousCount >= 30 &&
    scannedCount > 0 &&
    scannedCount <= Math.round(previousCount * 0.45)
  ) {
    const drop = previousCount - scannedCount;
    const dropPercent = Math.round((drop / previousCount) * 100);
    reasons.push(
      `Dramatic cliff drop: lost ${drop} ads (${dropPercent}% drop from ${previousCount} to ${scannedCount})`
    );
    doubtTypes.push("cliff_drop");
  }

  // 6. Missing Authentic Meta Tilde Prefix
  if (params.hasTilde === false && scannedCount !== null && scannedCount > 0) {
    reasons.push(
      `Ad count (${scannedCount}) was matched without the authentic Meta '~' prefix`
    );
    doubtTypes.push("missing_tilde");
  }

  // 7. Plausibility / Out-of-Bounds Anomaly (>= 5,000 ads)
  if (scannedCount !== null && (scannedCount >= 5_000 || scannedCount >= 100_000_000)) {
    reasons.push(
      `Ad count (${scannedCount}) exceeds plausible threshold for tracking (likely Page ID or global directory leak)`
    );
    doubtTypes.push("out_of_bounds");
  }

  // 8. Meta Fallback / Search Suggestion Leak
  if (bodyText) {
    const hasSuggestedText =
      /(?:showing results for|did you mean|results for instead|explore ads from related advertisers|voir les r[eé]sultats pour|mostrar resultados de)/i.test(
        bodyText
      );
    if (hasSuggestedText) {
      reasons.push("Page contains Meta search suggestion / fallback brand redirect");
      doubtTypes.push("suggested_search");
    }
  }

  return {
    hasDoubt: reasons.length > 0,
    reasons,
    doubtTypes,
    candidates,
  };
}

/**
 * Arbitrates ambiguous ad counts using Span (respan/span-02) primary with Jev (typesafe/jev-1.13) backup.
 *
 * $0 Rule: If doubt detector found no doubt, returns scannedCount immediately.
 */
export async function resolveAdCountWithSpanJev(
  params: AdCountRefereeParams
): Promise<AdCountRefereeResult> {
  const doubt = detectAdCountDoubt(params);

  // Fast path: No doubt detected -> $0 tokens, instant return
  if (!doubt.hasDoubt) {
    return {
      resolvedCount: params.scannedCount,
      modelUsed: "deterministic_pass",
      confidence: 1.0,
      wasRefereed: false,
      doubtReasons: [],
    };
  }

  const { candidates } = doubt;
  const brandName = params.brandName || "Tracked Brand";

  // Heuristic 1: If there is an authentic '~' candidate and all other candidates lack '~',
  // and the authentic tilde candidate is within normal variation (< 20 change), trust it directly ($0 tokens)!
  const tildeCandidates = candidates.filter((c) => c.hasTilde);
  if (tildeCandidates.length === 1) {
    const tildeCount = tildeCandidates[0].count;
    const diffFromPrev =
      params.previousCount !== null && params.previousCount !== undefined
        ? Math.abs(tildeCount - params.previousCount)
        : 0;

    if (diffFromPrev < 20) {
      return {
        resolvedCount: tildeCount,
        modelUsed: "single_tilde_heuristic",
        confidence: 0.95,
        wasRefereed: true,
        doubtReasons: doubt.reasons,
      };
    }
  }

  // Build compact criteria map for Span/Jev
  const criteriaMap: Record<string, string> = {};

  const candidatePool = candidates.slice(0, 5);
  for (const c of candidatePool) {
    const key = String(c.count);
    const tag = c.hasTilde ? "Official ~ counter" : "Un-prefixed count";
    criteriaMap[key] = `${tag}: "${c.context.slice(0, 50)}"`;
  }

  // Add previous count as a baseline option if available
  if (params.previousCount !== null && params.previousCount !== undefined) {
    const prevKey = `keep_${params.previousCount}`;
    criteriaMap[prevKey] = `Preserve previous baseline (${params.previousCount} ads) — scan is corrupted/unclear`;
  }

  // Add zero option if drop to zero is plausible
  if (!criteriaMap["0"]) {
    criteriaMap["0"] = "0 active ads (confirmed zero / brand paused)";
  }

  const candidateSummaries = candidatePool.map((c) => ({
    count: c.count,
    has_tilde: c.hasTilde,
    snippet: c.context,
  }));

  try {
    const response = await callJevDecisions(
      {
        brand_name: brandName,
        previous_ad_count: params.previousCount ?? "none",
        unverified_scanned_count: params.scannedCount,
        doubt_reasons: doubt.reasons.join("; "),
        candidates_found: candidateSummaries,
      },
      {
        verified_ad_count: {
          type: "choice",
          instructions: `Determine the authentic active ad count for brand '${brandName}' on Meta Ad Library. Disregard page IDs, phone numbers, delivery prices, or suggested competitor advertisers. Prioritize counts marked with '~' that belong to '${brandName}'. If all candidates are corrupted or from unrelated searches, choose to preserve the previous baseline.`,
          criteria: criteriaMap,
        },
      },
      { timeoutMs: 6000 }
    );

    const answer = response?.answers?.verified_ad_count as JevChoiceAnswer | undefined;
    if (answer?.type === "choice" && answer.choice) {
      let finalCount: number | null = null;
      if (answer.choice.startsWith("keep_")) {
        finalCount = params.previousCount ?? params.scannedCount;
      } else {
        const parsed = parseInt(answer.choice, 10);
        finalCount = !isNaN(parsed) ? parsed : params.scannedCount;
      }

      return {
        resolvedCount: finalCount,
        modelUsed: response?.model || DEFAULT_DECISION_MODEL,
        confidence: answer.confidence ?? 0.9,
        wasRefereed: true,
        doubtReasons: doubt.reasons,
      };
    }
  } catch (err: any) {
    console.warn("[Ad Count Referee] Span/Jev call notice:", err?.message || err);
  }

  // Fallback if Span/Jev is offline or unavailable:
  // 1. If an authentic '~' candidate exists, prefer it above all un-prefixed candidates
  if (tildeCandidates.length > 0) {
    return {
      resolvedCount: tildeCandidates[0].count,
      modelUsed: "heuristic_tilde_fallback",
      confidence: 0.85,
      wasRefereed: true,
      doubtReasons: doubt.reasons,
    };
  }

  // 2. If the doubt was an extreme spike (+20) with no tilde and no tilde candidate in DOM, reject false spike and preserve baseline
  if (doubt.doubtTypes.includes("spike_20_plus") && !params.hasTilde && params.previousCount !== null && params.previousCount !== undefined) {
    return {
      resolvedCount: params.previousCount,
      modelUsed: "heuristic_spike_rejection",
      confidence: 0.75,
      wasRefereed: true,
      doubtReasons: doubt.reasons,
    };
  }

  return {
    resolvedCount: params.scannedCount,
    modelUsed: "fallback_as_is",
    confidence: 0.6,
    wasRefereed: true,
    doubtReasons: doubt.reasons,
  };
}
