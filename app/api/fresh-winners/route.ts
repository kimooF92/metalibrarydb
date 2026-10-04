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

interface CachedFreshWinners {
  items: FreshWinnerItem[];
  stats: FreshWinnersStats;
  timestamp: number;
}

const freshWinnersCache = new Map<string, CachedFreshWinners>();
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

    const cacheKey = `${activeWorkspace.id}:${windowDays}:${minCopies}:${mediaType || 'all'}:${category || 'all'}:${hasProduct}:${search || ''}:${sortBy}`;
    const now = Date.now();
    const cached = freshWinnersCache.get(cacheKey);

    if (!forceRefresh && cached && now - cached.timestamp < FRESH_WINNERS_CACHE_TTL_MS) {
      const paginatedItems = cached.items.slice(offset, offset + limit);
      return NextResponse.json(
        {
          success: true,
          winners: paginatedItems,
          stats: cached.stats,
          pagination: {
            page,
            limit,
            total: cached.items.length,
            totalPages: Math.ceil(cached.items.length / limit),
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

    // Lean indexed select: Omit huge columns like rawExtract and full payloads
    const query = db
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
      .where(whereSql);

    const allMatching = await query;

    // Enrich all matching records with algorithmic winner score & velocity score
    const enrichedList: FreshWinnerItem[] = allMatching.map((row) => {
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
      // Velocity Score: Copies per day weight + winner score weight
      const velocityScore = Math.round((dup / Math.max(1, days)) * 15 + metrics.winnerScore * 0.5);

      const scalingPattern = classifyScalingPattern(
        null,
        row.pageCurrentResults
      );

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

    // Sorting
    enrichedList.sort((a, b) => {
      if (sortBy === "winner_score") {
        return b.winnerScore - a.winnerScore || b.duplicationCount - a.duplicationCount;
      }
      if (sortBy === "duplication_count") {
        return b.duplicationCount - a.duplicationCount || b.winnerScore - a.winnerScore;
      }
      if (sortBy === "newest") {
        const dateA = a.startedRunningOn ? new Date(a.startedRunningOn).getTime() : new Date(a.firstSeenAt).getTime();
        const dateB = b.startedRunningOn ? new Date(b.startedRunningOn).getTime() : new Date(b.firstSeenAt).getTime();
        return dateB - dateA;
      }
      // Default: velocity
      return b.velocityScore - a.velocityScore || b.winnerScore - a.winnerScore;
    });

    // Compute aggregate market stats over the entire matching set
    const totalBreakouts = enrichedList.length;
    let videoCount = 0;
    const categoryCounts: Record<string, number> = {};
    const prices: number[] = [];
    const brandSet = new Set<string>();

    for (const item of enrichedList) {
      if (item.mediaType === "video") videoCount++;
      if (item.brand?.displayName) brandSet.add(item.brand.displayName);
      if (item.product?.category) {
        categoryCounts[item.product.category] = (categoryCounts[item.product.category] || 0) + 1;
      }
      if (item.product?.currentPrice) {
        const num = parseFloat(item.product.currentPrice.replace(/[^0-9.]/g, ""));
        if (!isNaN(num) && num > 0 && num < 2000) prices.push(num);
      }
    }

    const videoRatePercent = totalBreakouts > 0 ? Math.round((videoCount / totalBreakouts) * 100) : 0;
    
    // Top category
    let topCategory: string | null = null;
    let topCategoryCount = 0;
    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count > topCategoryCount) {
        topCategory = cat;
        topCategoryCount = count;
      }
    }

    // Median price
    let medianPrice: string | null = null;
    if (prices.length > 0) {
      prices.sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      const med = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
      medianPrice = `${med.toFixed(0)} TND`;
    }

    const stats: FreshWinnersStats = {
      totalBreakouts,
      videoRatePercent,
      topCategory: topCategory || "Multi-Niche",
      medianPrice: medianPrice || "49 TND",
      activeBrandsCount: brandSet.size,
    };

    // Store in-memory cache for fast repeated reads & pagination
    freshWinnersCache.set(cacheKey, {
      items: enrichedList,
      stats,
      timestamp: Date.now(),
    });

    // Apply pagination slice
    const paginatedItems = enrichedList.slice(offset, offset + limit);

    return NextResponse.json(
      {
        success: true,
        winners: paginatedItems,
        stats,
        pagination: {
          page,
          limit,
          total: totalBreakouts,
          totalPages: Math.ceil(totalBreakouts / limit),
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
