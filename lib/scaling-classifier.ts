export type ScalingArchetype =
  | "burst"
  | "aggressive"
  | "stable"
  | "heavy_tester"
  | "descaling"
  | "emerging"
  | "inactive";

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
}

/**
 * Deterministically classifies a brand's scaling behavior based on historical ad scan points.
 * Zero token cost, zero network latency, 100% mathematical.
 *
 * @param historyPoints Chronological array of ad counts (oldest -> newest, e.g. [120, 135, 150, 170, 190])
 * @param currentResults Current active ad count
 */
export function classifyScalingPattern(
  historyPoints?: number[] | null,
  currentResults?: number | null
): ScalingPatternResult {
  const current = typeof currentResults === "number" ? currentResults : 0;
  const rawPoints = historyPoints || [];
  const points =
    rawPoints.length > 0
      ? rawPoints
      : currentResults !== null && currentResults !== undefined
      ? [currentResults]
      : [];
  const n = points.length;

  // 1. INACTIVE GUARD (Immediate check)
  // If brand currently has 0 active ads, NEVER flag as Stable or Scaling
  if (current === 0) {
    const maxHistorical = points.length > 0 ? Math.max(...points) : 0;
    if (maxHistorical >= 15) {
      // Was previously running real volume, now pulled to 0 -> Descaling / Off-Air
      return {
        archetype: "descaling",
        label: "Descaling / Off-Air",
        shortLabel: "Off-Air",
        icon: "⚠️",
        badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
        pillClass: "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300",
        description: "Previously running active campaigns, now reduced to 0 active ads.",
        confidence: n >= 3 ? "high" : "medium",
        netChange: -maxHistorical,
        percentChange: -100,
        volatility: 0,
      };
    }
    return {
      archetype: "inactive",
      label: "Inactive / 0 Ads",
      shortLabel: "Inactive",
      icon: "⚫",
      badgeClass: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
      pillClass: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
      description: "0 active ads currently running on Meta Ad Library.",
      confidence: n >= 3 ? "high" : "low",
      netChange: 0,
      percentChange: 0,
      volatility: 0,
    };
  }

  // 2. If we have fewer than 3 historical scans, classify as Emerging
  if (n < 3) {
    return {
      archetype: "emerging",
      label: "Emerging / New",
      shortLabel: "New",
      icon: "🆕",
      badgeClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
      pillClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
      description: "Newly tracked brand with under 3 scan history snapshots.",
      confidence: "low",
      netChange: 0,
      percentChange: 0,
      volatility: 0,
    };
  }

  const oldest = points[0];
  const latest = points[n - 1];
  const maxPoint = Math.max(...points);

  // 3. Compute Scan-to-Scan Deltas & Mathematical Metrics
  const deltas: number[] = [];
  for (let i = 1; i < n; i++) {
    deltas.push(points[i] - points[i - 1]);
  }

  const netChange = latest - oldest;
  const baseline = oldest > 0 ? oldest : 1;
  const percentChange = Math.round((netChange / baseline) * 100);

  const meanDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
  const variance =
    deltas.reduce((sum, d) => sum + Math.pow(d - meanDelta, 2), 0) / deltas.length;
  const volatility = Math.round(Math.sqrt(variance));

  const meanAdCount = points.reduce((sum, p) => sum + p, 0) / n;
  const coefficientOfVariation = meanAdCount > 0 ? volatility / meanAdCount : 0;

  // Count positive and negative swings (>= 15 ads change)
  const largePositiveSwings = deltas.filter((d) => d >= 15).length;
  const largeNegativeSwings = deltas.filter((d) => d <= -15).length;

  // Confidence based on number of observation points
  const confidence: "high" | "medium" | "low" =
    n >= 6 ? "high" : n >= 4 ? "medium" : "low";

  // 4. ARCHETYPE DECISION TREE

  // A. Burst Scaler: Both large positive expansions AND large negative contractions
  // Classic pattern: Launches 50+ test ads, prunes 40 losers in 48-72h cycles (e.g. Lemdina)
  if (largePositiveSwings >= 1 && largeNegativeSwings >= 1 && volatility >= 18) {
    return {
      archetype: "burst",
      label: "Burst Scaler",
      shortLabel: "Burst",
      icon: "🔄",
      badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      pillClass: "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300",
      description: "Cycles large ad batches: launches aggressive tests, then rapidly prunes underperforming creatives.",
      confidence,
      netChange,
      percentChange,
      volatility,
    };
  }

  // B. Descaling: Sustained ad reduction (net negative >= 25% with downward trend, or major collapse from peak >= 40%)
  const dropFromPeakPercent = maxPoint > 0 ? ((maxPoint - current) / maxPoint) * 100 : 0;
  if (
    (percentChange <= -25 && netChange <= -10) ||
    (dropFromPeakPercent >= 40 && netChange < 0) ||
    (current < 10 && maxPoint >= 30)
  ) {
    return {
      archetype: "descaling",
      label: "Descaling / Pulling Budget",
      shortLabel: "Descaling",
      icon: "⚠️",
      badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      pillClass: "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300",
      description: "Active ad volume dropped significantly from peak. Brand is reducing spend or pausing campaigns.",
      confidence,
      netChange,
      percentChange,
      volatility,
    };
  }

  // C. Aggressive Scaler: Substantial upward growth (>= +30% growth AND >= 15 net ads, or >= 50% growth)
  const aggressiveAbsThreshold = Math.max(15, Math.round(baseline * 0.25));
  if (
    (percentChange >= 30 && netChange >= aggressiveAbsThreshold && current > oldest) ||
    (percentChange >= 50 && netChange >= 10 && current > oldest)
  ) {
    return {
      archetype: "aggressive",
      label: "Aggressive Scaler",
      shortLabel: "Scaling",
      icon: "🚀",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
      pillClass: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200",
      description: "Rapidly expanding active ads (+30%+ growth). Increasing spend behind winning products.",
      confidence,
      netChange,
      percentChange,
      volatility,
    };
  }

  // D. Heavy Tester: High coefficient of variation with low net drift (testing creatives without scaling copies)
  if (
    (coefficientOfVariation >= 0.25 || volatility >= 8) &&
    Math.abs(percentChange) <= 25 &&
    current < 60
  ) {
    return {
      archetype: "heavy_tester",
      label: "Heavy Tester",
      shortLabel: "Tester",
      icon: "🧪",
      badgeClass: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
      pillClass: "bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300",
      description: "Frequently testing new creatives and SKUs in small batches without scaling copies.",
      confidence,
      netChange,
      percentChange,
      volatility,
    };
  }

  // E. Explicit Stable Evergreen: Steady volume with low fluctuation (>= 5 ads, within +/- 15%)
  if (current >= 5 && Math.abs(percentChange) <= 15 && dropFromPeakPercent <= 15) {
    return {
      archetype: "stable",
      label: "Stable Evergreen",
      shortLabel: "Stable",
      icon: "🟢",
      badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      pillClass: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300",
      description: "Consistent ad volume with minimal fluctuation. Maintaining established profitable evergreen creatives.",
      confidence,
      netChange,
      percentChange,
      volatility,
    };
  }

  // F. Fallback for unclassified / low-volume activity: Moderate Activity
  return {
    archetype: "emerging",
    label: "Moderate Activity",
    shortLabel: "Moderate",
    icon: "📊",
    badgeClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    pillClass: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    description: "Moderate ad volume with mixed or steady baseline signals.",
    confidence: "low",
    netChange,
    percentChange,
    volatility,
  };
}
