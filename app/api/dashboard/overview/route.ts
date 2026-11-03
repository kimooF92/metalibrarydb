import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  trackedPages,
  ads,
  scrapedProducts,
  discoveredPages,
  discoveryRuns,
  queue,
  workerState,
  scanHistory,
  activityNotifications,
} from "@/db/schema";
import { eq, and, sql, desc, asc, inArray, isNotNull, ne } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { getCached, setCached } from "@/lib/cache-service";
import { classifyScalingPattern } from "@/lib/scaling-classifier";
import { calculateWinnerScore } from "@/lib/winner-score";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const OVERVIEW_CACHE_TTL_SECONDS = 45; // 45 seconds cache

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    const cacheKey = `cache:dashboard:overview:${activeWorkspace.id}`;
    if (!forceRefresh) {
      const cached = await getCached<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
            Vary: PRIVATE_AUTH_VARY,
          },
        });
      }
    }

    // Partition-bounded 14-day window avoids full table history scans on scan_history
    const differenceSql = sql<number>`(
      SELECT s.difference
      FROM scan_history s
      WHERE s.tracked_page_id = ${trackedPages.id}
        AND s.checked_at >= NOW() - INTERVAL '14 days'
      ORDER BY s.checked_at DESC
      LIMIT 1
    )`;

    // Run parallel lean queries scoped to active workspace
    const [
      brandStatsRows,
      productStatsRows,
      adsStatsRows,
      scalingProductsRows,
      hotOfferProductsRows,
      freshBreakoutRows,
      topCategoriesRows,
      workerStateRows,
      queueStatsRows,
      darkBrandRows,
      discoveryStatsRows,
      recentDiscoveredRows,
      recentNotificationRows,
      scalingBrandsRows,
      activeScanningRows,
      products24hStatsRows,
      products24hNicheRows,
      descalingBrandsRows,
    ] = await Promise.all([
      // 1. Brand KPIs
      db
        .select({
          totalBrands: sql<number>`count(*)`.mapWith(Number),
          avgAds: sql<number>`coalesce(round(avg(case when ${trackedPages.currentResults} is not null and ${trackedPages.currentResults} > 0 then ${trackedPages.currentResults} end)), 0)`.mapWith(Number),
          maxAds: sql<number>`coalesce(max(${trackedPages.currentResults}), 0)`.mapWith(Number),
          scanningCount: sql<number>`count(case when ${trackedPages.status} = 'scanning' then 1 end)`.mapWith(Number),
          failedCount: sql<number>`count(case when ${trackedPages.status} = 'failed' then 1 end)`.mapWith(Number),
          unclearCount: sql<number>`count(case when ${trackedPages.status} = 'unclear' then 1 end)`.mapWith(Number),
          onHoldCount: sql<number>`count(case when ${trackedPages.holdStatus} = 'on_hold' or ${trackedPages.consecutiveZeroScans} >= 3 then 1 end)`.mapWith(Number),
          completedCount: sql<number>`count(case when ${trackedPages.status} = 'success' then 1 end)`.mapWith(Number),
        })
        .from(trackedPages)
        .where(eq(trackedPages.workspaceId, activeWorkspace.id)),

      // 2. Product KPIs
      db
        .select({
          totalProducts: sql<number>`count(*)`.mapWith(Number),
          successfulProducts: sql<number>`count(case when ${scrapedProducts.scrapeStatus} = 'success' then 1 end)`.mapWith(Number),
          withOffersCount: sql<number>`count(case when ${scrapedProducts.discountOrOffer} is not null and ${scrapedProducts.discountOrOffer} != '' then 1 end)`.mapWith(Number),
          favoritesCount: sql<number>`count(case when ${scrapedProducts.isFavorite} = true then 1 end)`.mapWith(Number),
        })
        .from(scrapedProducts)
        .where(eq(scrapedProducts.workspaceId, activeWorkspace.id)),

      // 3. Ad & Breakout Stats
      db
        .select({
          totalAds: sql<number>`count(*)`.mapWith(Number),
          activeAds: sql<number>`count(case when ${ads.isArchived} = false or ${ads.isArchived} is null then 1 end)`.mapWith(Number),
        })
        .from(ads)
        .innerJoin(trackedPages, eq(ads.pageId, trackedPages.pageId))
        .where(eq(trackedPages.workspaceId, activeWorkspace.id)),

      // 4. Top Scaling Products (E-Commerce Products with active ad scaling)
      db
        .select({
          id: scrapedProducts.id,
          url: scrapedProducts.url,
          domain: scrapedProducts.domain,
          pageId: scrapedProducts.pageId,
          title: sql<string>`left(${scrapedProducts.title}, 100)`,
          currentPrice: scrapedProducts.currentPrice,
          originalPrice: scrapedProducts.originalPrice,
          currency: scrapedProducts.currency,
          discountOrOffer: scrapedProducts.discountOrOffer,
          mainImageUrl: scrapedProducts.mainImageUrl,
          storePlatform: scrapedProducts.storePlatform,
          category: scrapedProducts.category,
          activeAdsCount: sql<number>`(
            SELECT count(*)
            FROM ${ads}
            WHERE ${ads.productId} = ${scrapedProducts.id}
              AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
          )`.mapWith(Number),
          brandDisplayName: sql<string>`(
            SELECT coalesce(${trackedPages.displayName}, ${scrapedProducts.domain})
            FROM ${trackedPages}
            WHERE ${trackedPages.pageId} = ${scrapedProducts.pageId}
            LIMIT 1
          )`,
        })
        .from(scrapedProducts)
        .where(
          and(
            eq(scrapedProducts.workspaceId, activeWorkspace.id),
            eq(scrapedProducts.scrapeStatus, "success"),
            isNotNull(scrapedProducts.mainImageUrl),
            ne(scrapedProducts.mainImageUrl, "")
          )
        )
        .orderBy(
          desc(sql`(
            SELECT count(*)
            FROM ${ads}
            WHERE ${ads.productId} = ${scrapedProducts.id}
              AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
          )`),
          desc(scrapedProducts.updatedAt)
        )
        .limit(4),

      // 5. Hot Offers & Tier Bundles (products with detected special bundle offers)
      db
        .select({
          id: scrapedProducts.id,
          url: scrapedProducts.url,
          domain: scrapedProducts.domain,
          title: sql<string>`left(${scrapedProducts.title}, 90)`,
          currentPrice: scrapedProducts.currentPrice,
          currency: scrapedProducts.currency,
          discountOrOffer: scrapedProducts.discountOrOffer,
          mainImageUrl: scrapedProducts.mainImageUrl,
          storePlatform: scrapedProducts.storePlatform,
          category: scrapedProducts.category,
          brandDisplayName: sql<string>`(
            SELECT coalesce(${trackedPages.displayName}, ${scrapedProducts.domain})
            FROM ${trackedPages}
            WHERE ${trackedPages.pageId} = ${scrapedProducts.pageId}
            LIMIT 1
          )`,
        })
        .from(scrapedProducts)
        .where(
          and(
            eq(scrapedProducts.workspaceId, activeWorkspace.id),
            eq(scrapedProducts.scrapeStatus, "success"),
            isNotNull(scrapedProducts.discountOrOffer),
            ne(scrapedProducts.discountOrOffer, "")
          )
        )
        .orderBy(desc(scrapedProducts.updatedAt))
        .limit(4),

      // 6. Fresh Breakouts (unique winner products with active ads)
      db
        .select({
          productId: scrapedProducts.id,
          productTitle: sql<string>`left(${scrapedProducts.title}, 100)`,
          productPrice: scrapedProducts.currentPrice,
          productCurrency: scrapedProducts.currency,
          productImageUrl: scrapedProducts.mainImageUrl,
          storePlatform: scrapedProducts.storePlatform,
          brandDisplayName: sql<string>`coalesce(${trackedPages.displayName}, ${scrapedProducts.domain})`,
          pageId: scrapedProducts.pageId,
          adArchiveId: sql<string>`max(${ads.adArchiveId})`,
          adId: sql<string>`max(${ads.id}::text)`,
          title: sql<string>`left(max(${ads.title}), 100)`,
          mediaType: sql<string>`case when count(case when ${ads.mediaType} = 'video' then 1 end) > 0 then 'video' when count(case when ${ads.mediaType} = 'carousel' then 1 end) > 0 then 'carousel' else 'image' end`,
          thumbnailUrl: sql<string | null>`coalesce(max(${ads.thumbnailUrl}), ${scrapedProducts.mainImageUrl})`,
          startedRunningOn: sql<Date | null>`max(${ads.startedRunningOn})`,
          firstSeenAt: sql<Date | null>`min(${ads.firstSeenAt})`,
          lastSeenAt: sql<Date | null>`max(${ads.lastSeenAt})`,
          activeAdsCount: sql<number>`count(distinct ${ads.id})`.mapWith(Number),
        })
        .from(scrapedProducts)
        .innerJoin(ads, eq(ads.productId, scrapedProducts.id))
        .leftJoin(trackedPages, eq(trackedPages.pageId, scrapedProducts.pageId))
        .where(
          and(
            eq(scrapedProducts.workspaceId, activeWorkspace.id),
            sql`(${ads.isArchived} = false or ${ads.isArchived} is null)`,
            sql`(${scrapedProducts.mainImageUrl} is not null and ${scrapedProducts.mainImageUrl} != '')`
          )
        )
        .groupBy(scrapedProducts.id, trackedPages.displayName)
        .orderBy(
          desc(sql`max(coalesce(${ads.startedRunningOn}, ${ads.firstSeenAt}))`),
          desc(sql`count(distinct ${ads.id})`)
        )
        .limit(5),

      // 7. Category Distribution (top 5)
      db
        .select({
          category: scrapedProducts.category,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(scrapedProducts)
        .where(
          and(
            eq(scrapedProducts.workspaceId, activeWorkspace.id),
            isNotNull(scrapedProducts.category),
            ne(scrapedProducts.category, "")
          )
        )
        .groupBy(scrapedProducts.category)
        .orderBy(desc(sql`count(*)`))
        .limit(5),

      // 8. Worker State
      db
        .select({
          id: workerState.id,
          isPaused: workerState.isPaused,
          scansThisHour: workerState.scansThisHour,
          scansToday: workerState.scansToday,
          consecutiveFailures: workerState.consecutiveFailures,
          lastFailureAt: workerState.lastFailureAt,
          circuitBreakerTripped: workerState.circuitBreakerTripped,
          updatedAt: workerState.updatedAt,
        })
        .from(workerState)
        .where(eq(workerState.id, 1)),

      // 9. Queue Health Stats
      db
        .select({
          status: queue.status,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(queue)
        .where(eq(queue.workspaceId, activeWorkspace.id))
        .groupBy(queue.status),

      // 10. Dark / High-Risk Brands (consecutive 0s, on hold, failed)
      db
        .select({
          id: trackedPages.id,
          displayName: trackedPages.displayName,
          currentResults: trackedPages.currentResults,
          lastKnownValidResults: trackedPages.lastKnownValidResults,
          consecutiveZeroScans: trackedPages.consecutiveZeroScans,
          holdStatus: trackedPages.holdStatus,
          status: trackedPages.status,
          lastChecked: trackedPages.lastChecked,
          country: trackedPages.country,
        })
        .from(trackedPages)
        .where(
          and(
            eq(trackedPages.workspaceId, activeWorkspace.id),
            sql`(${trackedPages.consecutiveZeroScans} >= 2 or ${trackedPages.holdStatus} = 'on_hold' or ${trackedPages.status} in ('failed', 'unclear'))`
          )
        )
        .orderBy(desc(trackedPages.consecutiveZeroScans), desc(trackedPages.updatedAt))
        .limit(4),

      // 11. Discovery Stats
      db
        .select({
          discoveredCount: sql<number>`count(case when ${discoveredPages.status} = 'discovered' then 1 end)`.mapWith(Number),
          totalCount: sql<number>`count(*)`.mapWith(Number),
        })
        .from(discoveredPages)
        .innerJoin(discoveryRuns, eq(discoveredPages.runId, discoveryRuns.id))
        .where(eq(discoveryRuns.workspaceId, activeWorkspace.id)),

      // 12. Recent Discovered Competitors
      db
        .select({
          id: discoveredPages.id,
          pageId: discoveredPages.pageId,
          displayName: discoveredPages.displayName,
          matchingAdCount: discoveredPages.matchingAdCount,
          previewTitle: sql<string>`left(${discoveredPages.previewProductTitle}, 80)`,
          previewImage: discoveredPages.previewProductImage,
          previewPrice: discoveredPages.previewProductPrice,
          status: discoveredPages.status,
        })
        .from(discoveredPages)
        .innerJoin(discoveryRuns, eq(discoveredPages.runId, discoveryRuns.id))
        .where(
          and(
            eq(discoveryRuns.workspaceId, activeWorkspace.id),
            eq(discoveredPages.status, "discovered")
          )
        )
        .orderBy(desc(discoveredPages.matchingAdCount), desc(discoveredPages.id))
        .limit(3),

      // 13. Recent Activity Notifications
      db
        .select({
          id: activityNotifications.id,
          type: activityNotifications.type,
          title: activityNotifications.title,
          message: activityNotifications.message,
          severity: activityNotifications.severity,
          createdAt: activityNotifications.createdAt,
        })
        .from(activityNotifications)
        .where(eq(activityNotifications.workspaceId, activeWorkspace.id))
        .orderBy(desc(activityNotifications.createdAt))
        .limit(4),

      // 14. Scaling Brands Leaderboard
      db
        .select({
          id: trackedPages.id,
          displayName: trackedPages.displayName,
          currentResults: trackedPages.currentResults,
          difference: differenceSql,
          profilePicUrl: trackedPages.profilePicUrl,
          lastChecked: trackedPages.lastChecked,
          status: trackedPages.status,
          country: trackedPages.country,
          holdStatus: trackedPages.holdStatus,
          lastKnownValidResults: trackedPages.lastKnownValidResults,
          consecutiveZeroScans: trackedPages.consecutiveZeroScans,
        })
        .from(trackedPages)
        .where(
          and(
            eq(trackedPages.workspaceId, activeWorkspace.id),
            sql`${trackedPages.currentResults} > 0`
          )
        )
        .orderBy(desc(differenceSql), desc(trackedPages.currentResults))
        .limit(5),

      // 15. Real Active Scanning IDs (eliminates dummy placeholder strings)
      db
        .select({ id: trackedPages.id })
        .from(trackedPages)
        .where(
          and(
            eq(trackedPages.workspaceId, activeWorkspace.id),
            eq(trackedPages.status, "scanning")
          )
        )
        .limit(10),

      // 16. Products Added in Last 24 Hours (Summary KPIs)
      db
        .select({
          totalAdded: sql<number>`count(*)`.mapWith(Number),
          withOffersCount: sql<number>`count(case when ${scrapedProducts.discountOrOffer} is not null and ${scrapedProducts.discountOrOffer} != '' then 1 end)`.mapWith(Number),
          topPlatform: sql<string>`coalesce(mode() within group (order by ${scrapedProducts.storePlatform}), 'Shopify')`,
          avgPrice: sql<number>`coalesce(round(avg(nullif(substring(regexp_replace(${scrapedProducts.currentPrice}, ',', '.', 'g') from '([0-9]+(\\.[0-9]+)?)'), '')::numeric), 0), 0)`.mapWith(Number),
        })
        .from(scrapedProducts)
        .where(
          and(
            eq(scrapedProducts.workspaceId, activeWorkspace.id),
            sql`${scrapedProducts.createdAt} >= NOW() - INTERVAL '24 hours'`
          )
        ),

      // 17. Products Added in Last 24 Hours (Niche Breakdown)
      db
        .select({
          category: scrapedProducts.category,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(scrapedProducts)
        .where(
          and(
            eq(scrapedProducts.workspaceId, activeWorkspace.id),
            sql`${scrapedProducts.createdAt} >= NOW() - INTERVAL '24 hours'`,
            isNotNull(scrapedProducts.category),
            ne(scrapedProducts.category, "")
          )
        )
        .groupBy(scrapedProducts.category)
        .orderBy(desc(sql`count(*)`))
        .limit(4),

      // 18. Descaling Brands Leaderboard (brands cutting ads or dropping in results)
      db
        .select({
          id: trackedPages.id,
          displayName: trackedPages.displayName,
          currentResults: trackedPages.currentResults,
          difference: differenceSql,
          profilePicUrl: trackedPages.profilePicUrl,
          lastChecked: trackedPages.lastChecked,
          status: trackedPages.status,
          country: trackedPages.country,
          holdStatus: trackedPages.holdStatus,
          lastKnownValidResults: trackedPages.lastKnownValidResults,
          consecutiveZeroScans: trackedPages.consecutiveZeroScans,
        })
        .from(trackedPages)
        .where(
          and(
            eq(trackedPages.workspaceId, activeWorkspace.id),
            sql`(${differenceSql} < 0 or ${trackedPages.consecutiveZeroScans} >= 2 or ${trackedPages.holdStatus} = 'on_hold')`
          )
        )
        .orderBy(asc(differenceSql), desc(trackedPages.consecutiveZeroScans))
        .limit(5),
    ]);

    // Format fresh breakouts with winner scoring metrics (Top 5 Unique Products)
    const freshBreakouts = freshBreakoutRows
      .map((row) => {
        const metrics = calculateWinnerScore({
          startedRunningOn: row.startedRunningOn,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
          duplicationCount: Math.max(1, row.activeAdsCount),
          productCreativeCount: row.activeAdsCount,
          isActive: true,
          isArchived: false,
          mediaType: row.mediaType,
        });
        return {
          id: row.adId || row.productId,
          adArchiveId: row.adArchiveId,
          pageId: row.pageId,
          pageName: row.brandDisplayName,
          brandDisplayName: row.brandDisplayName,
          mediaType: row.mediaType,
          thumbnailUrl: row.thumbnailUrl || row.productImageUrl,
          startedRunningOn: row.startedRunningOn ? new Date(row.startedRunningOn).toISOString() : null,
          firstSeenAt: row.firstSeenAt ? new Date(row.firstSeenAt).toISOString() : null,
          daysRunning: metrics.daysRunning,
          winnerScore: metrics.winnerScore,
          winnerTier: metrics.winnerTier,
          isBreakout: metrics.isBreakout,
          breakoutTier: metrics.breakoutTier,
          productId: row.productId,
          productTitle: row.productTitle,
          productPrice: row.productPrice,
          productCurrency: row.productCurrency,
          productImageUrl: row.productImageUrl,
          storePlatform: row.storePlatform,
          activeAdsCount: row.activeAdsCount,
        };
      })
      .slice(0, 5);

    // Resolve 14-day history points for scaling and descaling brands to generate sparklines & patterns
    const velocityPageIds = Array.from(
      new Set([
        ...scalingBrandsRows.map((b) => b.id),
        ...descalingBrandsRows.map((b) => b.id),
      ])
    );
    const historyMap: Record<string, number[]> = {};

    if (velocityPageIds.length > 0) {
      const historyRows = await db
        .select({
          trackedPageId: scanHistory.trackedPageId,
          results: scanHistory.results,
        })
        .from(scanHistory)
        .where(
          and(
            inArray(scanHistory.trackedPageId, velocityPageIds),
            sql`${scanHistory.checkedAt} >= NOW() - INTERVAL '14 days'`
          )
        )
        .orderBy(asc(scanHistory.checkedAt));

      for (const row of historyRows) {
        if (row.results !== null) {
          if (!historyMap[row.trackedPageId]) {
            historyMap[row.trackedPageId] = [];
          }
          historyMap[row.trackedPageId].push(row.results);
        }
      }
    }

    const mapBrandWithPattern = (brand: (typeof scalingBrandsRows)[0]) => {
      const points = historyMap[brand.id] || (brand.currentResults ? [brand.currentResults] : [0]);
      const pattern = classifyScalingPattern(
        points,
        brand.currentResults,
        null,
        {
          holdStatus: brand.holdStatus,
          lastKnownValidResults: brand.lastKnownValidResults,
          consecutiveZeroScans: brand.consecutiveZeroScans,
        }
      );
      return {
        ...brand,
        difference: brand.difference ?? 0,
        historyPoints: points,
        scalingPattern: pattern,
      };
    };

    const scalingBrandsWithPattern = scalingBrandsRows.map(mapBrandWithPattern);
    const descalingBrandsWithPattern = descalingBrandsRows.map(mapBrandWithPattern);

    // Compute category distribution percentages (overall)
    const totalCategorized = topCategoriesRows.reduce((acc, c) => acc + (c.count || 0), 0);
    const categoriesWithPct = topCategoriesRows.map((cat) => ({
      category: cat.category || "Uncategorized",
      count: cat.count,
      percentage: totalCategorized > 0 ? Math.round((cat.count / totalCategorized) * 100) : 0,
    }));

    // Compute 24h Inflow & Niche Breakdown
    const stats24h = products24hStatsRows[0] || {
      totalAdded: 0,
      withOffersCount: 0,
      topPlatform: "Shopify",
      avgPrice: 0,
    };
    const total24hCategorized = products24hNicheRows.reduce((acc, c) => acc + (c.count || 0), 0);
    const nicheShare24h = products24hNicheRows.map((cat) => ({
      category: cat.category || "Uncategorized",
      count: cat.count,
      percentage: total24hCategorized > 0 ? Math.round((cat.count / total24hCategorized) * 100) : 0,
    }));

    // Queue counts map
    const queueMap: Record<string, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    for (const q of queueStatsRows) {
      if (q.status && q.status in queueMap) {
        queueMap[q.status] = q.count;
      }
    }

    const scanOperations = {
      scansToday: workerStateRows[0]?.scansToday ?? 0,
      scansThisHour: workerStateRows[0]?.scansThisHour ?? 0,
      isPaused: workerStateRows[0]?.isPaused ?? false,
      circuitBreakerTripped: workerStateRows[0]?.circuitBreakerTripped ?? false,
      totalBrands: brandStatsRows[0]?.totalBrands ?? 0,
      completedCount: brandStatsRows[0]?.completedCount ?? 0,
      scanningCount: brandStatsRows[0]?.scanningCount ?? 0,
      failedCount: brandStatsRows[0]?.failedCount ?? 0,
      onHoldCount: brandStatsRows[0]?.onHoldCount ?? 0,
      successRate:
        (brandStatsRows[0]?.completedCount || 0) + (brandStatsRows[0]?.failedCount || 0) > 0
          ? Math.round(
              ((brandStatsRows[0]?.completedCount || 0) /
                ((brandStatsRows[0]?.completedCount || 0) + (brandStatsRows[0]?.failedCount || 0))) *
                100
            )
          : 100,
      queuePending: queueMap.pending,
      queueRunning: queueMap.running,
    };

    const responsePayload = {
      kpi: {
        totalBrands: brandStatsRows[0]?.totalBrands ?? 0,
        avgAds: brandStatsRows[0]?.avgAds ?? 0,
        maxAds: brandStatsRows[0]?.maxAds ?? 0,
        scanningCount: brandStatsRows[0]?.scanningCount ?? 0,
        failedCount: brandStatsRows[0]?.failedCount ?? 0,
        completedCount: brandStatsRows[0]?.completedCount ?? 0,
        onHoldCount: brandStatsRows[0]?.onHoldCount ?? 0,
        totalProducts: productStatsRows[0]?.totalProducts ?? 0,
        successfulProducts: productStatsRows[0]?.successfulProducts ?? 0,
        withOffersCount: productStatsRows[0]?.withOffersCount ?? 0,
        favoritesCount: productStatsRows[0]?.favoritesCount ?? 0,
        totalAds: adsStatsRows[0]?.totalAds ?? 0,
        activeAds: adsStatsRows[0]?.activeAds ?? 0,
      },
      scalingProducts: scalingProductsRows,
      hotOffers: hotOfferProductsRows,
      freshBreakouts,
      scalingBrands: scalingBrandsWithPattern,
      descalingBrands: descalingBrandsWithPattern,
      inflow24h: {
        totalAdded: stats24h.totalAdded,
        withOffersCount: stats24h.withOffersCount,
        offerPercentage:
          stats24h.totalAdded > 0
            ? Math.round((stats24h.withOffersCount / stats24h.totalAdded) * 100)
            : 0,
        topPlatform: stats24h.topPlatform,
        avgPrice: stats24h.avgPrice,
        nicheShare: nicheShare24h,
      },
      scanOperations,
      darkBrands: darkBrandRows,
      topCategories: categoriesWithPct,
      worker: workerStateRows[0] || {
        isPaused: false,
        scansThisHour: 0,
        scansToday: 0,
        consecutiveFailures: 0,
        lastFailureAt: null,
        circuitBreakerTripped: false,
      },
      queue: queueMap,
      discovery: {
        discoveredCount: discoveryStatsRows[0]?.discoveredCount ?? 0,
        totalCount: discoveryStatsRows[0]?.totalCount ?? 0,
        recent: recentDiscoveredRows,
      },
      recentActivity: recentNotificationRows,
      activeScanningPageIds: (activeScanningRows || []).map((r) => r.id),
    };

    // Cache in Redis/memory
    await setCached(cacheKey, responsePayload, OVERVIEW_CACHE_TTL_SECONDS);

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
        Vary: PRIVATE_AUTH_VARY,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/dashboard/overview:", error);
    return NextResponse.json(
      { error: "Failed to generate dashboard overview" },
      { status: 500 }
    );
  }
}
