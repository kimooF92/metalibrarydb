import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads, scrapedProducts } from "../db/schema";
import { sql, count, desc, and } from "drizzle-orm";

async function testProductQueries() {
  console.log("=== Testing Optimized Database Queries for /products ===");

  try {
    // 1. Test Lean Paginated Products Query
    console.log("\n1. Testing lean paginated product select...");
    const t0 = performance.now();
    const whereClause = sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`;
    
    const [products, totalCount] = await Promise.all([
      db
        .select({
          id: scrapedProducts.id,
          url: scrapedProducts.url,
          domain: scrapedProducts.domain,
          pageId: scrapedProducts.pageId,
          title: scrapedProducts.title,
          currentPrice: scrapedProducts.currentPrice,
          originalPrice: scrapedProducts.originalPrice,
          currency: scrapedProducts.currency,
          discountOrOffer: scrapedProducts.discountOrOffer,
          mainImageUrl: scrapedProducts.mainImageUrl,
          galleryImages: scrapedProducts.galleryImages,
          storePlatform: scrapedProducts.storePlatform,
          category: scrapedProducts.category,
          isFavorite: scrapedProducts.isFavorite,
          scrapeStatus: scrapedProducts.scrapeStatus,
          createdAt: scrapedProducts.createdAt,
        })
        .from(scrapedProducts)
        .where(whereClause)
        .orderBy(desc(scrapedProducts.createdAt), desc(scrapedProducts.id))
        .limit(24)
        .offset(0),
      db
        .select({ count: count() })
        .from(scrapedProducts)
        .where(whereClause)
    ]);
    const t1 = performance.now();
    console.log(`✓ Products Query Time: ${(t1 - t0).toFixed(2)} ms`);
    console.log(`  Fetched: ${products.length} products (Total in DB: ${totalCount[0]?.count})`);

    // 2. Test Active Filter Query with EXISTS
    console.log("\n2. Testing Active-only Filter Query with EXISTS...");
    const t2 = performance.now();
    const activeCondition = and(
      whereClause,
      sql`EXISTS (
        SELECT 1 FROM ${ads}
        WHERE ${ads.productId} = ${scrapedProducts.id}
        AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
      )`
    );

    const [activeProducts, activeCount] = await Promise.all([
      db
        .select({ id: scrapedProducts.id, title: scrapedProducts.title })
        .from(scrapedProducts)
        .where(activeCondition)
        .orderBy(desc(scrapedProducts.createdAt))
        .limit(24),
      db
        .select({ count: count() })
        .from(scrapedProducts)
        .where(activeCondition)
    ]);
    const t3 = performance.now();
    console.log(`✓ Active Filter Query Time: ${(t3 - t2).toFixed(2)} ms`);
    console.log(`  Fetched: ${activeProducts.length} active products (Total active: ${activeCount[0]?.count})`);

    // 3. Test Stats Calculation
    console.log("\n3. Testing KPI Summary Aggregations...");
    const t4 = performance.now();
    const [productStatsRows, activeAdsStatsRows] = await Promise.all([
      db
        .select({
          total: count(),
          withOffers: sql<number>`COUNT(CASE WHEN ${scrapedProducts.discountOrOffer} IS NOT NULL AND ${scrapedProducts.discountOrOffer} != '' THEN 1 END)`.mapWith(Number),
          favoritesCount: sql<number>`COUNT(CASE WHEN ${scrapedProducts.isFavorite} = true THEN 1 END)`.mapWith(Number),
          successful: sql<number>`COUNT(CASE WHEN ${scrapedProducts.scrapeStatus} = 'success' THEN 1 END)`.mapWith(Number),
          pending: sql<number>`COUNT(CASE WHEN ${scrapedProducts.scrapeStatus} NOT IN ('success', 'deleted', 'ignored') OR ${scrapedProducts.currentPrice} IS NULL THEN 1 END)`.mapWith(Number),
          newThisWeek: sql<number>`COUNT(CASE WHEN ${scrapedProducts.createdAt} >= NOW() - INTERVAL '7 days' THEN 1 END)`.mapWith(Number),
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
    const t5 = performance.now();
    console.log(`✓ Stats Aggregation Query Time: ${(t5 - t4).toFixed(2)} ms`);
    console.log("  Stats summary:", {
      total: productStatsRows[0]?.total,
      successful: productStatsRows[0]?.successful,
      pending: productStatsRows[0]?.pending,
      activeDistinct: activeAdsStatsRows[0]?.activeDistinctCount
    });

    console.log("\n🎉 ALL TESTS PASSED! Queries are responding in milliseconds without timeout.");
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

testProductQueries();
