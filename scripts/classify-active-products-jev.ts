import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { sql, eq, and, or, isNull } from "drizzle-orm";
import { classifyProductWithJev } from "../lib/typesafe-jev";

interface CliOptions {
  limit?: number;
  concurrency: number;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    concurrency: 5,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--limit" || arg === "-l") {
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
    } else if (arg === "--dry-run" || arg === "-d") {
      options.dryRun = true;
    }
  }

  return options;
}

// Sleep utility for retry backoff
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function classifyWithRetry(
  title: string,
  extraContext?: Parameters<typeof classifyProductWithJev>[1],
  maxRetries = 2
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await classifyProductWithJev(title, extraContext);
      if (res && res.category) return res;
    } catch (e: any) {
      if (attempt === maxRetries) throw e;
    }
    await sleep(600 * (attempt + 1));
  }
  return null;
}

async function main() {
  const options = parseArgs();

  console.log("===============================================================");
  console.log(" 🚀 JEV DECISION ENGINE: ACTIVE PRODUCTS CLASSIFIER");
  console.log(` Target Filter: Active products with running ads`);
  console.log(` Scrape Filter: NOT failed, deleted, or ignored`);
  console.log(` Category Scope: Uncategorized or 'General & Other'`);
  console.log(` Concurrency: ${options.concurrency}`);
  console.log(` Mode: ${options.dryRun ? "🔍 DRY-RUN (Preview only)" : "💾 LIVE WRITE"}`);
  if (options.limit) console.log(` Limit: ${options.limit}`);
  console.log("===============================================================\n");

  const startTime = Date.now();

  // Query explicit columns only (respecting AGENTS.md egress rules)
  let query = db
    .select({
      id: scrapedProducts.id,
      title: scrapedProducts.title,
      url: scrapedProducts.url,
      domain: scrapedProducts.domain,
      category: scrapedProducts.category,
      subCategory: scrapedProducts.subCategory,
      adSnippet: sql<string | null>`LEFT((
        SELECT caption FROM ${ads}
        WHERE ${ads.productId} = ${scrapedProducts.id}
          AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
          AND caption IS NOT NULL
          AND caption != ''
        LIMIT 1
      ), 120)`,
    })
    .from(scrapedProducts)
    .where(
      and(
        sql`${scrapedProducts.scrapeStatus} NOT IN ('failed', 'deleted', 'ignored')`,
        sql`${scrapedProducts.title} IS NOT NULL AND TRIM(${scrapedProducts.title}) != ''`,
        or(
          isNull(scrapedProducts.category),
          sql`TRIM(${scrapedProducts.category}) = ''`,
          sql`LOWER(${scrapedProducts.category}) = 'uncategorized'`,
          eq(scrapedProducts.category, "General & Other"),
          sql`LOWER(${scrapedProducts.category}) LIKE '%general%'`,
          eq(scrapedProducts.subCategory, "General Merchandise"),
          isNull(scrapedProducts.subCategory),
          sql`TRIM(${scrapedProducts.subCategory}) = ''`
        ),
        sql`EXISTS (
          SELECT 1 FROM ${ads}
          WHERE ${ads.productId} = ${scrapedProducts.id}
          AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
        )`
      )
    )
    .orderBy(
      sql`(SELECT COUNT(*) FROM ${ads} WHERE ${ads.productId} = ${scrapedProducts.id} AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)) DESC`,
      sql`${scrapedProducts.createdAt} DESC`
    );

  const items = options.limit ? await query.limit(options.limit) : await query;

  console.log(`📋 Found ${items.length} active uncategorized/general products to classify into proper niches.\n`);

  if (items.length === 0) {
    console.log("✅ All active products are already classified into proper niches!");
    await client.end();
    process.exit(0);
  }

  let completed = 0;
  let successCount = 0;
  let reclassifiedCount = 0;
  let generalRetainedCount = 0;
  let errorCount = 0;

  const categoryDistribution: Record<string, number> = {};

  const queue = [...items];

  async function worker(workerId: number) {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item || !item.title) continue;

      const idx = ++completed;
      const t0 = Date.now();

      try {
        const result = await classifyWithRetry(item.title, {
          url: item.url,
          domain: item.domain,
          adText: item.adSnippet,
          allowGeneral: false, // Strictly force classification into proper niches
        });
        const elapsed = Date.now() - t0;

        if (result && result.category) {
          successCount++;
          categoryDistribution[result.category] = (categoryDistribution[result.category] || 0) + 1;

          if (result.category !== "General & Other") {
            reclassifiedCount++;
          } else {
            generalRetainedCount++;
          }

          if (!options.dryRun) {
            // No gratuitous returning()
            await db
              .update(scrapedProducts)
              .set({
                category: result.category,
                subCategory: result.subCategory,
                targetAudience: result.targetAudience,
                updatedAt: new Date(),
              })
              .where(eq(scrapedProducts.id, item.id));
          }

          const pct = ((idx / items.length) * 100).toFixed(1);
          const icon = result.category !== "General & Other" ? "✨" : "📦";
          console.log(
            `[${idx}/${items.length} ${pct}%] [${elapsed}ms] ${icon} "${item.title.slice(0, 36)}" -> ${result.category} > ${result.subCategory} (${result.targetAudience})`
          );
        } else {
          errorCount++;
          console.warn(`[${idx}/${items.length}] ⚠️ No classification returned for "${item.title.slice(0, 36)}"`);
        }
      } catch (err: any) {
        errorCount++;
        console.warn(`[${idx}/${items.length}] ❌ Error on "${item.title.slice(0, 36)}":`, err?.message || err);
      }
    }
  }

  const workers = Array.from({ length: options.concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n===============================================================");
  console.log(`🏁 FINISHED IN ${totalDurationSec}s`);
  console.log(` Total processed: ${items.length}`);
  console.log(` Successfully classified: ${successCount}`);
  console.log(` Specific niche categories: ${reclassifiedCount} (${((reclassifiedCount / (items.length || 1)) * 100).toFixed(1)}%)`);
  console.log(` Retained as General & Other: ${generalRetainedCount}`);
  console.log(` Errors/Skipped: ${errorCount}`);
  console.log("---------------------------------------------------------------");
  console.log("📊 Category Breakdown:");
  for (const [cat, count] of Object.entries(categoryDistribution).sort((a, b) => b[1] - a[1])) {
    console.log(`   • ${cat.padEnd(28)} : ${count}`);
  }
  console.log("===============================================================");

  await client.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  await client.end();
  process.exit(1);
});
