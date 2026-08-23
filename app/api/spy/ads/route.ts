import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages, scrapedProducts } from "@/db/schema";
import { eq, ilike, gte, lte, and, sql, desc, asc, or, not, inArray } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { syncApifyRuns } from "@/lib/apify-sync";
import { calculateWinnerScore } from "@/lib/winner-score";
import { enrichAdsWithProductClusters } from "@/lib/product-clustering";
import { enrichAdsWithCreativeClusters, getDeduplicatedCreativeHeroAds } from "@/lib/creative-clustering";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);

    const trackedPageId = searchParams.get("trackedPageId");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const minDaysRunning = parseInt(searchParams.get("minDaysRunning") || "0", 10);
    const minDuplications = parseInt(searchParams.get("minDuplications") || "1", 10);
    const minWinnerScore = parseInt(searchParams.get("minWinnerScore") || "0", 10);
    const mediaType = searchParams.get("mediaType");
    const status = searchParams.get("status");
    const ctaText = searchParams.get("ctaText");
    const isWatchlisted = searchParams.get("isWatchlisted") === "true";
    const excludePageIdsParam = searchParams.get("excludePageIds");
    const excludePageIds = excludePageIdsParam
      ? excludePageIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const smartPreset = searchParams.get("smartPreset");
    let minProductCreatives = parseInt(searchParams.get("minProductCreatives") || "0", 10);
    const productKey = searchParams.get("productKey");
    const productId = searchParams.get("productId");
    let sortBy = searchParams.get("sortBy") || "started_running_on";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const groupBy = searchParams.get("groupBy") || (searchParams.get("groupByCreative") === "true" ? "creative" : "none");

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;

    // Asynchronously synchronize completed active Apify runs in background without blocking feed load
    if (page === 1) {
      syncApifyRuns().catch((err) => {
        console.error("[Ad Feed] Apify sync error in background:", err);
      });
    }

    // Build conditions array
    const conditions = [];

    // Apply Smart Presets if designated
    if (smartPreset === "multi_angle") {
      conditions.push(eq(adObservations.isActive, true));
      if (!searchParams.get("sortBy")) sortBy = "winner_score";
      if (minProductCreatives === 0) minProductCreatives = 2;
    } else if (smartPreset === "breakout" || smartPreset === "breakout_winners") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      conditions.push(gte(ads.startedRunningOn, sevenDaysAgo));
      conditions.push(gte(adObservations.duplicationCount, 3));
      conditions.push(eq(adObservations.isActive, true));
      if (!searchParams.get("sortBy")) sortBy = "winner_score";
    } else if (smartPreset === "top_winners") {
      conditions.push(gte(adObservations.duplicationCount, 2));
      conditions.push(eq(adObservations.isActive, true));
      if (!searchParams.get("sortBy")) sortBy = "winner_score";
    } else if (smartPreset === "fast_scalers") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      conditions.push(gte(ads.startedRunningOn, sevenDaysAgo));
      conditions.push(gte(adObservations.duplicationCount, 3));
      conditions.push(eq(adObservations.isActive, true));
      if (!searchParams.get("sortBy")) sortBy = "duplication_count";
    } else if (smartPreset === "evergreen") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      conditions.push(lte(ads.startedRunningOn, thirtyDaysAgo));
      conditions.push(gte(adObservations.duplicationCount, 2));
      conditions.push(eq(adObservations.isActive, true));
      if (!searchParams.get("sortBy")) sortBy = "winner_score";
    } else if (smartPreset === "viral_videos") {
      conditions.push(eq(ads.mediaType, "video"));
      conditions.push(gte(adObservations.duplicationCount, 3));
      conditions.push(eq(adObservations.isActive, true));
      if (!searchParams.get("sortBy")) sortBy = "duplication_count";
    } else if (smartPreset === "watchlist") {
      conditions.push(eq(trackedPages.isWatchlisted, true));
      conditions.push(eq(adObservations.isActive, true));
    } else if (smartPreset === "daily_radar") {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      conditions.push(gte(ads.startedRunningOn, twoDaysAgo));
      conditions.push(eq(adObservations.isActive, true));
    }

    const isUuid = (str: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    if (trackedPageId) {
      if (isUuid(trackedPageId)) {
        conditions.push(
          or(
            eq(adObservations.trackedPageId, trackedPageId),
            eq(trackedPages.id, trackedPageId),
            eq(ads.pageId, trackedPageId)
          )
        );
      } else {
        conditions.push(
          or(
            eq(trackedPages.pageId, trackedPageId),
            eq(ads.pageId, trackedPageId)
          )
        );
      }
    }

    if (isWatchlisted && smartPreset !== "watchlist") {
      conditions.push(eq(trackedPages.isWatchlisted, true));
    }

    if (productId) {
      conditions.push(eq(ads.productId, productId));
    }

    if (excludePageIds.length > 0) {
      const uuidExcludes = excludePageIds.filter((id) => isUuid(id));
      const textExcludes = excludePageIds.filter((id) => !isUuid(id));

      if (textExcludes.length > 0) {
        conditions.push(not(inArray(ads.pageId, textExcludes)));
        conditions.push(
          or(
            sql`${trackedPages.pageId} IS NULL`,
            not(inArray(trackedPages.pageId, textExcludes))
          )
        );
      }

      if (uuidExcludes.length > 0) {
        conditions.push(not(inArray(adObservations.trackedPageId, uuidExcludes)));
        conditions.push(not(inArray(trackedPages.id, uuidExcludes)));
      }
    }

    if (ctaText && ctaText !== "all" && smartPreset !== "ecom_sales") {
      if (ctaText === "ecom_any") {
        conditions.push(
          or(
            ilike(ads.ctaText, "%Shop%"),
            ilike(ads.ctaText, "%Order%"),
            ilike(ads.ctaText, "%Buy%"),
            ilike(ads.ctaText, "%Commander%"),
            ilike(ads.ctaText, "%Acheter%")
          )
        );
      } else {
        conditions.push(ilike(ads.ctaText, `%${ctaText.trim()}%`));
      }
    }

    if (search && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(ads.caption, term),
          ilike(ads.title, term),
          ilike(ads.pageName, term),
          ilike(ads.adArchiveId, term),
          ilike(ads.linkUrl, term)
        )
      );
    }

    if (dateFrom && !smartPreset) {
      const fromDate = new Date(dateFrom);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(ads.startedRunningOn, fromDate));
      }
    }

    if (dateTo && !smartPreset) {
      const toDate = new Date(dateTo);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(ads.startedRunningOn, toDate));
      }
    }

    if (minDaysRunning > 0 && !smartPreset) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - minDaysRunning);
      conditions.push(lte(ads.startedRunningOn, cutoffDate));
    }

    if (minDuplications > 1 && !smartPreset) {
      conditions.push(gte(adObservations.duplicationCount, minDuplications));
    }

    if (minWinnerScore > 0 && !smartPreset) {
      const winnerScoreSql = sql`(
        (CASE 
          WHEN ${adObservations.duplicationCount} >= 20 THEN 40
          WHEN ${adObservations.duplicationCount} >= 10 THEN 37
          WHEN ${adObservations.duplicationCount} >= 5 THEN 32
          WHEN ${adObservations.duplicationCount} >= 3 THEN 24
          WHEN ${adObservations.duplicationCount} >= 2 THEN 14
          ELSE 5
        END) + 
        (CASE
          WHEN ${ads.startedRunningOn} IS NULL THEN 4
          WHEN EXTRACT(DAY FROM NOW() - ${ads.startedRunningOn}) <= 3 THEN 8
          WHEN EXTRACT(DAY FROM NOW() - ${ads.startedRunningOn}) <= 7 THEN 16
          WHEN EXTRACT(DAY FROM NOW() - ${ads.startedRunningOn}) <= 14 THEN 25
          WHEN EXTRACT(DAY FROM NOW() - ${ads.startedRunningOn}) <= 30 THEN 34
          WHEN EXTRACT(DAY FROM NOW() - ${ads.startedRunningOn}) <= 90 THEN 40
          ELSE 38
        END) +
        (CASE 
          WHEN ${adObservations.isActive} = true AND (${ads.lastSeenAt} IS NULL OR EXTRACT(EPOCH FROM (NOW() - ${ads.lastSeenAt})) / 3600 <= 48) THEN 15
          WHEN ${adObservations.isActive} = true AND EXTRACT(EPOCH FROM (NOW() - ${ads.lastSeenAt})) / 3600 <= 168 THEN 10
          WHEN ${adObservations.isActive} = true THEN 6
          ELSE 2
        END) +
        (CASE WHEN ${ads.mediaType} = 'video' THEN 1 ELSE 0 END) +
        (CASE WHEN ${adObservations.isActive} = true AND ${adObservations.duplicationCount} >= 3 AND (${ads.startedRunningOn} IS NOT NULL AND EXTRACT(DAY FROM NOW() - ${ads.startedRunningOn}) <= 7) THEN 3 ELSE 0 END)
      )`;
      conditions.push(gte(winnerScoreSql, minWinnerScore));
    }

    if (mediaType && mediaType !== "all" && smartPreset !== "viral_videos") {
      conditions.push(eq(ads.mediaType, mediaType));
    }

    if (status === "archived") {
      conditions.push(eq(ads.isArchived, true));
    } else if (!smartPreset) {
      // Hide archived ads from main feed states (all, active, inactive)
      conditions.push(or(eq(ads.isArchived, false), sql`${ads.isArchived} IS NULL`));
      if (status === "active") {
        conditions.push(eq(adObservations.isActive, true));
      } else if (status === "inactive") {
        conditions.push(eq(adObservations.isActive, false));
      }
    } else {
      conditions.push(or(eq(ads.isArchived, false), sql`${ads.isArchived} IS NULL`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Build CTE subquery — innerJoin on adObservations so we always have duplication/active metadata.
    // DISTINCT ON (ads.id) keeps the latest observation per ad deterministically.
    const subquery = db
      .selectDistinctOn([ads.id], {
        id: ads.id,
        adArchiveId: ads.adArchiveId,
        pageId: ads.pageId,
        pageName: ads.pageName,
        startedRunningOn: ads.startedRunningOn,
        caption: ads.caption,
        title: ads.title,
        ctaText: ads.ctaText,
        linkUrl: ads.linkUrl,
        productId: ads.productId,
        mediaType: ads.mediaType,
        mediaUrls: ads.mediaUrls,
        thumbnailUrl: ads.thumbnailUrl,
        thumbnailStoragePath: ads.thumbnailStoragePath,
        mediaHash: ads.mediaHash,
        perceptualHash: ads.perceptualHash,
        firstSeenAt: ads.firstSeenAt,
        lastSeenAt: ads.lastSeenAt,
        isArchived: ads.isArchived,
        archivedAt: ads.archivedAt,
        createdAt: ads.createdAt,
        updatedAt: ads.updatedAt,
        duplicationCount: adObservations.duplicationCount,
        isActive: adObservations.isActive,
        trackedPageId: adObservations.trackedPageId,
        pageDisplayName: trackedPages.displayName,
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .leftJoin(trackedPages, eq(adObservations.trackedPageId, trackedPages.id))
      .where(whereClause)
      .orderBy(ads.id, desc(adObservations.observedAt))
      .as("distinct_ads");

    // Outer sorting order with multi-tiered deterministic tie-breakers
    let outerOrderBy: any[] = [];

    if (sortBy === "winner_score" || sortBy === "winner") {
      const winnerScoreSql = sql`(
        (CASE 
          WHEN ${subquery.duplicationCount} >= 20 THEN 40
          WHEN ${subquery.duplicationCount} >= 10 THEN 37
          WHEN ${subquery.duplicationCount} >= 5 THEN 32
          WHEN ${subquery.duplicationCount} >= 3 THEN 24
          WHEN ${subquery.duplicationCount} >= 2 THEN 14
          ELSE 5
        END) + 
        (CASE
          WHEN ${subquery.startedRunningOn} IS NULL THEN 4
          WHEN EXTRACT(DAY FROM NOW() - ${subquery.startedRunningOn}) <= 3 THEN 8
          WHEN EXTRACT(DAY FROM NOW() - ${subquery.startedRunningOn}) <= 7 THEN 16
          WHEN EXTRACT(DAY FROM NOW() - ${subquery.startedRunningOn}) <= 14 THEN 25
          WHEN EXTRACT(DAY FROM NOW() - ${subquery.startedRunningOn}) <= 30 THEN 34
          WHEN EXTRACT(DAY FROM NOW() - ${subquery.startedRunningOn}) <= 90 THEN 40
          ELSE 38
        END) +
        (CASE 
          WHEN ${subquery.isActive} = true AND (${subquery.lastSeenAt} IS NULL OR EXTRACT(EPOCH FROM (NOW() - ${subquery.lastSeenAt})) / 3600 <= 48) THEN 15
          WHEN ${subquery.isActive} = true AND EXTRACT(EPOCH FROM (NOW() - ${subquery.lastSeenAt})) / 3600 <= 168 THEN 10
          WHEN ${subquery.isActive} = true THEN 6
          ELSE 2
        END) +
        (CASE WHEN ${subquery.mediaType} = 'video' THEN 1 ELSE 0 END) +
        (CASE WHEN ${subquery.isActive} = true AND ${subquery.duplicationCount} >= 3 AND (${subquery.startedRunningOn} IS NOT NULL AND EXTRACT(DAY FROM NOW() - ${subquery.startedRunningOn}) <= 7) THEN 3 ELSE 0 END)
      )`;
      outerOrderBy = [
        sortOrder === "asc" ? asc(winnerScoreSql) : desc(winnerScoreSql),
        desc(subquery.duplicationCount),
        desc(subquery.startedRunningOn),
        desc(subquery.createdAt),
        desc(subquery.id),
      ];
    } else if (sortBy === "oldest") {
      outerOrderBy = [
        asc(subquery.startedRunningOn),
        desc(subquery.duplicationCount),
        asc(subquery.createdAt),
        asc(subquery.id),
      ];
    } else if (sortBy === "duplication_count" || sortBy === "scale" || sortBy === "most_duplicated") {
      outerOrderBy = [
        sortOrder === "asc" ? asc(subquery.duplicationCount) : desc(subquery.duplicationCount),
        desc(subquery.startedRunningOn),
        desc(subquery.createdAt),
        desc(subquery.id),
      ];
    } else if (sortBy === "recently_observed" || sortBy === "last_seen_at") {
      outerOrderBy = [
        sortOrder === "asc" ? asc(subquery.lastSeenAt) : desc(subquery.lastSeenAt),
        desc(subquery.startedRunningOn),
        desc(subquery.id),
      ];
    } else if (sortBy === "first_seen_at") {
      outerOrderBy = [
        sortOrder === "asc" ? asc(subquery.firstSeenAt) : desc(subquery.firstSeenAt),
        desc(subquery.startedRunningOn),
        desc(subquery.id),
      ];
    } else {
      // Default: newest started_running_on
      outerOrderBy = [
        sortOrder === "asc" ? asc(subquery.startedRunningOn) : desc(subquery.startedRunningOn),
        desc(subquery.duplicationCount),
        desc(subquery.createdAt),
        desc(subquery.id),
      ];
    }

    const rows = await db
      .select()
      .from(subquery)
      .orderBy(...outerOrderBy)
      .limit(limit)
      .offset(offset);

    // Count total matching distinct ads
    const [countResult] = await db
      .select({ count: sql<number>`count(distinct ${ads.id})` })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .leftJoin(trackedPages, eq(adObservations.trackedPageId, trackedPages.id))
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    // Fetch all ads for these brands to build comprehensive product cluster metrics
    const pageIds = Array.from(new Set(rows.map((r) => r.pageId).filter(Boolean)));
    let brandAds: any[] = [];
    if (pageIds.length > 0) {
      brandAds = await db
        .select({
          id: ads.id,
          pageId: ads.pageId,
          linkUrl: ads.linkUrl,
          caption: ads.caption,
          title: ads.title,
          mediaType: ads.mediaType,
        })
        .from(ads)
        .where(inArray(ads.pageId, pageIds));
    }

    const clusterMap = new Map<string, any>();
    if (brandAds.length > 0) {
      const enrichedBrandAds = enrichAdsWithProductClusters(brandAds);
      enrichedBrandAds.forEach((item) => {
        clusterMap.set(item.id, item);
      });
    }

    // Fetch products linked to these ads in batch
    const productIds = Array.from(
      new Set(rows.map((r) => r.productId).filter((id): id is string => Boolean(id)))
    );
    const productMap = new Map<string, any>();
    if (productIds.length > 0) {
      const fetchedProducts = await db
        .select()
        .from(scrapedProducts)
        .where(inArray(scrapedProducts.id, productIds));
      fetchedProducts.forEach((p) => {
        productMap.set(p.id, p);
      });
    }

    // Synchronous row mapping with Winner Score & Product Cluster calculations
    const items = rows.map((row) => {
      const clusterInfo = clusterMap.get(row.id) || {
        productKey: `ad:${row.pageId}:${row.id}`,
        productName: row.title || "Product Offer",
        cleanProductUrl: null,
        productCreativeCount: 1,
        productVideoCount: row.mediaType === "video" ? 1 : 0,
        productImageCount: row.mediaType === "image" ? 1 : 0,
        brandProductCount: 1,
        brandTotalCreatives: 1,
        productSharePercent: 100,
        isFlagshipProduct: false,
      };

      const winnerMetrics = calculateWinnerScore({
        startedRunningOn: row.startedRunningOn,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        duplicationCount: Number(row.duplicationCount || 1),
        isActive: Boolean(row.isActive),
        isArchived: Boolean(row.isArchived),
        mediaType: row.mediaType,
        productCreativeCount: clusterInfo.productCreativeCount,
      });

      return {
        id: row.id,
        adArchiveId: row.adArchiveId,
        pageId: row.pageId,
        pageName: row.pageName || row.pageDisplayName,
        startedRunningOn: row.startedRunningOn,
        caption: row.caption,
        title: row.title,
        ctaText: row.ctaText,
        linkUrl: row.linkUrl,
        productId: row.productId,
        product: row.productId ? productMap.get(row.productId) || null : null,
        mediaType: row.mediaType,
        mediaUrls: row.mediaUrls,
        thumbnailUrl: row.thumbnailUrl,
        thumbnailStoragePath: row.thumbnailStoragePath,
        mediaHash: row.mediaHash,
        perceptualHash: row.perceptualHash,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        duplicationCount: Number(row.duplicationCount || 1),
        isActive: Boolean(row.isActive),
        isArchived: Boolean(row.isArchived),
        archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
        trackedPageId: row.trackedPageId,
        signedThumbnailUrl: row.thumbnailUrl,
        // Winner metrics
        winnerScore: winnerMetrics.winnerScore,
        winnerTier: winnerMetrics.winnerTier,
        isBreakout: winnerMetrics.isBreakout,
        isEvergreen: winnerMetrics.isEvergreen,
        daysRunning: winnerMetrics.daysRunning,
        winnerBreakdown: {
          longevityPts: winnerMetrics.breakdown.longevityPts,
          scalePts: winnerMetrics.breakdown.scalePts,
          recencyPts: winnerMetrics.breakdown.recencyPts,
          bonusPts: winnerMetrics.breakdown.bonusPts,
        },
        // Product Clustering Metrics
        productKey: clusterInfo.productKey,
        productName: clusterInfo.productName,
        cleanProductUrl: clusterInfo.cleanProductUrl,
        productCreativeCount: clusterInfo.productCreativeCount,
        productVideoCount: clusterInfo.productVideoCount,
        productImageCount: clusterInfo.productImageCount,
        brandProductCount: clusterInfo.brandProductCount,
        brandTotalCreatives: clusterInfo.brandTotalCreatives,
        productSharePercent: clusterInfo.productSharePercent,
        isFlagshipProduct: clusterInfo.isFlagshipProduct,
      };
    });

    // Run Visual Creative Clustering across returned items
    let enrichedItems = enrichAdsWithCreativeClusters(items);

    // Apply Group by Creative filter if requested
    if (groupBy === "creative") {
      enrichedItems = getDeduplicatedCreativeHeroAds(enrichedItems);
    }

    let finalItems = enrichedItems;

    if (minProductCreatives > 0) {
      finalItems = finalItems.filter((i) => (i.productCreativeCount || 1) >= minProductCreatives);
    }

    if (productKey) {
      finalItems = finalItems.filter((i) => i.productKey === productKey);
    }

    if (sortBy === "product_creatives") {
      finalItems.sort((a, b) => {
        const countA = a.productCreativeCount || 1;
        const countB = b.productCreativeCount || 1;
        return sortOrder === "asc" ? countA - countB : countB - countA;
      });
    }

    return NextResponse.json(
      {
        items: finalItems,
        pagination: {
          page,
          limit,
          total: minProductCreatives > 0 || productKey || groupBy === "creative" ? finalItems.length : total,
          totalPages: Math.ceil((minProductCreatives > 0 || productKey || groupBy === "creative" ? finalItems.length : total) / limit),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch ad creatives" },
      { status: 500 }
    );
  }
}
