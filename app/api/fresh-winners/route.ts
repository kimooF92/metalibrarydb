import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages, scrapedProducts } from "@/db/schema";
import { eq, and, sql, desc, or, ilike, inArray } from "drizzle-orm";
import { validateApiSecret, getRoleFromRequest } from "@/lib/api-guard";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { getActiveWorkspace } from "@/lib/workspace-server";
import type { FreshWinnerProduct, FreshWinnersStats, FreshWinnersProductResponse } from "@/types";
import { getCached, setCached } from "@/lib/cache-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const FRESH_WINNERS_REDIS_TTL = 60; // 60 seconds workspace cache

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);

    const windowParam = searchParams.get("window") || "7d";
    const windowDays = windowParam === "3d" ? 3 : windowParam === "14d" ? 14 : 7;
    const minCreatives = Math.max(1, parseInt(searchParams.get("minCreatives") || "1", 10));
    const minCopies = Math.max(1, parseInt(searchParams.get("minCopies") || "2", 10));
    const mediaType = searchParams.get("mediaType");
    const category = searchParams.get("category");
    const search = searchParams.get("search")?.trim();
    const sortBy = searchParams.get("sortBy") || "velocity";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(60, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;
    const forceRefresh = searchParams.get("refresh") === "true";

    const cutoffDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const activeWorkspace = await getActiveWorkspace(req);
    const role = (await getRoleFromRequest(req)) || "admin";
    const favColumn = role === "staff" ? scrapedProducts.isFavoriteStaff : scrapedProducts.isFavorite;

    // Harmonized cache keys under workspace namespace
    const baseCacheKey = `${role}:${windowDays}:${minCreatives}:${minCopies}:${mediaType || "all"}:${category || "all"}:${search || ""}:${sortBy}`;
    const pageCacheKey = `cache:fresh_winners_v2:${activeWorkspace.id}:p${page}:l${limit}:${baseCacheKey}`;
    const statsCacheKey = `cache:fresh_winners_v2:${activeWorkspace.id}:stats:${baseCacheKey}`;

    if (!forceRefresh) {
      const cachedPage = await getCached<FreshWinnersProductResponse>(pageCacheKey);
      if (cachedPage) {
        return NextResponse.json(cachedPage, {
          headers: {
            "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
            Vary: PRIVATE_AUTH_VARY,
          },
        });
      }
    }

    // 1. Genuine latest observation subquery
    const latestObsSql = sql`(
      SELECT DISTINCT ON (ad_id)
        id AS obs_id,
        ad_id,
        tracked_page_id,
        duplication_count,
        is_active,
        observed_at
      FROM ${adObservations}
      ORDER BY ad_id, observed_at DESC
    ) AS latest_obs`;

    // 2. Build WHERE filters
    const whereConditions: any[] = [
      sql`latest_obs.is_active = true`,
      sql`(${ads.isArchived} = false OR ${ads.isArchived} IS NULL)`,
      eq(scrapedProducts.workspaceId, activeWorkspace.id),
      eq(trackedPages.workspaceId, activeWorkspace.id),
    ];

    if (category && category !== "all") {
      whereConditions.push(eq(scrapedProducts.category, category));
    }

    if (search && search !== "") {
      const term = `%${search}%`;
      const searchCondition = or(
        ilike(scrapedProducts.title, term),
        ilike(scrapedProducts.domain, term),
        ilike(trackedPages.displayName, term)
      );
      if (searchCondition) whereConditions.push(searchCondition);
    }

    const whereSql = and(...whereConditions);

    // 3. Build HAVING filters
    const havingConditions: any[] = [
      sql`count(distinct ${ads.id}) >= ${minCreatives}`,
      sql`sum(latest_obs.duplication_count) >= ${minCopies}`,
      sql`max(coalesce(${ads.startedRunningOn}, ${ads.firstSeenAt})) >= ${cutoffDate.toISOString()}::timestamptz`,
    ];

    if (mediaType === "video") {
      havingConditions.push(sql`count(case when ${ads.mediaType} = 'video' then 1 end) > 0`);
    } else if (mediaType === "image") {
      havingConditions.push(
        sql`count(case when ${ads.mediaType} != 'video' or ${ads.mediaType} is null then 1 end) > 0`
      );
    }

    const havingSql = and(...havingConditions);

    // 4. Resolve stats & total product count
    let stats: FreshWinnersStats;
    let totalProducts = 0;
    const cachedStats = !forceRefresh
      ? await getCached<{ stats: FreshWinnersStats; total: number }>(statsCacheKey)
      : null;

    if (cachedStats) {
      stats = cachedStats.stats;
      totalProducts = cachedStats.total;
    } else {
      // Aggregate stats in a grouped subquery wrapper
      const statsQuery = await db.execute<{
        total_products: number;
        total_active_creatives: number;
        avg_creatives: number;
        total_videos: number;
        avg_price: number | null;
      }>(sql`
        SELECT
          COUNT(*)::int AS total_products,
          COALESCE(SUM(sub.active_creatives_count), 0)::int AS total_active_creatives,
          COALESCE(ROUND(AVG(sub.active_creatives_count), 1), 0)::numeric AS avg_creatives,
          COALESCE(SUM(sub.video_count), 0)::int AS total_videos,
          COALESCE(ROUND(AVG(NULLIF(regexp_replace(sub.current_price, '[^0-9.]', '', 'g'), '')::numeric), 0), 0)::int AS avg_price
        FROM (
          SELECT
            ${scrapedProducts.id} AS product_id,
            ${scrapedProducts.currentPrice} AS current_price,
            COUNT(DISTINCT ${ads.id}) AS active_creatives_count,
            COUNT(CASE WHEN ${ads.mediaType} = 'video' THEN 1 END) AS video_count
          FROM ${scrapedProducts}
          INNER JOIN ${ads} ON ${ads.productId} = ${scrapedProducts.id}
          INNER JOIN ${latestObsSql} ON latest_obs.ad_id = ${ads.id}
          LEFT JOIN ${trackedPages} ON ${trackedPages.id} = latest_obs.tracked_page_id
          WHERE ${whereSql}
          GROUP BY ${scrapedProducts.id}
          HAVING ${havingSql}
        ) sub
      `);

      const statsRow = statsQuery[0] || ({} as any);
      totalProducts = Number(statsRow.total_products || 0);
      const totalActiveCreatives = Number(statsRow.total_active_creatives || 0);
      const avgCreatives = Number(statsRow.avg_creatives || 0);
      const totalVideos = Number(statsRow.total_videos || 0);
      const videoSharePercent =
        totalActiveCreatives > 0 ? Math.round((totalVideos / totalActiveCreatives) * 100) : 0;

      let topCategory: string | null = null;
      let medianPrice: string | null = null;

      if (totalProducts > 0) {
        // Resolve top category
        const topCatResult = await db.execute<{ category: string }>(sql`
          SELECT sub.category
          FROM (
            SELECT ${scrapedProducts.category} AS category
            FROM ${scrapedProducts}
            INNER JOIN ${ads} ON ${ads.productId} = ${scrapedProducts.id}
            INNER JOIN ${latestObsSql} ON latest_obs.ad_id = ${ads.id}
            LEFT JOIN ${trackedPages} ON ${trackedPages.id} = latest_obs.tracked_page_id
            WHERE ${whereSql} AND ${scrapedProducts.category} IS NOT NULL
            GROUP BY ${scrapedProducts.id}
            HAVING ${havingSql}
          ) sub
          GROUP BY sub.category
          ORDER BY COUNT(*) DESC
          LIMIT 1
        `);

        topCategory = topCatResult[0]?.category || null;

        if (statsRow.avg_price && statsRow.avg_price > 0) {
          const sym = activeWorkspace.currencySymbol || "DT";
          medianPrice = `${statsRow.avg_price} ${sym}`;
        }
      }

      stats = {
        totalProducts,
        totalActiveCreatives,
        avgCreativesPerProduct: avgCreatives,
        videoSharePercent,
        topCategory,
        medianPrice,
        totalBreakouts: totalProducts,
        activeBrandsCount: totalProducts,
        videoRatePercent: videoSharePercent,
      };

      await setCached(statsCacheKey, { stats, total: totalProducts }, FRESH_WINNERS_REDIS_TTL).catch(
        () => {}
      );
    }

    if (totalProducts === 0) {
      const emptyPayload = {
        success: true,
        products: [],
        winners: [], // Backward compatibility
        stats,
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 1,
        },
      };

      return NextResponse.json(emptyPayload, {
        headers: {
          "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
          Vary: PRIVATE_AUTH_VARY,
        },
      });
    }

    // 5. Build dynamic SQL ORDER BY with tie-breaker
    let sqlOrderBy;
    if (sortBy === "creatives") {
      sqlOrderBy = [
        desc(sql`count(distinct ${ads.id})`),
        desc(sql`sum(latest_obs.duplication_count)`),
        desc(scrapedProducts.id),
      ];
    } else if (sortBy === "copies") {
      sqlOrderBy = [
        desc(sql`sum(latest_obs.duplication_count)`),
        desc(sql`count(distinct ${ads.id})`),
        desc(scrapedProducts.id),
      ];
    } else if (sortBy === "newest") {
      sqlOrderBy = [
        desc(sql`max(coalesce(${ads.startedRunningOn}, ${ads.firstSeenAt}))`),
        desc(sql`sum(latest_obs.duplication_count)`),
        desc(scrapedProducts.id),
      ];
    } else {
      // Default: velocity (copies scaled relative to campaign launch age)
      sqlOrderBy = [
        desc(
          sql`(sum(latest_obs.duplication_count)::numeric / GREATEST(1, EXTRACT(DAY FROM NOW() - MIN(COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt})))))`
        ),
        desc(sql`sum(latest_obs.duplication_count)`),
        desc(scrapedProducts.id),
      ];
    }

    // 6. Query the paginated product slice
    const productRows = await db
      .select({
        productId: scrapedProducts.id,
        productTitle: scrapedProducts.title,
        productUrl: scrapedProducts.url,
        productDomain: scrapedProducts.domain,
        productMainImage: scrapedProducts.mainImageUrl,
        productCurrentPrice: scrapedProducts.currentPrice,
        productOriginalPrice: scrapedProducts.originalPrice,
        productCurrency: scrapedProducts.currency,
        productDiscount: scrapedProducts.discountOrOffer,
        productCategory: scrapedProducts.category,
        productStorePlatform: scrapedProducts.storePlatform,
        productSupplierUrls: scrapedProducts.supplierUrls,
        productIsFavorite: favColumn,
        brandPageId: scrapedProducts.pageId,
        brandDisplayName: sql<string | null>`MAX(${trackedPages.displayName})`,
        brandWatchlisted: sql<boolean | null>`BOOL_OR(${trackedPages.isWatchlisted})`,
        activeCreativesCount: sql<number>`count(distinct ${ads.id})`.mapWith(Number),
        uniqueVisualsCount: sql<number>`count(distinct coalesce(${ads.thumbnailUrl}, ${ads.id}::text))`.mapWith(Number),
        videoCount: sql<number>`count(case when ${ads.mediaType} = 'video' then 1 end)`.mapWith(Number),
        imageCount: sql<number>`count(case when ${ads.mediaType} != 'video' or ${ads.mediaType} is null then 1 end)`.mapWith(Number),
        totalCopies: sql<number>`sum(latest_obs.duplication_count)`.mapWith(Number),
        maxCopies: sql<number>`max(latest_obs.duplication_count)`.mapWith(Number),
        earliestAdDate: sql<Date | null>`min(coalesce(${ads.startedRunningOn}, ${ads.firstSeenAt}))`,
        latestAdDate: sql<Date | null>`max(coalesce(${ads.startedRunningOn}, ${ads.firstSeenAt}))`,
      })
      .from(scrapedProducts)
      .innerJoin(ads, eq(ads.productId, scrapedProducts.id))
      .innerJoin(latestObsSql, sql`latest_obs.ad_id = ${ads.id}`)
      .leftJoin(trackedPages, sql`tracked_pages.id = latest_obs.tracked_page_id`)
      .where(whereSql)
      .groupBy(scrapedProducts.id)
      .having(havingSql)
      .orderBy(...sqlOrderBy)
      .limit(limit)
      .offset(offset);

    const productIds = productRows.map((r) => r.productId);

    // 7. Resolve filmstrip (top 4 visual creatives with distinct thumbnails)
    const filmstripByProduct = new Map<string, any[]>();
    if (productIds.length > 0) {
      const creativeRows = await db
        .select({
          id: ads.id,
          adArchiveId: ads.adArchiveId,
          productId: ads.productId,
          thumbnailUrl: ads.thumbnailUrl,
          mediaType: ads.mediaType,
          duplicationCount: sql<number>`latest_obs.duplication_count`,
          headline: sql<string | null>`LEFT(${ads.title}, 60)`,
          startedRunningOn: ads.startedRunningOn,
        })
        .from(ads)
        .innerJoin(latestObsSql, sql`latest_obs.ad_id = ${ads.id}`)
        .where(
          and(
            inArray(ads.productId, productIds),
            sql`latest_obs.is_active = true`,
            sql`(${ads.isArchived} = false OR ${ads.isArchived} IS NULL)`
          )
        )
        .orderBy(desc(sql`latest_obs.duplication_count`), desc(ads.id));

      for (const c of creativeRows) {
        if (!c.productId) continue;
        const list = filmstripByProduct.get(c.productId) || [];
        if (list.length >= 4) continue;
        const thumbKey = c.thumbnailUrl || c.id;
        if (!list.some((existing) => (existing.thumbnailUrl || existing.id) === thumbKey)) {
          list.push({
            id: c.id,
            adArchiveId: c.adArchiveId,
            thumbnailUrl: c.thumbnailUrl,
            mediaType: (c.mediaType as any) || "unknown",
            duplicationCount: c.duplicationCount,
            headline: c.headline,
            startedRunningOn: c.startedRunningOn ? c.startedRunningOn.toISOString() : null,
          });
          filmstripByProduct.set(c.productId, list);
        }
      }
    }

    // 8. Construct response items
    const now = Date.now();
    const products: FreshWinnerProduct[] = productRows.map((row) => {
      const earliestT = row.earliestAdDate ? new Date(row.earliestAdDate).getTime() : now;
      const daysRunning = Math.max(0, Math.floor((now - earliestT) / (1000 * 60 * 60 * 24)));
      const velocityScore = Math.min(
        100,
        Math.round((row.totalCopies / Math.max(1, daysRunning)) * 12)
      );

      return {
        id: row.productId,
        url: row.productUrl || "",
        domain: row.productDomain || "",
        title: row.productTitle || "Untitled Product",
        currentPrice: row.productCurrentPrice,
        originalPrice: row.productOriginalPrice,
        currency: row.productCurrency || activeWorkspace.currencySymbol || "DT",
        discountOrOffer: row.productDiscount,
        mainImageUrl: row.productMainImage,
        category: row.productCategory,
        storePlatform: row.productStorePlatform,
        isFavorite: Boolean(row.productIsFavorite),
        supplierUrls: row.productSupplierUrls,
        brand: {
          pageId: row.brandPageId,
          displayName: row.brandDisplayName || row.productDomain || "Store Brand",
          domain: row.productDomain,
          isWatchlisted: Boolean(row.brandWatchlisted),
        },
        metrics: {
          activeCreativesCount: row.activeCreativesCount,
          uniqueVisualsCount: row.uniqueVisualsCount,
          videoCount: row.videoCount,
          imageCount: row.imageCount,
          totalCopies: row.totalCopies,
          maxCopies: row.maxCopies,
          daysRunning,
          velocityScore,
        },
        creatives: filmstripByProduct.get(row.productId) || [],
      };
    });

    const totalPages = Math.ceil(totalProducts / limit);

    const responsePayload: FreshWinnersProductResponse = {
      success: true,
      products,
      stats,
      pagination: {
        page,
        limit,
        total: totalProducts,
        totalPages,
      },
    };

    if (!forceRefresh) {
      await setCached(pageCacheKey, responsePayload, FRESH_WINNERS_REDIS_TTL).catch(() => {});
    }

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
        Vary: PRIVATE_AUTH_VARY,
      },
    });
  } catch (error: any) {
    console.error("[Fresh Winners Product API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch fresh winners" },
      { status: 500 }
    );
  }
}
