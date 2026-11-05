/**
 * Pure SVG Sparkline Calculations & Time-Series History Utilities
 *
 * 100% deterministic, zero React / DOM dependencies.
 * Computes SVG polyline points, trend colors, coordinate transforms,
 * and time-series rolling window points.
 */

export interface SparklineGeometry {
  width: number;
  height: number;
  padding: number;
  coords: Array<{ x: number; y: number; str: string }>;
  polylineStr: string;
  lastPoint: { x: number; y: number; str: string };
  min: number;
  max: number;
  range: number;
}

export interface SparklineTrend {
  isUp: boolean;
  isDown: boolean;
  isNeutral: boolean;
  strokeColor: string;
}

export const SPARKLINE_COLORS = {
  up: "#10b981", // Emerald-500
  down: "#f43f5e", // Rose-500
  neutral: "#818cf8", // Indigo-400
} as const;

export const DEFAULT_SPARKLINE_WIDTH = 52;
export const DEFAULT_SPARKLINE_HEIGHT = 18;
export const DEFAULT_SPARKLINE_PADDING = 2;
export const DEFAULT_MAX_HISTORY_POINTS = 14;

/**
 * Calculates SVG polyline coordinates and geometry bounds from a series of numeric points.
 * Returns null if points are missing or fewer than 2 data points exist.
 */
export function calculateSparklineGeometry(
  points?: readonly number[] | null,
  width = DEFAULT_SPARKLINE_WIDTH,
  height = DEFAULT_SPARKLINE_HEIGHT,
  padding = DEFAULT_SPARKLINE_PADDING
): SparklineGeometry | null {
  if (!points || points.length < 2) {
    return null;
  }

  // Filter out non-finite numbers safely
  const validPoints = points.filter((p) => Number.isFinite(p));
  if (validPoints.length < 2) {
    return null;
  }

  const min = Math.min(...validPoints);
  const max = Math.max(...validPoints);
  const range = max - min || 1;

  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;
  const total = validPoints.length;

  const coords = validPoints.map((v, i) => {
    const x = padding + (i / (total - 1)) * drawableWidth;
    const y = padding + (1 - (v - min) / range) * drawableHeight;
    const str = `${x.toFixed(1)},${y.toFixed(1)}`;
    return { x, y, str };
  });

  const polylineStr = coords.map((c) => c.str).join(" ");
  const lastPoint = coords[coords.length - 1];

  return {
    width,
    height,
    padding,
    coords,
    polylineStr,
    lastPoint,
    min,
    max,
    range,
  };
}

/**
 * Determines trend state and stroke color based on difference delta.
 */
export function getSparklineTrend(
  difference?: number | null
): SparklineTrend {
  const diff = difference ?? 0;
  const isUp = diff > 0;
  const isDown = diff < 0;
  const isNeutral = diff === 0;

  const strokeColor = isUp
    ? SPARKLINE_COLORS.up
    : isDown
    ? SPARKLINE_COLORS.down
    : SPARKLINE_COLORS.neutral;

  return {
    isUp,
    isDown,
    isNeutral,
    strokeColor,
  };
}

/**
 * Appends a new data point to a rolling history array, keeping at most maxPoints.
 * Used during live WebSocket updates to instantly animate sparklines without re-fetching.
 */
export function appendLiveHistoryPoint(
  historyPoints: readonly number[] | null | undefined,
  newPoint: number | null | undefined,
  maxPoints = DEFAULT_MAX_HISTORY_POINTS
): number[] {
  if (newPoint === null || newPoint === undefined || !Number.isFinite(newPoint)) {
    return historyPoints ? [...historyPoints] : [];
  }

  const base = Array.isArray(historyPoints)
    ? historyPoints.filter((p) => Number.isFinite(p))
    : [];

  const sliceIndex = Math.max(0, base.length - (maxPoints - 1));
  return [...base.slice(sliceIndex), newPoint];
}

/**
 * Computes difference delta safely. If old results is missing, returns fallback difference.
 */
export function computeDeltaDifference(
  newResults: number | null | undefined,
  oldResults: number | null | undefined,
  fallbackDifference: number | null = 0
): number | null {
  if (
    newResults !== null &&
    newResults !== undefined &&
    oldResults !== null &&
    oldResults !== undefined &&
    Number.isFinite(newResults) &&
    Number.isFinite(oldResults)
  ) {
    return newResults - oldResults;
  }

  return fallbackDifference;
}

