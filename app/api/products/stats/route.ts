import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, scrapedProducts } from "@/db/schema";
import { count, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

// In-memory cache for product stats (60s TTL) to prevent repeated heavy aggregations
interface CachedStats {
  data: {
    totalProducts: number;
    successfulProducts: number;
    pendingProducts: number;
    withOffersCount: number;
    favoritesCount: number;
    newThisWeekCount: number;
    activeCount: number;
    inactiveCount: number;
    platforms: {
      shopify: number;
      youcan: number;
      woocommerce: number;
    };
  };
  timestamp: number;
}

let cachedStats: CachedStats | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    const now = Date.now();
    if (!forceRefresh && cachedStats && now - cachedStats.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        stats: cachedStats.data,
        cached: true,
      });
    }

    // Execute the two summary queries in parallel
    const [productStatsRows, activeAdsStatsRows] = await Promise.all([
      db
        .select({
          total: count(),
          withOffers: sql<number>`COUNT(CASE WHEN ${scrapedProducts.discountOrOffer} IS NOT NULL AND ${scrapedProducts.discountOrOffer} != '' THEN 1 END)`.mapWith(Number),
          favoritesCount: sql<number>`COUNT(CASE WHEN ${scrapedProducts.isFavorite} = true THEN 1 END)`.mapWith(Number),
          successful: sql<number>`COUNT(CASE WHEN ${scrapedProducts.scrapeStatus} = 'success' THEN 1 END)`.mapWith(Number),
          pending: sql<number>`COUNT(CASE WHEN ${scrapedProducts.scrapeStatus} NOT IN ('success', 'deleted', 'ignored') OR ${scrapedProducts.currentPrice} IS NULL THEN 1 END)`.mapWith(Number),
          newThisWeek: sql<number>`COUNT(CASE WHEN ${scrapedProducts.createdAt} >= NOW() - INTERVAL '7 days' THEN 1 END)`.mapWith(Number),
          shopifyCount: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%shopify%' THEN 1 END)`.mapWith(Number),
          youcanCount: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%youcan%' THEN 1 END)`.mapWith(Number),
          woocommerceCount: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%woocommerce%' THEN 1 END)`.mapWith(Number),
        })
        .from(scrapedProducts)
        .where(sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`),

      db
        .select({
          activeDistinctCount: sql<number>`COUNT(DISTINCT ${ads.productId})`.mapWith(Number),
        })
        .from(ads)
        .where(
          sql`${ads.productId} IS NOT NULL AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)`
        ),
    ]);

    const baseStats = productStatsRows[0] || ({} as any);
    const activeCount = Number(activeAdsStatsRows[0]?.activeDistinctCount) || 0;
    const total = Number(baseStats.total) || 0;
    const inactiveCount = Math.max(0, total - activeCount);

    const statsData = {
      totalProducts: total,
      successfulProducts: Number(baseStats.successful) || 0,
      pendingProducts: Number(baseStats.pending) || 0,
      withOffersCount: Number(baseStats.withOffers) || 0,
      favoritesCount: Number(baseStats.favoritesCount) || 0,
      newThisWeekCount: Number(baseStats.newThisWeek) || 0,
      activeCount,
      inactiveCount,
      platforms: {
        shopify: Number(baseStats.shopifyCount) || 0,
        youcan: Number(baseStats.youcanCount) || 0,
        woocommerce: Number(baseStats.woocommerceCount) || 0,
      },
    };

    cachedStats = {
      data: statsData,
      timestamp: now,
    };

    return NextResponse.json({
      success: true,
      stats: statsData,
      cached: false,
    });
  } catch (err: any) {
    console.error("[Products Stats API Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load product stats" },
      { status: 500 }
    );
  }
}
