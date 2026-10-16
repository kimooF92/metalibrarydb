import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { sql, eq, and, or, isNull } from "drizzle-orm";
import { resolvePriceDoubtWithJev, harvestPriceCandidates } from "../lib/doubt-detector";
import { formatPrice } from "../lib/format-price";
import { scrapeProductDirectHtml } from "../lib/html-scraper";

interface CliOptions {
  limit?: number;
  concurrency: number;
  allProducts: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    concurrency: 4,
    allProducts: false,
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
    } else if (arg === "--all" || arg === "-a") {
      options.allProducts = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  console.log("===============================================================");
  console.log(" 🎯 JEV PRICE REFEREE: 0 DT & PRICE DOUBT RESOLVER");
  console.log(` Target: Products with 0 DT, 0, or missing prices`);
  console.log(` Filter: ${options.allProducts ? "All products" : "Active products with running ads"}`);
  console.log(` Concurrency: ${options.concurrency}`);
  if (options.limit) console.log(` Limit: ${options.limit}`);
  console.log("===============================================================\n");

  const startTime = Date.now();

  const activeAdCondition = options.allProducts
    ? sql`1=1`
    : sql`EXISTS (
        SELECT 1 FROM ${ads}
        WHERE ${ads.productId} = ${scrapedProducts.id}
        AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)
      )`;

  let query = db
    .select({
      id: scrapedProducts.id,
      title: scrapedProducts.title,
      url: scrapedProducts.url,
      domain: scrapedProducts.domain,
      currentPrice: scrapedProducts.currentPrice,
      originalPrice: scrapedProducts.originalPrice,
      currency: scrapedProducts.currency,
      workspaceId: scrapedProducts.workspaceId,
    })
    .from(scrapedProducts)
    .where(
      and(
        sql`${scrapedProducts.scrapeStatus} NOT IN ('failed', 'deleted', 'ignored')`,
        sql`${scrapedProducts.url} IS NOT NULL AND TRIM(${scrapedProducts.url}) != ''`,
        or(
          isNull(scrapedProducts.currentPrice),
          sql`TRIM(${scrapedProducts.currentPrice}) = ''`,
          sql`${scrapedProducts.currentPrice} LIKE '%0 DT%'`,
          sql`${scrapedProducts.currentPrice} = '0'`,
          sql`${scrapedProducts.currentPrice} LIKE '%0 DH%'`,
          sql`${scrapedProducts.currentPrice} LIKE '%0.00%'`
        ),
        activeAdCondition
      )
    )
    .orderBy(
      sql`(SELECT COUNT(*) FROM ${ads} WHERE ${ads.productId} = ${scrapedProducts.id} AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL)) DESC`,
      sql`${scrapedProducts.createdAt} DESC`
    );

  const items = options.limit ? await query.limit(options.limit) : await query;

  console.log(`📋 Found ${items.length} product(s) with 0 DT / missing prices to resolve.\n`);

  if (items.length === 0) {
    console.log("✅ No 0 DT products found needing resolution!");
    await client.end();
    process.exit(0);
  }

  let completed = 0;
  let resolvedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const queue = [...items];

  async function worker(workerId: number) {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item || !item.url) continue;

      const idx = ++completed;
      const t0 = Date.now();

      const isMorocco =
        item.workspaceId === "00000000-0000-0000-0000-000000000002" ||
        /\.ma(\/|$)/i.test(item.domain || item.url);
      const itemSym = isMorocco ? "DH" : "DT";

      try {
        // Direct scrape HTML for live candidates
        const scrapeRes = await scrapeProductDirectHtml(item.url, 8000, 1, {
          defaultCurrency: isMorocco ? "MAD" : "TND",
          defaultCurrencySymbol: itemSym,
        });

        const rawHtml = scrapeRes.rawHtml || "";
        const directPrice = scrapeRes.data?.current_price;

        if (directPrice && !directPrice.startsWith("0")) {
          const finalPrice = formatPrice(directPrice, itemSym);
          await db
            .update(scrapedProducts)
            .set({
              currentPrice: finalPrice,
              originalPrice: scrapeRes.data?.original_price
                ? formatPrice(scrapeRes.data.original_price, itemSym)
                : item.originalPrice,
              updatedAt: new Date(),
            })
            .where(eq(scrapedProducts.id, item.id));

          resolvedCount++;
          const elapsed = Date.now() - t0;
          console.log(
            `[${idx}/${items.length}] [${elapsed}ms] 🟢 Direct Price: "${item.title?.slice(0, 30)}" ➔ ${finalPrice}`
          );
          continue;
        }

        let candidateHtml = rawHtml;
        let candidateMarkdown = "";

        // If direct HTML found no price candidates, invoke rendered extractor (Firecrawl / Playwright)
        if (harvestPriceCandidates(rawHtml, "", itemSym).length === 0) {
          try {
            const { extractProductFromUrl } = await import("../lib/firecrawl");
            const deepRes = await extractProductFromUrl(item.url);
            if (deepRes.success && deepRes.data) {
              candidateHtml = deepRes.raw?.html || deepRes.raw?.data?.html || "";
              candidateMarkdown = deepRes.raw?.markdown || deepRes.raw?.data?.markdown || "";

              if (deepRes.data.current_price && !deepRes.data.current_price.startsWith("0")) {
                const finalPrice = formatPrice(deepRes.data.current_price, itemSym);
                await db
                  .update(scrapedProducts)
                  .set({
                    currentPrice: finalPrice,
                    originalPrice: deepRes.data.original_price
                      ? formatPrice(deepRes.data.original_price, itemSym)
                      : item.originalPrice,
                    updatedAt: new Date(),
                  })
                  .where(eq(scrapedProducts.id, item.id));

                resolvedCount++;
                const elapsed = Date.now() - t0;
                console.log(
                  `[${idx}/${items.length}] [${elapsed}ms] 🚀 Rendered Scrape: "${item.title?.slice(0, 30)}" ➔ ${finalPrice}`
                );
                continue;
              }
            }
          } catch (deepErr: any) {
            // fallback error ignored
          }
        }

        // Run Jev Price Referee on harvested candidates
        const resolved = await resolvePriceDoubtWithJev({
          productTitle: item.title || "Product",
          extractedPrice: item.currentPrice || `0 ${itemSym}`,
          html: candidateHtml,
          markdown: candidateMarkdown,
          fallbackCurrencySymbol: itemSym,
        });

        const elapsed = Date.now() - t0;

        if (resolved?.resolvedPrice && !resolved.resolvedPrice.startsWith("0")) {
          const finalPrice = formatPrice(resolved.resolvedPrice, itemSym);
          await db
            .update(scrapedProducts)
            .set({
              currentPrice: finalPrice,
              updatedAt: new Date(),
            })
            .where(eq(scrapedProducts.id, item.id));

          resolvedCount++;
          console.log(
            `[${idx}/${items.length}] [${elapsed}ms] 🎯 Jev Resolved: "${item.title?.slice(0, 30)}" ➔ ${finalPrice} (${resolved.modelUsed})`
          );
        } else {
          skippedCount++;
          console.log(
            `[${idx}/${items.length}] [${elapsed}ms] ⚠️ Could not resolve price for "${item.title?.slice(0, 30)}" (${item.url.slice(0, 45)})`
          );
        }
      } catch (err: any) {
        errorCount++;
        console.warn(`[${idx}/${items.length}] ❌ Error on "${item.title?.slice(0, 30)}":`, err?.message || err);
      }
    }
  }

  const workers = Array.from({ length: options.concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n===============================================================");
  console.log(`🏁 FINISHED IN ${totalDurationSec}s`);
  console.log(` Total processed: ${items.length}`);
  console.log(` Successfully resolved real prices: ${resolvedCount} (${((resolvedCount / (items.length || 1)) * 100).toFixed(1)}%)`);
  console.log(` Skipped / unresolved: ${skippedCount}`);
  console.log(` Errors: ${errorCount}`);
  console.log("===============================================================");

  await client.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  await client.end();
  process.exit(1);
});
