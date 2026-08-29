export type ScalingArchetype =
  | "burst"
  | "aggressive"
  | "stable"
  | "heavy_tester"
  | "descaling"
  | "emerging";

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

  // 1. If we have fewer than 3 historical scans, classify as Emerging
  if (!historyPoints || historyPoints.length < 3) {
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

  const points = historyPoints;
  const n = points.length;
  const oldest = points[0];
  const latest = points[n - 1];
  const maxPoint = Math.max(...points);
  const minPoint = Math.min(...points);

  // 2. Compute Scan-to-Scan Deltas
  const deltas: number[] = [];
  for (let i = 1; i < n; i++) {
    deltas.push(points[i] - points[i - 1]);
  }

  const netChange = latest - oldest;
  const baseline = oldest > 0 ? oldest : 1;
  const percentChange = Math.round((netChange / baseline) * 100);

  // Mean delta
  const meanDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;

  // Standard Deviation of Deltas (Volatility)
  const variance =
    deltas.reduce((sum, d) => sum + Math.pow(d - meanDelta, 2), 0) / deltas.length;
  const volatility = Math.round(Math.sqrt(variance));

  // Count positive and negative swings (>= 15 ads change)
  const largePositiveSwings = deltas.filter((d) => d >= 15).length;
  const largeNegativeSwings = deltas.filter((d) => d <= -15).length;

  // Confidence based on number of observation points
  const confidence: "high" | "medium" | "low" =
    n >= 6 ? "high" : n >= 4 ? "medium" : "low";

  // 3. Archetype Decision Tree

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

  // B. Descaling: Significant ad drop (> 25% drop from peak or net negative >= 30%)
  const dropFromPeakPercent = maxPoint > 0 ? ((maxPoint - latest) / maxPoint) * 100 : 0;
  if (dropFromPeakPercent >= 25 || percentChange <= -25 || (latest < 10 && oldest >= 30)) {
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

  // C. Aggressive Scaler: Consistent upward ad count growth (> +25% net growth and positive recent deltas)
  if (percentChange >= 25 && netChange >= 10 && latest > oldest) {
    return {
      archetype: "aggressive",
      label: "Aggressive Scaler",
      shortLabel: "Scaling",
      icon: "🚀",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
      pillClass: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200",
      description: "Rapidly expanding active ads (+25%+ growth). Increasing spend behind winning products.",
      confidence,
      netChange,
      percentChange,
      volatility,
    };
  }

  // D. Heavy Tester: Low active ads, but frequent micro-fluctuations (testing without scaling)
  if (volatility >= 8 && Math.abs(percentChange) <= 20 && current < 40) {
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

  // E. Stable Evergreen: Steady ad count (fluctuation within +/- 15%)
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
