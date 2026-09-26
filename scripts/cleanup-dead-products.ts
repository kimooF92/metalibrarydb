import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { db, client } from "../db";
import { scrapedProducts } from "../db/schema";
import { sql, and, isNotNull, or, eq } from "drizzle-orm";

async function main() {
  console.log("=================================================");
  console.log(" 🧹 Cleaning Up Failed & Dead Product Scrapings   ");
  console.log("=================================================\n");

  // Rule 1: "if the product failed for the 0dt price, flagged as not a fail, if the product image exist thats enough"
  // Flag any product with a valid image and title as SUCCESS (not a fail).
  const markedSuccess = await db
    .update(scrapedProducts)
    .set({
      scrapeStatus: "success",
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        isNotNull(scrapedProducts.mainImageUrl),
        sql`${scrapedProducts.mainImageUrl} != ''`,
        isNotNull(scrapedProducts.title),
        sql`${scrapedProducts.title} != ''`,
        sql`${scrapedProducts.scrapeStatus} IN ('failed', 'pending')`
      )
    )
    .returning({ id: scrapedProducts.id, title: scrapedProducts.title });

  console.log(`✅ [Rule 1] Flagged ${markedSuccess.length} products as SUCCESS (valid image exists, 0 DT is not a fail).`);

  // Rule 2: "dont recheck 404 and dead links again"
  // Flag any product with 404, dead link, expired shortlink, or unresolved DNS as 'ignored' with [Dead link] tag.
  const markedDead = await db
    .update(scrapedProducts)
    .set({
      scrapeStatus: "ignored",
      failureReason: sql`COALESCE(${scrapedProducts.failureReason}, '[Dead link] HTTP 404 Not Found')`,
      updatedAt: new Date(),
    })
    .where(
      and(
        sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`,
        or(
          sql`COALESCE(${scrapedProducts.failureReason}, '') LIKE '%404%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') LIKE '%Dead link%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') LIKE '%does not exist%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') LIKE '%ERR_NAME_NOT_RESOLVED%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') LIKE '%ENOTFOUND%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') LIKE '%ECONNREFUSED%'`,
          sql`COALESCE(${scrapedProducts.failureReason}, '') LIKE '%Short link expired%'`
        )
      )
    )
    .returning({ id: scrapedProducts.id, url: scrapedProducts.url });

  console.log(`🛑 [Rule 2] Flagged ${markedDead.length} products as IGNORED [Dead link] (will never be rechecked).`);

  // Rule 3: Flag remaining failed products that have no image and failed local recovery as [Impossible to scrape]
  const markedImpossible = await db
    .update(scrapedProducts)
    .set({
      failureReason: sql`CASE 
        WHEN ${scrapedProducts.failureReason} IS NOT NULL AND ${scrapedProducts.failureReason} NOT LIKE '[Impossible%' 
        THEN '[Impossible to scrape] ' || ${scrapedProducts.failureReason}
        ELSE '[Impossible to scrape] Failed on cloud and local extractors'
      END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scrapedProducts.scrapeStatus, "failed"),
        sql`${scrapedProducts.mainImageUrl} IS NULL`,
        sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%[Impossible%'`,
        sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%[Dead link%'`
      )
    )
    .returning({ id: scrapedProducts.id, url: scrapedProducts.url });

  console.log(`🔒 [Rule 3] Flagged ${markedImpossible.length} remaining failed products as [Impossible to scrape] (skipped).`);

  console.log("\n=================================================");
  console.log("🎉 Database product status cleanup complete!");
  console.log("=================================================");

  await client.end();
}

main().catch(async (err) => {
  console.error("Cleanup error:", err);
  await client.end();
  process.exit(1);
});
