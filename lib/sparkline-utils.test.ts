import { describe, it } from "node:test";
import assert from "node:assert";
import {
  calculateSparklineGeometry,
  calculateCurvedSparklineGeometry,
  getSparklineTrend,
  appendLiveHistoryPoint,
  computeDeltaDifference,
  filterTransientZeros,
  downsampleToKeyPeaks,
  SPARKLINE_COLORS,
} from "./sparkline-utils";

describe("sparkline-utils", () => {
  describe("calculateSparklineGeometry", () => {
    it("returns null for null, empty, or single point arrays", () => {
      assert.strictEqual(calculateSparklineGeometry(null), null);
      assert.strictEqual(calculateSparklineGeometry([]), null);
      assert.strictEqual(calculateSparklineGeometry([10]), null);
    });

    it("calculates correct geometry and polyline string for 2+ points", () => {
      const points = [10, 20, 30];
      const geo = calculateSparklineGeometry(points, 52, 18, 2);

      assert.notStrictEqual(geo, null);
      if (!geo) return;

      assert.strictEqual(geo.min, 10);
      assert.strictEqual(geo.max, 30);
      assert.strictEqual(geo.range, 20);
      assert.strictEqual(geo.coords.length, 3);
      assert.strictEqual(typeof geo.polylineStr, "string");
      assert.strictEqual(geo.polylineStr.split(" ").length, 3);
      assert.strictEqual(geo.lastPoint.str, geo.coords[2].str);
    });

    it("handles identical points (zero variance) without divide-by-zero", () => {
      const points = [15, 15, 15];
      const geo = calculateSparklineGeometry(points);

      assert.notStrictEqual(geo, null);
      if (!geo) return;
      assert.strictEqual(geo.min, 15);
      assert.strictEqual(geo.max, 15);
      assert.strictEqual(geo.range, 1); // Fallback range to prevent NaN
      geo.coords.forEach((c) => {
        assert.strictEqual(Number.isNaN(c.x), false);
        assert.strictEqual(Number.isNaN(c.y), false);
      });
    });
  });

  describe("getSparklineTrend", () => {
    it("identifies upward trend with emerald color", () => {
      const trend = getSparklineTrend(5);
      assert.strictEqual(trend.isUp, true);
      assert.strictEqual(trend.isDown, false);
      assert.strictEqual(trend.strokeColor, SPARKLINE_COLORS.up);
    });

    it("identifies downward trend with rose color", () => {
      const trend = getSparklineTrend(-3);
      assert.strictEqual(trend.isUp, false);
      assert.strictEqual(trend.isDown, true);
      assert.strictEqual(trend.strokeColor, SPARKLINE_COLORS.down);
    });

    it("identifies neutral/zero trend with indigo color", () => {
      const trend = getSparklineTrend(0);
      assert.strictEqual(trend.isNeutral, true);
      assert.strictEqual(trend.strokeColor, SPARKLINE_COLORS.neutral);

      const nullTrend = getSparklineTrend(null);
      assert.strictEqual(nullTrend.isNeutral, true);
      assert.strictEqual(nullTrend.strokeColor, SPARKLINE_COLORS.neutral);
    });
  });

  describe("appendLiveHistoryPoint", () => {
    it("appends point and bounds history to maxPoints window", () => {
      const initial = [1, 2, 3, 4, 5];
      const result = appendLiveHistoryPoint(initial, 6, 5);

      assert.strictEqual(result.length, 5);
      assert.deepStrictEqual(result, [2, 3, 4, 5, 6]);
    });

    it("handles null or undefined history points safely", () => {
      const result = appendLiveHistoryPoint(null, 10);
      assert.deepStrictEqual(result, [10]);
    });

    it("ignores non-finite new points", () => {
      const initial = [1, 2, 3];
      const result = appendLiveHistoryPoint(initial, NaN);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
  });

  describe("computeDeltaDifference", () => {
    it("computes difference accurately", () => {
      assert.strictEqual(computeDeltaDifference(15, 10), 5);
      assert.strictEqual(computeDeltaDifference(8, 12), -4);
      assert.strictEqual(computeDeltaDifference(10, 10), 0);
    });

    it("returns fallback when values are missing", () => {
      assert.strictEqual(computeDeltaDifference(null, 10, 99), 99);
      assert.strictEqual(computeDeltaDifference(15, undefined, -1), -1);
    });
  });

  describe("filterTransientZeros", () => {
    it("interpolates isolated transient zeros surrounded by positive counts", () => {
      const raw = [100, 110, 0, 110, 120];
      const cleaned = filterTransientZeros(raw);
      assert.deepStrictEqual(cleaned, [100, 110, 110, 110, 120]);
    });

    it("preserves genuine trailing zeros (went dark/on hold)", () => {
      const wentDark = [100, 50, 0, 0, 0];
      const cleaned = filterTransientZeros(wentDark);
      assert.deepStrictEqual(cleaned, [100, 50, 0, 0, 0]);
    });
  });

  describe("downsampleToKeyPeaks", () => {
    it("downsamples long series to targetCount preserving endpoints and peaks", () => {
      const points = [10, 12, 14, 50, 48, 20, 15, 30, 28, 60];
      const downsampled = downsampleToKeyPeaks(points, 4);

      assert.strictEqual(downsampled.length, 4);
      assert.strictEqual(downsampled[0], 10); // First
      assert.strictEqual(downsampled[3], 60); // Last
      // Middle peaks should capture the major spike
      assert.strictEqual(downsampled.includes(50), true);
    });

    it("returns original array if points length <= targetCount", () => {
      const points = [10, 20, 30];
      assert.deepStrictEqual(downsampleToKeyPeaks(points, 4), [10, 20, 30]);
    });
  });

  describe("calculateCurvedSparklineGeometry", () => {
    it("calculates smooth curved path and area string for valid points", () => {
      const points = [10, 20, 50, 30, 70];
      const geo = calculateCurvedSparklineGeometry(points, 64, 18, 2, 4);

      assert.notStrictEqual(geo, null);
      if (!geo) return;
      assert.strictEqual(geo.coords.length, 4);
      assert.strictEqual(geo.pathStr.startsWith("M"), true);
      assert.strictEqual(geo.pathStr.includes("C"), true);
      assert.strictEqual(geo.areaStr.endsWith("Z"), true);
    });

    it("returns null for insufficient points", () => {
      assert.strictEqual(calculateCurvedSparklineGeometry([10]), null);
      assert.strictEqual(calculateCurvedSparklineGeometry(null), null);
    });
  });
});


