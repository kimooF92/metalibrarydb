import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client, db } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { normalizeProductUrl } from "../lib/firecrawl";

async function cleanAndMergeProductUrls() {
  console.log("=================================================");
  console.log("   🧹 Product URL Cleanup & De-duplication       ");
  console.log("=================================================\n");

  const allProducts = await db
    .select({
      id: scrapedProducts.id,
      url: scrapedProducts.url,
      title: scrapedProducts.title,
      price: scrapedProducts.currentPrice,
      image: scrapedProducts.mainImageUrl,
      status: scrapedProducts.scrapeStatus,
    })
    .from(scrapedProducts);

  console.log(`Analyzing ${allProducts.length} products in database...\n`);

  let mergedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const prod of allProducts) {
    if (!prod.url) continue;

    const canonicalUrl = normalizeProductUrl(prod.url);
    if (!canonicalUrl || canonicalUrl === prod.url) {
      skippedCount++;
      continue;
    }

    // Check if canonical URL already exists as a separate row
    const existingCanonical = await db
      .select({ id: scrapedProducts.id, title: scrapedProducts.title, price: scrapedProducts.currentPrice })
      .from(scrapedProducts)
      .where(eq(scrapedProducts.url, canonicalUrl))
      .limit(1);

    if (existingCanonical.length > 0 && existingCanonical[0].id !== prod.id) {
      const canonicalId = existingCanonical[0].id;
      console.log(`[MERGE] Merging duplicate:`);
      console.log(`   Dirty: "${prod.title}" (${prod.id})`);
      console.log(`   URL:   ${prod.url}`);
      console.log(`   Into:  "${existingCanonical[0].title}" (${canonicalId})`);
      console.log(`   URL:   ${canonicalUrl}\n`);

      // 1. Re-link all ads pointing to dirty duplicate -> canonical product
      await db
        .update(ads)
        .set({ productId: canonicalId })
        .where(eq(ads.productId, prod.id));

      // 2. Delete dirty duplicate row
      await db
        .delete(scrapedProducts)
        .where(eq(scrapedProducts.id, prod.id));

      mergedCount++;
    } else {
      console.log(`[CLEAN] Normalizing URL in place for product "${prod.title}" (${prod.id}):`);
      console.log(`   Before: ${prod.url}`);
      console.log(`   After:  ${canonicalUrl}\n`);

      await db
        .update(scrapedProducts)
        .set({
          url: canonicalUrl,
          updatedAt: new Date(),
        })
        .where(eq(scrapedProducts.id, prod.id));

      updatedCount++;
    }
  }

  console.log("=================================================");
  console.log(`🎉 Cleanup Finished:`);
  console.log(`   - Merged & Deleted Duplicates: ${mergedCount}`);
  console.log(`   - Cleaned URLs in place:       ${updatedCount}`);
  console.log(`   - Clean URLs unchanged:        ${skippedCount}`);
  console.log("=================================================");

  await client.end();
  process.exit(0);
}

cleanAndMergeProductUrls().catch(async (e) => {
  console.error("Cleanup error:", e);
  await client.end();
  process.exit(1);
});
