import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { scrapedProducts } from "../db/schema";
import { isNull, desc, eq, or, sql } from "drizzle-orm";
import { classifyProductWithAI } from "../lib/product-classifier";

interface BackfillOptions {
  forceAll: boolean;
  generalOnly: boolean;
  limit?: number;
  concurrency: number;
}

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    forceAll: false,
    generalOnly: false,
    concurrency: 4,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--force" || arg === "-f") {
      options.forceAll = true;
    } else if (arg === "--general" || arg === "-g") {
      options.generalOnly = true;
    } else if (arg === "--limit" || arg === "-l") {
      const val = parseInt(args[i + 1], 10);
      if (!isNaN(val)) {
        options.limit = val;
        i++;
      }
    } else if (arg === "--concurrency" || arg === "-c") {
      const val = parseInt(args[i + 1], 10);
      if (!isNaN(val)) {
        options.concurrency = Math.max(1, Math.min(10, val));
        i++;
      }
    }
  }

  return options;
}

async function backfillCategories() {
  const options = parseArgs();

  console.log("=================================================");
  console.log(" 🧠  LLM Product Categorization Runner  ");
  console.log(` Force Re-classify: ${options.forceAll ? "YES" : options.generalOnly ? "GENERAL ONLY" : "UNCATEGORIZED ONLY"}`);
  console.log(` Concurrency: ${options.concurrency}`);
  console.log("=================================================");

  let query = db
    .select({
      id: scrapedProducts.id,
      title: scrapedProducts.title,
      domain: scrapedProducts.domain,
      category: scrapedProducts.category,
    })
    .from(scrapedProducts);

  if (options.forceAll) {
    // Re-classify all products with titles
    query = query.where(sql`${scrapedProducts.title} IS NOT NULL AND ${scrapedProducts.title} != ''`) as any;
  } else if (options.generalOnly) {
    // Re-classify items that are uncategorized or marked as General & Other
    query = query.where(
      or(
        isNull(scrapedProducts.category),
        eq(scrapedProducts.category, ""),
        eq(scrapedProducts.category, "General & Other")
      )
    ) as any;
  } else {
    query = query.where(or(isNull(scrapedProducts.category), eq(scrapedProducts.category, ""))) as any;
  }

  const items = await query.orderBy(desc(scrapedProducts.createdAt)).limit(options.limit || 5000);

  console.log(`Found ${items.length} products to process.\n`);

  if (items.length === 0) {
    console.log("✅ No products match the selection filter.");
    await client.end();
    process.exit(0);
  }

  let completed = 0;
  let successCount = 0;

  // Process items with bounded concurrency
  const queue = [...items];

  async function worker(workerId: number) {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item || !item.title) continue;

      const idx = ++completed;
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

        successCount++;
        console.log(
          `[${idx}/${items.length}] [${result.modelUsed}] "${item.title.slice(0, 40)}" ➔ 🏷️ ${result.category} > ${result.subCategory} (${result.targetAudience})`
        );
      } catch (err: any) {
        console.warn(`[${idx}/${items.length}] ❌ Error on product ${item.id}:`, err?.message);
      }
    }
  }

  const workers = Array.from({ length: options.concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  console.log("\n=================================================");
  console.log(`🎉 Complete: Successfully LLM-categorized ${successCount}/${items.length} products!`);
  console.log("=================================================");

  await client.end();
  process.exit(0);
}

backfillCategories().catch(async (e) => {
  console.error("Fatal error:", e);
  await client.end();
  process.exit(1);
});
