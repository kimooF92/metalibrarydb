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
      })
      .from(trackedPages)
      .orderBy(desc(trackedPages.currentResults), desc(trackedPages.createdAt), desc(trackedPages.id));

    const pageIds = pages.map((page) => page.id);
    const previousResultsMap: Record<string, number | null> = {};
    const historyPointsMap: Record<string, number[]> = {};
    const windowDeltaMap: Record<string, number> = {};

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

      const recentScans = await db
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
      const previousResults = previousResultsMap[page.id] ?? null;
      const historyPoints = historyPointsMap[page.id] || (page.currentResults !== null ? [page.currentResults] : []);
      const difference = page.currentResults !== null && previousResults !== null
        ? page.currentResults - previousResults
        : null;

      return {
        ...page,
        previousResults,
        difference,
        windowDelta: Object.prototype.hasOwnProperty.call(windowDeltaMap, page.id) ? windowDeltaMap[page.id] : null,
        failureReason: null,
        attempts: 0,
        isCreativeQueued: false,
        historyPoints,
        scalingPattern: classifyScalingPattern(historyPoints, page.currentResults),
        extractedAdCount: 0,
        approxProductCount: null,
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
