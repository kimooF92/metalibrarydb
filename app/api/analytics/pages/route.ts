import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, scanHistory } from "@/db/schema";
import { asc, desc, inArray, isNotNull, lte, sql, and, gte } from "drizzle-orm";
import { classifyScalingPattern } from "@/lib/scaling-classifier";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";

// Analytics needs page-level trends, not the full pages-management payload.
// Keep this projection deliberately small and never join ads/products here.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") ?? "7d";
    const rangeDays = ({ today: 1, "7d": 7, "15d": 15, "30d": 30 } as Record<string, number>)[range] ?? 7;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - rangeDays);

    const pages = await db
      .select({
        id: trackedPages.id,
        url: trackedPages.url,
        displayName: trackedPages.displayName,
        searchType: trackedPages.searchType,
        pageId: trackedPages.pageId,
        currentResults: trackedPages.currentResults,
        lastChecked: trackedPages.lastChecked,
        lastSuccessAt: trackedPages.lastSuccessAt,
        status: trackedPages.status,
        createdAt: trackedPages.createdAt,
        updatedAt: trackedPages.updatedAt,
        country: trackedPages.country,
        landingPage: trackedPages.landingPage,
        notes: trackedPages.notes,
        isWatchlisted: trackedPages.isWatchlisted,
        lastCreativeScan: trackedPages.lastCreativeScan,
        discoveredPagesCount: trackedPages.discoveredPagesCount,
        holdStatus: trackedPages.holdStatus,
        lastKnownValidResults: trackedPages.lastKnownValidResults,
        holdStartedAt: trackedPages.holdStartedAt,
        consecutiveZeroScans: trackedPages.consecutiveZeroScans,
      })
      .from(trackedPages)
      .orderBy(desc(trackedPages.currentResults), desc(trackedPages.createdAt), desc(trackedPages.id));

    const pageIds = pages.map((page) => page.id);
    const previousResultsMap: Record<string, number | null> = {};
    const historyPointsMap: Record<string, number[]> = {};
    const windowDeltaMap: Record<string, number> = {};
    let recentScans: Array<{ trackedPageId: string; results: number | null; rank: number }> = [];

    if (pageIds.length > 0) {
      const rankedScans = db
        .select({
          trackedPageId: scanHistory.trackedPageId,
          results: scanHistory.results,
          rank: sql<number>`row_number() over (partition by ${scanHistory.trackedPageId} order by ${scanHistory.checkedAt} desc)`.as("rank"),
        })
        .from(scanHistory)
        .where(and(inArray(scanHistory.trackedPageId, pageIds), isNotNull(scanHistory.results)))
        .as("ranked_scans");

      recentScans = await db
        .select({
          trackedPageId: rankedScans.trackedPageId,
          results: rankedScans.results,
          rank: rankedScans.rank,
        })
        .from(rankedScans)
        .where(lte(rankedScans.rank, 8));

      for (const scan of recentScans) {
        if (Number(scan.rank) === 2) previousResultsMap[scan.trackedPageId] = scan.results;
        if (scan.results !== null) {
          (historyPointsMap[scan.trackedPageId] ||= []).push(scan.results);
        }
      }
      for (const pageId of Object.keys(historyPointsMap)) historyPointsMap[pageId].reverse();

      // Sanitize sparklines so temporary 0-glitches don't break visual trends:
      for (const p of pages) {
        if (historyPointsMap[p.id]) {
          historyPointsMap[p.id] = historyPointsMap[p.id].map((v, i, arr) => {
            if (v === 0) {
              const prevNonZero = arr.slice(0, i).reverse().find((x) => x > 0);
              const nextNonZero = arr.slice(i + 1).find((x) => x > 0);
              // Case A: Glitch in the past — flanked by positive counts
              if (prevNonZero && nextNonZero) return prevNonZero;
              // Case B: Ongoing hold — trailing zeros while page is on hold
              if (p.holdStatus === "on_hold" && prevNonZero && !nextNonZero) {
                return p.lastKnownValidResults ?? prevNonZero;
              }
            }
            return v;
          });
        }
      }

      const windowScans = await db
        .select({ trackedPageId: scanHistory.trackedPageId, results: scanHistory.results })
        .from(scanHistory)
        .where(and(
          inArray(scanHistory.trackedPageId, pageIds),
          gte(scanHistory.checkedAt, windowStart),
          isNotNull(scanHistory.results),
        ))
        .orderBy(asc(scanHistory.checkedAt));

      const windowResultsMap: Record<string, { first: number; last: number }> = {};
      for (const scan of windowScans) {
        if (scan.results === null) continue;
        const result = Number(scan.results);
        windowResultsMap[scan.trackedPageId] ||= { first: result, last: result };
        windowResultsMap[scan.trackedPageId].last = result;
      }
      for (const [pageId, result] of Object.entries(windowResultsMap)) {
        windowDeltaMap[pageId] = result.last - result.first;
      }
    }

    const data = pages.map((page) => {
      let previousResults = previousResultsMap[page.id] ?? null;
      if (page.currentResults && page.currentResults > 0 && previousResults === 0) {
        const lastNonZero = recentScans
          .filter((s) => s.trackedPageId === page.id && (s.results ?? 0) > 0)
          .sort((a, b) => Number(a.rank) - Number(b.rank))[1]?.results;
        if (lastNonZero !== undefined) {
          previousResults = lastNonZero;
        }
      }
      const historyPoints = historyPointsMap[page.id] || (page.currentResults !== null ? [page.currentResults] : []);
      const difference = page.currentResults !== null && previousResults !== null
        ? page.currentResults - previousResults
        : null;

      const effectiveResults = page.holdStatus === "on_hold"
        ? (page.lastKnownValidResults ?? page.currentResults)
        : page.currentResults;

      return {
        ...page,
        previousResults,
        difference,
        windowDelta: Object.prototype.hasOwnProperty.call(windowDeltaMap, page.id) ? windowDeltaMap[page.id] : null,
        failureReason: null,
        attempts: 0,
        isCreativeQueued: false,
        historyPoints,
        scalingPattern: classifyScalingPattern(historyPoints, effectiveResults),
        extractedAdCount: 0,
        approxProductCount: null,
        holdStatus: page.holdStatus ?? "active",
        lastKnownValidResults: page.lastKnownValidResults ?? null,
        holdStartedAt: page.holdStartedAt ? page.holdStartedAt.toISOString() : null,
        consecutiveZeroScans: page.consecutiveZeroScans ?? 0,
      };
    });

    return NextResponse.json(
      { data, pagination: { page: 1, limit: data.length, total: data.length, totalPages: 1 } },
      { headers: { "Cache-Control": PRIVATE_READ_CACHE_CONTROL, Vary: PRIVATE_AUTH_VARY } },
    );
  } catch (error) {
    console.error("Error in GET /api/analytics/pages:", error);
    return NextResponse.json({ error: "Failed to fetch analytics pages" }, { status: 500 });
  }
}
