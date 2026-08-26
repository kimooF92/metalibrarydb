import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { scrapedProducts } from "../db/schema";
import { isNull, desc, eq, or } from "drizzle-orm";
import { classifyProductWithAI } from "../lib/product-classifier";

async function backfillCategories() {
  console.log("=================================================");
  console.log(" 🏷️  AI Product Categorization Backfill Runner  ");
  console.log("=================================================");

  // Find all products without a category
  const uncategorized = await db
    .select({
      id: scrapedProducts.id,
      title: scrapedProducts.title,
      domain: scrapedProducts.domain,
      category: scrapedProducts.category,
    })
    .from(scrapedProducts)
    .where(or(isNull(scrapedProducts.category), eq(scrapedProducts.category, "")))
    .orderBy(desc(scrapedProducts.createdAt));

  console.log(`Found ${uncategorized.length} products to categorize.\n`);

  if (uncategorized.length === 0) {
    console.log("✅ All products are already categorized!");
    await client.end();
    process.exit(0);
  }

  let updated = 0;
  for (let i = 0; i < uncategorized.length; i++) {
    const item = uncategorized[i];
    if (!item.title) continue;

    try {
      const result = await classifyProductWithAI(item.title, {
        domain: item.domain,
      });

      await db
        .update(scrapedProducts)
        .set({
          category: result.category,
          subCategory: result.subCategory,
          targetAudience: result.targetAudience,
          updatedAt: new Date(),
        })
        .where(eq(scrapedProducts.id, item.id));

      updated++;
      console.log(
        `[${i + 1}/${uncategorized.length}] [${result.modelUsed}] "${item.title.slice(0, 45)}" ➔ 🏷️ ${result.category} (${result.subCategory})`
      );
    } catch (err: any) {
      console.warn(`[${i + 1}/${uncategorized.length}] Error classifying ${item.id}:`, err?.message);
    }
  }

  console.log("\n=================================================");
  console.log(`🎉 Backfill Complete: ${updated}/${uncategorized.length} products categorized!`);
  console.log("=================================================");

  await client.end();
  process.exit(0);
}

backfillCategories().catch(async (e) => {
  console.error("Fatal error:", e);
  await client.end();
  process.exit(1);
});
