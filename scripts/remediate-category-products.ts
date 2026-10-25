import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { scrapedProducts, queue } from "../db/schema";
import { sql, and, not, eq, inArray } from "drizzle-orm";
import { isCategoryUrl } from "../lib/url-parser";

async function main() {
  console.log("Checking for category URLs in scraped_products...");

  // Select candidates that have /category or /categories in URL or match isCategoryUrl
  const candidates = await db
    .select({
      id: scrapedProducts.id,
      url: scrapedProducts.url,
      scrapeStatus: scrapedProducts.scrapeStatus,
    })
    .from(scrapedProducts)
    .where(
      and(
        sql`lower(${scrapedProducts.url}) LIKE '%/categor%'`,
        not(eq(scrapedProducts.scrapeStatus, "deleted"))
      )
    );

  const toIgnore = candidates.filter(
    (c) => isCategoryUrl(c.url) || (c.url && c.url.toLowerCase().includes("/category"))
  );

  console.log(`Found ${toIgnore.length} active/pending/success category products to mark as 'ignored'.`);

  if (toIgnore.length > 0) {
    const ids = toIgnore.map((c) => c.id);

    // 1. Update scrapedProducts
    await db
      .update(scrapedProducts)
      .set({
        scrapeStatus: "ignored",
        failureReason: "Category URL ignored - not a product page",
        rawExtract: null,
        updatedAt: new Date(),
      })
      .where(inArray(scrapedProducts.id, ids));

    console.log(`Updated ${ids.length} records in scraped_products to 'ignored'.`);

    // 2. Mark any related queue jobs completed/cancelled
    for (const id of ids) {
      await db
        .update(queue)
        .set({
          status: "completed",
          failureReason: "Category URL skipped",
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(queue.jobType, "product_scrape"),
            eq(queue.status, "pending"),
            eq(queue.failureReason, `product:${id}`)
          )
        );
    }
    console.log("Cleaned up any associated pending queue jobs.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error remediating category products:", err);
  process.exit(1);
});
