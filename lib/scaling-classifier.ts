export type ScalingArchetype =
  | "burst"
  | "aggressive" // synonymous with "scaling"
  | "scaling"
  | "breakout"
  | "stable"
  | "heavy_tester"
  | "descaling"
  | "off_air"
  | "emerging"
  | "moderate"
  | "inactive";

export interface PageContext {
  holdStatus?: string | null;
  lastKnownValidResults?: number | null;
  consecutiveZeroScans?: number | null;
}

export interface ScalingPatternResult {
  archetype: ScalingArchetype;
  label: string;
  shortLabel: string;
  icon: string;
  badgeClass: string;
  pillClass: string;
  description: string;
  confidence: "high" | "medium" | "low";
  netChange: number;
  percentChange: number;
  volatility: number; // Standard deviation of deltas
  velocityPerDay?: number;
  reversionRate?: number;
  bandwidth?: number;
  peakHoldRatio?: number;
  effectiveEpochs?: number;
  isOnHold?: boolean;
  scores?: Record<string, number>;
  doubt?: boolean;
  doubtContenders?: string[];
}

export interface ScanPoint {
  results: number;
  checkedAt?: Date | string | number | null;
}

export interface PageTelemetry {
  current: number;
  oldest: number;
  max: number;
  min: number;
  mean: number;
  netChange: number;
  percentChange: number;
  spanDays: number;
  scansCount: number;
  effectiveEpochs: number;
  isClustered: boolean;
  isOnHold: boolean;
  isPaymentGlitchSanitized: boolean;
  velocityPerDay: number;
  volatility: number;
  bandwidth: number;
  peakHoldRatio: number;
  dropFromPeakRatio: number;
  reversionRate: number; // Sawtooth index
  latestDelta: number;
  latestIntervalHours: number;
  positiveSwings: number;
  negativeSwings: number;
  cv: number; // Coefficient of variation
}

/**
 * Normalizes scan points, sanitizes transient payment/billing glitches,
 * collapses short-interval clustered scans (< 3.5h) into distinct observation epochs,
 * and extracts dimensional telemetry.
 */
export function extractTelemetryFromScans(
  rawPoints: number[],
  rawTimestamps?: (Date | string | number | null)[],
  pageContext?: PageContext | null
): PageTelemetry {
  const n = rawPoints.length;
  if (n === 0) {
    return {
      current: 0,
      oldest: 0,
      max: 0,
      min: 0,
      mean: 0,
      netChange: 0,
      percentChange: 0,
      spanDays: 0,
      scansCount: 0,
      effectiveEpochs: 0,
      isClustered: false,
      isOnHold: Boolean(pageContext?.holdStatus === "on_hold"),
      isPaymentGlitchSanitized: false,
      velocityPerDay: 0,
      volatility: 0,
      bandwidth: 0,
      peakHoldRatio: 0,
      dropFromPeakRatio: 0,
      reversionRate: 0,
      latestDelta: 0,
      latestIntervalHours: 12,
      positiveSwings: 0,
      negativeSwings: 0,
      cv: 0,
    };
  }

  // 1. Sanitize transient ad account / payment zero-glitches in history
  // If a single scan dropped to 0 but was immediately flanked by positive counts,
  // it was a transient Meta payment hold or API glitch, not a deliberate marketing shutdown.
  const points = [...rawPoints];
  let isPaymentGlitchSanitized = false;

  for (let i = 1; i < points.length - 1; i++) {
    if (points[i] === 0 && points[i - 1] > 0 && points[i + 1] > 0) {
      points[i] = points[i - 1];
      isPaymentGlitchSanitized = true;
    }
  }

  // 2. Active Hold Guard: If page is currently on_hold (payment issue / temporary review),
  // trailing zeros are substituted with lastKnownValidResults to avoid false off-air/descaling
  const isOnHold = pageContext?.holdStatus === "on_hold";
  if (isOnHold && pageContext?.lastKnownValidResults) {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i] === 0) {
        points[i] = pageContext.lastKnownValidResults;
      } else {
        break;
      }
    }
  }

  // 3. Time-Coupled Scan Clustering & Observation Epoch Downsampling:
  // If multiple scans occur in quick succession (< 3.5h apart, e.g. manual retries / polling),
  // they belong to the SAME observation epoch and must NOT artificially inflate N or skew velocity.
  const timestamps = rawTimestamps || [];
  const epochPoints: number[] = [];
  const epochTimestamps: number[] = [];
  let effectiveEpochs = 0;
  let isClustered = false;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const ts = timestamps[i] ? new Date(timestamps[i]!).getTime() : null;

    if (epochPoints.length === 0) {
      epochPoints.push(pt);
      epochTimestamps.push(ts || Date.now());
      effectiveEpochs = 1;
    } else {
      const lastTs = epochTimestamps[epochTimestamps.length - 1];
      const gapHours = ts && lastTs ? Math.max(0, (ts - lastTs) / (1000 * 3600)) : 12;

      if (gapHours >= 3.5) {
        // Distinct observation epoch!
        epochPoints.push(pt);
        epochTimestamps.push(ts || lastTs + gapHours * 3600 * 1000);
        effectiveEpochs += Math.min(1.0, gapHours / 6.0);
      } else {
        // Clustered scan within short time: update the latest reading of current epoch, but do not count as a new epoch!
        epochPoints[epochPoints.length - 1] = pt;
        if (ts) epochTimestamps[epochTimestamps.length - 1] = ts;
        effectiveEpochs += gapHours / 6.0; // small fractional observation weight
        isClustered = true;
      }
    }
  }

  // Calculate metrics over time-coupled epochs
  const m = epochPoints.length;
  const current = epochPoints[m - 1];
  const oldest = epochPoints[0];
  const max = Math.max(...epochPoints);
  const min = Math.min(...epochPoints);
  const mean = epochPoints.reduce((sum, p) => sum + p, 0) / m;

  const deltas: number[] = [];
  const intervalsHours: number[] = [];

  for (let i = 1; i < m; i++) {
    deltas.push(epochPoints[i] - epochPoints[i - 1]);
    const diffHours = (epochTimestamps[i] - epochTimestamps[i - 1]) / (1000 * 3600);
    intervalsHours.push(Math.max(0.5, diffHours));
  }

  const totalHours =
    epochTimestamps.length > 1
      ? (epochTimestamps[epochTimestamps.length - 1] - epochTimestamps[0]) / (1000 * 3600)
      : 12;
  const spanDays = Math.max(0.1, totalHours / 24);
  const netChange = current - oldest;
  const percentChange = oldest > 0 ? (netChange / oldest) * 100 : netChange > 0 ? 100 : 0;
  const velocityPerDay = netChange / Math.max(0.5, spanDays);

  const meanDelta = deltas.length > 0 ? deltas.reduce((sum, d) => sum + d, 0) / deltas.length : 0;
  const variance =
    deltas.length > 0
      ? deltas.reduce((sum, d) => sum + Math.pow(d - meanDelta, 2), 0) / deltas.length
      : 0;
  const volatility = Math.sqrt(variance);

  const cv = mean > 0 ? volatility / mean : 0;
  const bandwidth = mean > 0 ? (max - min) / mean : 0;
  const peakHoldRatio = max > 0 ? current / max : 0;
  const dropFromPeakRatio = max > 0 ? (max - current) / max : 0;

  // Swings and Sawtooth Reversion
  const swingThreshold = Math.max(6, Math.round(mean * 0.15));
  let positiveSwings = 0;
  let negativeSwings = 0;
  let signFlips = 0;

  for (let i = 0; i < deltas.length; i++) {
    if (deltas[i] >= swingThreshold) positiveSwings++;
    if (deltas[i] <= -swingThreshold) negativeSwings++;
    if (i > 0 && deltas[i] * deltas[i - 1] < 0) signFlips++;
  }

  const reversionRate = deltas.length > 1 ? signFlips / (deltas.length - 1) : 0;
  const latestDelta = deltas.length > 0 ? deltas[deltas.length - 1] : 0;
  const latestIntervalHours =
    intervalsHours.length > 0 ? intervalsHours[intervalsHours.length - 1] : 12;

  return {
    current,
    oldest,
    max,
    min,
    mean: Math.round(mean),
    netChange,
    percentChange: Math.round(percentChange),
    spanDays: Math.round(spanDays * 10) / 10,
    scansCount: n,
    effectiveEpochs: Math.round(effectiveEpochs * 10) / 10,
    isClustered,
    isOnHold,
    isPaymentGlitchSanitized,
    velocityPerDay: Math.round(velocityPerDay * 10) / 10,
    volatility: Math.round(volatility * 10) / 10,
    bandwidth: Math.round(bandwidth * 100) / 100,
    peakHoldRatio: Math.round(peakHoldRatio * 100) / 100,
    dropFromPeakRatio: Math.round(dropFromPeakRatio * 100) / 100,
    reversionRate: Math.round(reversionRate * 100) / 100,
    latestDelta,
    latestIntervalHours: Math.round(latestIntervalHours * 10) / 10,
    positiveSwings,
    negativeSwings,
    cv: Math.round(cv * 100) / 100,
  };
}

/**
 * Calculates continuous sweet-spot mathematical scores across all archetypes
 * with time-coupled epoch validation and account hold protection.
 */
export function calculateAllArchetypeScores(
  t: PageTelemetry,
  pageContext?: PageContext | null
): {
  scores: Record<string, number>;
  topTag: ScalingArchetype;
  topScore: number;
  runnerTag?: ScalingArchetype;
  runnerScore?: number;
  doubt: boolean;
  doubtContenders: string[];
} {
  // 1. HARD GUARDS
  // A. Inactive / Off-Air
  if (t.current === 0) {
    // If brand is on hold (e.g. payment failure / review), it is NOT off-air yet!
    if (t.isOnHold) {
      return {
        scores: { moderate: 0.7 },
        topTag: "moderate",
        topScore: 0.7,
        doubt: false,
        doubtContenders: [],
      };
    }
    const isOffAir = t.max >= 15;
    const tag: ScalingArchetype = isOffAir ? "off_air" : "inactive";
    return {
      scores: { [tag]: 1.0 },
      topTag: tag,
      topScore: 1.0,
      doubt: false,
      doubtContenders: [],
    };
  }

  // B. TIME-COUPLED EMERGING GUARD:
  // A page must have at least 2.5 effective observation epochs AND at least 1.5 days (36 hours) of history
  // to be tagged with a mature archetype; otherwise multiple scans in a short window would falsely trigger tags.
  if (t.effectiveEpochs < 2.5 || t.spanDays < 1.5 || t.scansCount < 3) {
    return {
      scores: { emerging: 0.95 },
      topTag: "emerging",
      topScore: 0.95,
      doubt: false,
      doubtContenders: [],
    };
  }

  // 2. TAG: BREAKOUT (Sudden high-velocity explosion in the latest 24h-36h interval)
  let scoreBreakout = 0;
  if (t.latestDelta >= 12 && t.latestIntervalHours <= 36 && t.peakHoldRatio >= 0.9) {
    const jumpScore = Math.min(1.0, t.latestDelta / 25);
    const growthScore = Math.min(
      1.0,
      t.latestDelta / Math.max(1, t.current - t.latestDelta) / 0.4
    );
    scoreBreakout = 0.5 * jumpScore + 0.5 * growthScore;
  }

  // 3. TAG: SCALING (Sustained net expansion, positive daily velocity, holding near peak)
  let scoreScaling = 0;
  if (t.netChange > 0 && t.current >= t.oldest) {
    const growthComponent = Math.min(1.0, Math.max(0, t.percentChange / 35));
    const velocityComponent = Math.min(1.0, Math.max(0, t.velocityPerDay / 2.0));
    const peakHoldComponent = Math.max(0, 1.0 - t.dropFromPeakRatio / 0.25);
    scoreScaling =
      0.4 * growthComponent + 0.3 * velocityComponent + 0.3 * peakHoldComponent;
    if (t.netChange < 6) scoreScaling *= 0.5; // penalty for tiny absolute ad changes
  }

  // 4. TAG: BURST (Sawtooth Cycler: rapid launches and rapid pruning)
  let scoreBurst = 0;
  const hasBothSwings = t.positiveSwings >= 1 && t.negativeSwings >= 1;
  const swingIntensity = Math.min(1.0, (t.positiveSwings + t.negativeSwings) / 3);
  const sawtoothComponent = Math.min(1.0, t.reversionRate / 0.4);
  const volComponent = Math.min(1.0, t.volatility / Math.max(6, t.mean * 0.2));
  scoreBurst = 0.35 * swingIntensity + 0.35 * sawtoothComponent + 0.3 * volComponent;
  if (!hasBothSwings && t.positiveSwings === 0) scoreBurst *= 0.25;

  // 5. TAG: STABLE (Evergreen: consistent baseline, narrow bandwidth, low drift)
  let scoreStable = 0;
  if (t.current >= 3) {
    const bwComponent = Math.max(0, 1.0 - t.bandwidth / 0.22);
    const driftComponent = Math.max(0, 1.0 - Math.abs(t.percentChange) / 18);
    const lowVolComponent = Math.max(0, 1.0 - t.volatility / Math.max(3, t.mean * 0.12));
    scoreStable = 0.4 * bwComponent + 0.3 * driftComponent + 0.3 * lowVolComponent;
  }

  // 6. TAG: HEAVY_TESTER (Creative lab / SKU tester: high turnover, fluctuating without scaling copies)
  let scoreHeavyTester = 0;
  if (t.current >= 5 && t.current <= 75) {
    const cvComponent = Math.min(1.0, t.cv / 0.25);
    const boundedDrift = Math.max(0, 1.0 - Math.abs(t.percentChange) / 30);
    const turnoverComponent = Math.min(1.0, t.volatility / 8);
    scoreHeavyTester =
      0.4 * cvComponent + 0.3 * boundedDrift + 0.3 * turnoverComponent;
    if (scoreBurst >= 0.7) scoreHeavyTester *= 0.4; // burst overrides tester if swings are massive
  }

  // 7. TAG: DESCALING (Fatigue / Budget Contraction: heavy collapse from peak or steep negative velocity)
  let scoreDescaling = 0;
  if (t.dropFromPeakRatio >= 0.25 && (t.netChange < 0 || t.latestDelta < 0)) {
    const dropComponent = Math.min(1.0, t.dropFromPeakRatio / 0.45);
    const negativeDriftComponent = Math.min(1.0, Math.max(0, -t.percentChange / 35));
    const negVelComponent = Math.min(1.0, Math.max(0, -t.velocityPerDay / 2.0));
    scoreDescaling =
      0.5 * dropComponent + 0.3 * negativeDriftComponent + 0.2 * negVelComponent;
  }

  // 8. TAG: MODERATE (Healthy baseline activity)
  const scoreModerate = 0.45;

  const scoreMap: Record<string, number> = {
    breakout: Math.round(scoreBreakout * 100) / 100,
    scaling: Math.round(scoreScaling * 100) / 100,
    burst: Math.round(scoreBurst * 100) / 100,
    stable: Math.round(scoreStable * 100) / 100,
    heavy_tester: Math.round(scoreHeavyTester * 100) / 100,
    descaling: Math.round(scoreDescaling * 100) / 100,
    moderate: scoreModerate,
  };

  const sorted = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]);
  const [topTagStr, topScore] = sorted[0];
  const [runnerTagStr, runnerScore] = sorted[1];

  let doubt = false;
  let finalTag: ScalingArchetype = topTagStr as ScalingArchetype;

  if (topScore < 0.52) {
    finalTag = "moderate";
  } else {
    // Doubt condition: runner-up is within 0.10 and both are high-confidence contenders
    if (topScore - runnerScore <= 0.1 && runnerScore >= 0.5) {
      doubt = true;
    }
  }

  return {
    scores: scoreMap,
    topTag: finalTag,
    topScore,
    runnerTag: runnerTagStr as ScalingArchetype,
    runnerScore,
    doubt,
    doubtContenders: doubt ? [topTagStr, runnerTagStr] : [],
  };
}

/**
 * Formats archetype into presentation result
 */
export function formatArchetypeResult(
  archetype: ScalingArchetype,
  telemetry: PageTelemetry,
  confidence: "high" | "medium" | "low",
  scores?: Record<string, number>,
  doubt?: boolean,
  doubtContenders?: string[]
): ScalingPatternResult {
  const meta: Record<
    ScalingArchetype,
    {
      label: string;
      shortLabel: string;
      icon: string;
      badgeClass: string;
      pillClass: string;
      description: string;
    }
  > = {
    breakout: {
      label: "Breakout Surge",
      shortLabel: "Breakout",
      icon: "⚡",
      badgeClass: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
      pillClass: "bg-fuchsia-100 dark:bg-fuchsia-950/60 text-fuchsia-800 dark:text-fuchsia-200",
      description: "Sudden explosive ad surge (+12+ new ads in last 24h). Launching aggressive new test or scaling wave.",
    },
    scaling: {
      label: "Aggressive Scaler",
      shortLabel: "Scaling",
      icon: "🚀",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
      pillClass: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200",
      description: "Rapidly expanding active ads with sustained positive daily velocity and holding near peak volume.",
    },
    aggressive: {
      label: "Aggressive Scaler",
      shortLabel: "Scaling",
      icon: "🚀",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
      pillClass: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200",
      description: "Rapidly expanding active ads with sustained positive daily velocity and holding near peak volume.",
    },
    burst: {
      label: "Burst Scaler",
      shortLabel: "Burst",
      icon: "🔄",
      badgeClass: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
      pillClass: "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200",
      description: "Cycles large ad batches: launches aggressive tests, then rapidly prunes underperforming creatives within 48-72h.",
    },
    stable: {
      label: "Stable Evergreen",
      shortLabel: "Stable",
      icon: "🟢",
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      pillClass: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200",
      description: "Consistent ad volume with minimal fluctuation. Maintaining established profitable evergreen creatives.",
    },
    heavy_tester: {
      label: "Heavy Tester",
      shortLabel: "Tester",
      icon: "🧪",
      badgeClass: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
      pillClass: "bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-200",
      description: "Frequently testing new creatives and SKUs in small batches with high turnover without scaling copies.",
    },
    descaling: {
      label: "Descaling / Pulling Budget",
      shortLabel: "Descaling",
      icon: "⚠️",
      badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
      pillClass: "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300",
      description: "Active ad volume dropped significantly from peak. Brand is reducing spend or pausing campaigns.",
    },
    off_air: {
      label: "Off-Air / Stopped",
      shortLabel: "Off-Air",
      icon: "⛔",
      badgeClass: "bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-600/40",
      pillClass: "bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100",
      description: "Previously running active campaigns (>= 15 ads), now abruptly dropped to 0 active ads.",
    },
    inactive: {
      label: "Inactive / 0 Ads",
      shortLabel: "Inactive",
      icon: "⚫",
      badgeClass: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
      pillClass: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
      description: "0 active ads currently running on Meta Ad Library.",
    },
    emerging: {
      label: "Emerging / New",
      shortLabel: "New",
      icon: "🆕",
      badgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
      pillClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
      description: "Newly tracked brand with under 2.5 effective observation epochs or < 36h span.",
    },
    moderate: {
      label: "Moderate Activity",
      shortLabel: "Moderate",
      icon: "📊",
      badgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
      pillClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
      description: "Moderate active ad volume with steady baseline signals.",
    },
  };

  const selected = meta[archetype] || meta.moderate;

  return {
    archetype,
    ...selected,
    confidence,
    netChange: telemetry.netChange,
    percentChange: telemetry.percentChange,
    volatility: telemetry.volatility,
    velocityPerDay: telemetry.velocityPerDay,
    reversionRate: telemetry.reversionRate,
    bandwidth: telemetry.bandwidth,
    peakHoldRatio: telemetry.peakHoldRatio,
    effectiveEpochs: telemetry.effectiveEpochs,
    isOnHold: telemetry.isOnHold,
    scores,
    doubt,
    doubtContenders,
  };
}

/**
 * Deterministically classifies a brand's scaling behavior based on historical ad scan points.
 * Zero token cost, zero network latency, 100% mathematical sweet-spot equations.
 *
 * @param historyPoints Chronological array of ad counts (oldest -> newest)
 * @param currentResults Current active ad count
 * @param timestamps Optional chronological array of scan timestamps for interval-weighted velocity
 * @param pageContext Optional account hold status and valid results context
 */
export function classifyScalingPattern(
  historyPoints?: number[] | null,
  currentResults?: number | null,
  timestamps?: (Date | string | number | null)[] | null,
  pageContext?: PageContext | null
): ScalingPatternResult {
  const current = typeof currentResults === "number" ? currentResults : 0;
  const rawPoints = historyPoints || [];
  const points =
    rawPoints.length > 0
      ? rawPoints
      : currentResults !== null && currentResults !== undefined
      ? [currentResults]
      : [];

  const telemetry = extractTelemetryFromScans(points, timestamps || undefined, pageContext);

  // Confidence based on effective observation epochs and time span
  const confidence: "high" | "medium" | "low" =
    telemetry.effectiveEpochs >= 5 && telemetry.spanDays >= 3.0
      ? "high"
      : telemetry.effectiveEpochs >= 2.5 && telemetry.spanDays >= 1.5
      ? "medium"
      : "low";

  const { scores, topTag, doubt, doubtContenders } = calculateAllArchetypeScores(telemetry, pageContext);

  return formatArchetypeResult(
    topTag,
    telemetry,
    confidence,
    scores,
    doubt,
    doubtContenders
  );
}
