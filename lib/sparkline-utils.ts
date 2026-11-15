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

export interface CurvedSparklineGeometry {
  width: number;
  height: number;
  padding: number;
  pathStr: string;
  areaStr: string;
  coords: Array<{ x: number; y: number; str: string }>;
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
 * Filters out isolated transient zero scans caused by Meta API rate-limiting/glitches
 * when surrounded by active positive ad counts. Preserves true zero-states (e.g. paused/went dark).
 */
export function filterTransientZeros(points?: readonly number[] | null): number[] {
  if (!points || points.length === 0) return [];
  const clean: number[] = [];
  const len = points.length;

  for (let i = 0; i < len; i++) {
    const val = points[i];
    if (val === 0) {
      let prevNonZero: number | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (points[j] > 0) {
          prevNonZero = points[j];
          break;
        }
      }
      let nextNonZero: number | null = null;
      for (let j = i + 1; j < len; j++) {
        if (points[j] > 0) {
          nextNonZero = points[j];
          break;
        }
      }
      // If it's a momentary single or dual 0 between active counts, interpolate smoothly
      if (prevNonZero !== null && nextNonZero !== null) {
        clean.push(Math.round((prevNonZero + nextNonZero) / 2));
        continue;
      }
    }
    clean.push(val);
  }
  return clean;
}

/**
 * Downsamples an arbitrary time-series array down to 3-5 key milestone points/peaks.
 * Preserves the baseline start, extreme inflection peaks & valleys, and the current end count.
 */
export function downsampleToKeyPeaks(
  points?: readonly number[] | null,
  targetCount = 4
): number[] {
  if (!points || points.length <= targetCount) {
    return points ? [...points] : [];
  }
  if (targetCount < 2) return [points[points.length - 1]];

  const result: number[] = [];
  const first = points[0];
  const last = points[points.length - 1];
  result.push(first);

  const intermediateCount = targetCount - 2;
  const bucketSize = (points.length - 2) / intermediateCount;

  for (let b = 0; b < intermediateCount; b++) {
    const startIdx = Math.floor(1 + b * bucketSize);
    const endIdx = Math.min(points.length - 2, Math.floor(1 + (b + 1) * bucketSize));
    let bestVal = points[startIdx];
    let maxDist = -1;

    for (let i = startIdx; i <= endIdx; i++) {
      const val = points[i];
      // Pick the point with greatest deviation from baseline slope (prominent peak or trough)
      const ratio = i / (points.length - 1);
      const expected = first + ratio * (last - first);
      const dist = Math.abs(val - expected);
      if (dist > maxDist) {
        maxDist = dist;
        bestVal = val;
      }
    }
    result.push(bestVal);
  }

  result.push(last);
  return result;
}

/**
 * Generates smooth SVG Catmull-Rom / cubic Bézier curves and closed area fill paths.
 */
export function generateCurvedPath(
  coords: Array<{ x: number; y: number }>,
  height = DEFAULT_SPARKLINE_HEIGHT
): { pathStr: string; areaStr: string } {
  if (coords.length < 2) return { pathStr: "", areaStr: "" };

  if (coords.length === 2) {
    const path = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)} L ${coords[1].x.toFixed(1)},${coords[1].y.toFixed(1)}`;
    const area = `${path} L ${coords[1].x.toFixed(1)},${height} L ${coords[0].x.toFixed(1)},${height} Z`;
    return { pathStr: path, areaStr: area };
  }

  let d = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = i > 0 ? coords[i - 1] : coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = i < coords.length - 2 ? coords[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${d} L ${last.x.toFixed(1)},${height} L ${first.x.toFixed(1)},${height} Z`;

  return { pathStr: d, areaStr: area };
}

/**
 * Calculates curved SVG geometry with smoothed Bézier path and gradient area.
 */
export function calculateCurvedSparklineGeometry(
  points?: readonly number[] | null,
  width = DEFAULT_SPARKLINE_WIDTH,
  height = DEFAULT_SPARKLINE_HEIGHT,
  padding = DEFAULT_SPARKLINE_PADDING,
  targetPeaks = 4
): CurvedSparklineGeometry | null {
  if (!points || points.length < 2) return null;

  // Clean transient glitches and downsample to key peaks
  const cleaned = filterTransientZeros(points);
  const downsampled = downsampleToKeyPeaks(cleaned, targetPeaks);
  if (downsampled.length < 2) return null;

  const min = Math.min(...downsampled);
  const max = Math.max(...downsampled);
  const range = max - min || 1;

  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;
  const total = downsampled.length;

  const coords = downsampled.map((v, i) => {
    const x = padding + (i / (total - 1)) * drawableWidth;
    const y = padding + (1 - (v - min) / range) * drawableHeight;
    const str = `${x.toFixed(1)},${y.toFixed(1)}`;
    return { x, y, str };
  });

  const { pathStr, areaStr } = generateCurvedPath(coords, height);
  const lastPoint = coords[coords.length - 1];

  return {
    width,
    height,
    padding,
    pathStr,
    areaStr,
    coords,
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

