import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages, scrapedProducts } from "@/db/schema";
import { eq, and, sql, desc, asc, or, ilike } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { calculateWinnerScore } from "@/lib/winner-score";
import { classifyScalingPattern } from "@/lib/scaling-classifier";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { getActiveWorkspace } from "@/lib/workspace-server";
import type { FreshWinnerItem, FreshWinnersStats } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

interface CachedFreshWinnersPage {
  items: FreshWinnerItem[];
  stats: FreshWinnersStats;
  total: number;
  totalPages: number;
  timestamp: number;
}

const freshWinnersCache = new Map<string, CachedFreshWinnersPage>();
const freshWinnersStatsCache = new Map<string, { stats: FreshWinnersStats; total: number; timestamp: number }>();
const FRESH_WINNERS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);

    const windowParam = searchParams.get("window") || "7d";
    const windowDays = windowParam === "3d" ? 3 : windowParam === "14d" ? 14 : 7;
    const minCopies = Math.max(1, parseInt(searchParams.get("minCopies") || "2", 10));
    const mediaType = searchParams.get("mediaType");
    const category = searchParams.get("category");
    const hasProduct = searchParams.get("hasProduct") === "true";
    const search = searchParams.get("search")?.trim();
    const sortBy = searchParams.get("sortBy") || "velocity";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(60, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;
    const forceRefresh = searchParams.get("refresh") === "true";

    const cutoffDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const activeWorkspace = await getActiveWorkspace(req);

    const baseCacheKey = `${activeWorkspace.id}:${windowDays}:${minCopies}:${mediaType || 'all'}:${category || 'all'}:${hasProduct}:${search || ''}:${sortBy}`;
    const pageCacheKey = `${baseCacheKey}:p${page}:l${limit}`;
    const now = Date.now();
    const cachedPage = freshWinnersCache.get(pageCacheKey);

    if (!forceRefresh && cachedPage && now - cachedPage.timestamp < FRESH_WINNERS_CACHE_TTL_MS) {
      return NextResponse.json(
        {
          success: true,
          winners: cachedPage.items,
          stats: cachedPage.stats,
          pagination: {
            page,
            limit,
            total: cachedPage.total,
            totalPages: cachedPage.totalPages,
          },
        },
        {
          headers: {
            "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
            Vary: PRIVATE_AUTH_VARY,
          },
        }
      );
    }

    // Build conditions for raw SQL subquery / joins
    const conditions: any[] = [
      sql`(${ads.isArchived} = false OR ${ads.isArchived} IS NULL)`,
      sql`COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}) >= ${cutoffDate.toISOString()}::timestamptz`,
      eq(trackedPages.workspaceId, activeWorkspace.id),
    ];

    if (mediaType && mediaType !== "all") {
      conditions.push(eq(ads.mediaType, mediaType));
    }

    if (hasProduct) {
      conditions.push(sql`${ads.productId} IS NOT NULL`);
    }

    if (category && category !== "all") {
      conditions.push(eq(scrapedProducts.category, category));
    }

    if (search && search !== "") {
      const term = `%${search}%`;
      const searchCondition = or(
        ilike(ads.caption, term),
        ilike(ads.title, term),
        ilike(scrapedProducts.title, term),
        ilike(scrapedProducts.domain, term),
        ilike(trackedPages.displayName, term)
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    const whereSql = and(...conditions);

    // 1. Resolve aggregate market stats efficiently (cached per base filter key or queried via lean SQL)
    let stats: FreshWinnersStats;
    let totalBreakouts = 0;
    const cachedStats = freshWinnersStatsCache.get(baseCacheKey);

    if (!forceRefresh && cachedStats && now - cachedStats.timestamp < FRESH_WINNERS_CACHE_TTL_MS) {
      stats = cachedStats.stats;
      totalBreakouts = cachedStats.total;
    } else {
      const [statsRow] = await db
        .select({
          totalBreakouts: sql<number>`count(*)`.mapWith(Number),
          activeBrandsCount: sql<number>`count(distinct latest_obs.tracked_page_id)`.mapWith(Number),
          videoCount: sql<number>`count(case when ${ads.mediaType} = 'video' then 1 end)`.mapWith(Number),
        })
        .from(ads)
        .innerJoin(
          sql`(
            SELECT DISTINCT ON (ad_id)
              id AS obs_id,
              ad_id,
              tracked_page_id,
              duplication_count,
              observed_at
            FROM ${adObservations}
            WHERE ${adObservations.isActive} = true
              AND ${adObservations.duplicationCount} >= ${minCopies}
            ORDER BY ad_id, observed_at DESC
          ) AS latest_obs`,
          sql`latest_obs.ad_id = ${ads.id}`
        )
        .leftJoin(scrapedProducts, eq(ads.productId, scrapedProducts.id))
        .leftJoin(trackedPages, sql`tracked_pages.id = latest_obs.tracked_page_id`)
        .where(whereSql);

      totalBreakouts = Number(statsRow?.totalBreakouts || 0);
      const videoCount = Number(statsRow?.videoCount || 0);
      const videoRatePercent = totalBreakouts > 0 ? Math.round((videoCount / totalBreakouts) * 100) : 0;

      let topCategory: string | null = null;
      let medianPrice: string | null = null;

      if (totalBreakouts > 0) {
        const [topCatRow, priceRow] = await Promise.all([
          db
            .select({
              category: scrapedProducts.category,
            })
            .from(ads)
            .innerJoin(
              sql`(
                SELECT DISTINCT ON (ad_id)
                  id AS obs_id,
                  ad_id,
                  tracked_page_id,
                  duplication_count,
                  observed_at
                FROM ${adObservations}
                WHERE ${adObservations.isActive} = true
                  AND ${adObservations.duplicationCount} >= ${minCopies}
                ORDER BY ad_id, observed_at DESC
              ) AS latest_obs`,
              sql`latest_obs.ad_id = ${ads.id}`
            )
            .leftJoin(scrapedProducts, eq(ads.productId, scrapedProducts.id))
            .leftJoin(trackedPages, sql`tracked_pages.id = latest_obs.tracked_page_id`)
            .where(and(whereSql, sql`${scrapedProducts.category} IS NOT NULL`))
            .groupBy(scrapedProducts.category)
            .orderBy(desc(sql`count(*)`))
            .limit(1),

          db
            .select({
              avgPrice: sql<number>`ROUND(AVG(NULLIF(regexp_replace(${scrapedProducts.currentPrice}, '[^0-9.]', '', 'g'), '')::numeric), 0)`.mapWith(Number),
            })
            .from(ads)
            .innerJoin(
              sql`(
                SELECT DISTINCT ON (ad_id)
                  id AS obs_id,
                  ad_id,
                  tracked_page_id,
                  duplication_count,
                  observed_at
                FROM ${adObservations}
                WHERE ${adObservations.isActive} = true
                  AND ${adObservations.duplicationCount} >= ${minCopies}
                ORDER BY ad_id, observed_at DESC
              ) AS latest_obs`,
              sql`latest_obs.ad_id = ${ads.id}`
            )
            .leftJoin(scrapedProducts, eq(ads.productId, scrapedProducts.id))
            .leftJoin(trackedPages, sql`tracked_pages.id = latest_obs.tracked_page_id`)
            .where(and(whereSql, sql`${scrapedProducts.currentPrice} IS NOT NULL`)),
        ]);

        topCategory = topCatRow?.[0]?.category || null;
        if (priceRow?.[0]?.avgPrice) {
          const sym = activeWorkspace.currencySymbol || "TND";
          medianPrice = `${priceRow[0].avgPrice} ${sym}`;
        }
      }

      const sym = activeWorkspace.currencySymbol || "TND";
      stats = {
        totalBreakouts,
        videoRatePercent,
        topCategory: topCategory || "Multi-Niche",
        medianPrice: medianPrice || `49 ${sym}`,
        activeBrandsCount: Number(statsRow?.activeBrandsCount || 0),
      };

      freshWinnersStatsCache.set(baseCacheKey, { stats, total: totalBreakouts, timestamp: now });
    }

    if (totalBreakouts === 0) {
      return NextResponse.json(
        {
          success: true,
          winners: [],
          stats,
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 1,
          },
        },
        {
          headers: {
            "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
            Vary: PRIVATE_AUTH_VARY,
          },
        }
      );
    }

    // 2. Sort directly in SQL to paginate at the database level (returns only ~24 rows max, NOT 12,000+)
    let sqlOrderBy;
    if (sortBy === "duplication_count") {
      sqlOrderBy = [
        desc(sql`latest_obs.duplication_count`),
        desc(sql`COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt})`),
      ];
    } else if (sortBy === "newest") {
      sqlOrderBy = [
        desc(sql`COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt})`),
        desc(sql`latest_obs.duplication_count`),
      ];
    } else if (sortBy === "winner_score") {
      sqlOrderBy = [
        desc(sql`latest_obs.duplication_count`),
        desc(sql`COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt})`),
      ];
    } else {
      // Default: velocity (copies scaled relative to campaign launch age)
      sqlOrderBy = [
        desc(sql`(latest_obs.duplication_count::numeric / GREATEST(1, EXTRACT(DAY FROM NOW() - COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}))))`),
        desc(sql`latest_obs.duplication_count`),
      ];
    }

    // Lean indexed select: Omit massive raw extracts, strictly bounded by LIMIT & OFFSET
    const pageRows = await db
      .select({
        adId: ads.id,
        adArchiveId: ads.adArchiveId,
        pageId: ads.pageId,
        pageName: ads.pageName,
        startedRunningOn: ads.startedRunningOn,
        firstSeenAt: ads.firstSeenAt,
        lastSeenAt: ads.lastSeenAt,
        caption: ads.caption,
        title: ads.title,
        ctaText: ads.ctaText,
        linkUrl: ads.linkUrl,
        mediaType: ads.mediaType,
        mediaUrls: ads.mediaUrls,
        thumbnailUrl: ads.thumbnailUrl,
        isArchived: ads.isArchived,
        obsId: sql<string>`latest_obs.obs_id`,
        duplicationCount: sql<number>`latest_obs.duplication_count`,
        observedAt: sql<Date>`latest_obs.observed_at`,
        trackedPageId: sql<string>`latest_obs.tracked_page_id`,
        productId: scrapedProducts.id,
        productUrl: scrapedProducts.url,
        productDomain: scrapedProducts.domain,
        productTitle: scrapedProducts.title,
        productCurrentPrice: scrapedProducts.currentPrice,
        productOriginalPrice: scrapedProducts.originalPrice,
        productCurrency: scrapedProducts.currency,
        productDiscountOrOffer: scrapedProducts.discountOrOffer,
        productMainImageUrl: scrapedProducts.mainImageUrl,
        productCategory: scrapedProducts.category,
        productStorePlatform: scrapedProducts.storePlatform,
        productIsFavorite: scrapedProducts.isFavorite,
        productSupplierUrls: scrapedProducts.supplierUrls,
        pageDisplayName: trackedPages.displayName,
        pageCurrentResults: trackedPages.currentResults,
        pageWatchlisted: trackedPages.isWatchlisted,
      })
      .from(ads)
      .innerJoin(
        sql`(
          SELECT DISTINCT ON (ad_id)
            id AS obs_id,
            ad_id,
            tracked_page_id,
            duplication_count,
            observed_at
          FROM ${adObservations}
          WHERE ${adObservations.isActive} = true
            AND ${adObservations.duplicationCount} >= ${minCopies}
          ORDER BY ad_id, observed_at DESC
        ) AS latest_obs`,
        sql`latest_obs.ad_id = ${ads.id}`
      )
      .leftJoin(scrapedProducts, eq(ads.productId, scrapedProducts.id))
      .leftJoin(trackedPages, sql`tracked_pages.id = latest_obs.tracked_page_id`)
      .where(whereSql)
      .orderBy(...sqlOrderBy)
      .limit(limit)
      .offset(offset);

    // Enrich only the paginated slice
    const paginatedItems: FreshWinnerItem[] = pageRows.map((row) => {
      const dup = row.duplicationCount || 1;
      const metrics = calculateWinnerScore({
        startedRunningOn: row.startedRunningOn,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        duplicationCount: dup,
        isActive: true,
        isArchived: Boolean(row.isArchived),
        mediaType: row.mediaType,
      });

      const days = metrics.daysRunning;
      const velocityScore = Math.round((dup / Math.max(1, days)) * 15 + metrics.winnerScore * 0.5);
      const scalingPattern = classifyScalingPattern(null, row.pageCurrentResults);

      return {
        id: row.adId,
        adArchiveId: row.adArchiveId,
        pageId: row.pageId,
        pageName: row.pageName || row.pageDisplayName,
        startedRunningOn: row.startedRunningOn ? row.startedRunningOn.toISOString() : null,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        caption: row.caption,
        title: row.title,
        ctaText: row.ctaText,
        linkUrl: row.linkUrl,
        mediaType: row.mediaType as any,
        mediaUrls: row.mediaUrls,
        thumbnailUrl: row.thumbnailUrl,
        duplicationCount: dup,
        isActive: true,
        isArchived: Boolean(row.isArchived),
        daysRunning: days,
        winnerScore: metrics.winnerScore,
        winnerTier: metrics.winnerTier,
        isBreakout: metrics.isBreakout,
        velocityScore,
        product: row.productId
          ? {
              id: row.productId,
              url: row.productUrl || "",
              domain: row.productDomain || "",
              title: row.productTitle || "",
              currentPrice: row.productCurrentPrice,
              originalPrice: row.productOriginalPrice,
              currency: row.productCurrency,
              discountOrOffer: row.productDiscountOrOffer,
              mainImageUrl: row.productMainImageUrl,
              category: row.productCategory,
              storePlatform: row.productStorePlatform,
              isFavorite: Boolean(row.productIsFavorite),
              supplierUrls: row.productSupplierUrls,
            }
          : null,
        brand: {
          id: row.trackedPageId,
          displayName: row.pageDisplayName || row.pageName,
          scalingPattern,
          isWatchlisted: Boolean(row.pageWatchlisted),
        },
      };
    });

    const totalPages = Math.ceil(totalBreakouts / limit);

    // Save page in cache
    freshWinnersCache.set(pageCacheKey, {
      items: paginatedItems,
      stats,
      total: totalBreakouts,
      totalPages,
      timestamp: now,
    });

    return NextResponse.json(
      {
        success: true,
        winners: paginatedItems,
        stats,
        pagination: {
          page,
          limit,
          total: totalBreakouts,
          totalPages,
        },
      },
      {
        headers: {
          "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
          Vary: PRIVATE_AUTH_VARY,
        },
      }
    );
  } catch (error: any) {
    console.error("[Fresh Winners API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch fresh winners" },
      { status: 500 }
    );
  }
}
