import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads, scrapedProducts } from "../db/schema";
import { sql, count, desc, and } from "drizzle-orm";

async function benchmarkWarmQueries() {
  console.log("=== Running 5 Consecutive Iterations to Measure Cold vs Warm Performance ===\n");

  const whereClause = sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`;
  const activeCondition = and(
    whereClause,
    sql`EXISTS (
      SELECT 1 FROM ${ads}
      WHERE ${ads.productId} = ${scrapedProducts.id}
      AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
    )`
  );

  for (let i = 1; i <= 5; i++) {
    const t0 = performance.now();
    
    // Simulating GET /api/products request (lean select + count)
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

    // Simulating Active filter request with EXISTS
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
    const t2 = performance.now();

    const feedTime = (t1 - t0).toFixed(2);
    const activeTime = (t2 - t1).toFixed(2);
    const label = i === 1 ? "(Cold-Start / TLS Handshake)" : "(Warm Pool & Buffer Cache)";

    console.log(`Iteration #${i} ${label}:`);
    console.log(`  • Primary Feed Query:  ${feedTime.padStart(7)} ms`);
    console.log(`  • Active Filter Query: ${activeTime.padStart(7)} ms`);
  }

  console.log("\n✅ Benchmark finished.");
  process.exit(0);
}

benchmarkWarmQueries();
