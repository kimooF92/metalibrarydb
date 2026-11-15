import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { scrapedProducts, queue, trackedPages } from "../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { deleteByPrefix } from "../lib/cache-service";
import { isValidPageId } from "../lib/utils";
import { isGeoBlockedOrForbiddenError } from "../lib/product-validator";

async function main() {
  console.log("=================================================");
  console.log("   🛡️  Queue 403 / Geo Failed Products for Local Worker");
  console.log("=================================================\n");

  // 1. Fetch strictly 403 / Forbidden / Geo-blocked failed products
  const failed403Items = await db
    .select({
      id: scrapedProducts.id,
      url: scrapedProducts.url,
      pageId: scrapedProducts.pageId,
      workspaceId: scrapedProducts.workspaceId,
      failureReason: scrapedProducts.failureReason,
    })
    .from(scrapedProducts)
    .where(
      and(
        eq(scrapedProducts.scrapeStatus, "failed"),
        // Strictly target 403 / Forbidden / Cloudflare / Geo challenge failures
        sql`(
          ${scrapedProducts.failureReason} ILIKE '%403%'
          OR ${scrapedProducts.failureReason} ILIKE '%forbidden%'
          OR ${scrapedProducts.failureReason} ILIKE '%cloudflare%'
          OR ${scrapedProducts.failureReason} ILIKE '%cf-challenge%'
          OR ${scrapedProducts.failureReason} ILIKE '%geo%'
        )`,
        // Exclude dead links, 404s, and category URLs
        sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%[Dead link%'`,
        sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%[Impossible%'`,
        sql`COALESCE(${scrapedProducts.failureReason}, '') NOT LIKE '%404%'`,
        sql`LOWER(${scrapedProducts.url}) NOT LIKE '%/category%'`,
        sql`LOWER(${scrapedProducts.url}) NOT LIKE '%/categories%'`
      )
    );

  // Additional double-check using our centralized helper
  const candidateItems = failed403Items.filter((item) =>
    isGeoBlockedOrForbiddenError(item.failureReason)
  );

  console.log(`Found ${candidateItems.length} failed 403/geo product(s) eligible for local worker queueing.`);

  if (candidateItems.length === 0) {
    console.log("✅ No failed 403 products currently found in database.");
    await client.end();
    process.exit(0);
  }

  // 2. Fetch existing pending queue jobs to avoid duplicate entries
  const existingPendingJobs = await db
    .select({
      failureReason: queue.failureReason,
    })
    .from(queue)
    .where(
      and(
        eq(queue.jobType, "product_scrape"),
        eq(queue.status, "pending")
      )
    );

  const pendingJobProductIds = new Set<string>();
  for (const job of existingPendingJobs) {
    if (job.failureReason?.startsWith("product:")) {
      pendingJobProductIds.add(job.failureReason.replace("product:", ""));
    }
  }

  // 3. Pre-fetch tracked pages map for pageId resolution
  const distinctPageIds = Array.from(
    new Set(candidateItems.map((item) => item.pageId).filter(isValidPageId))
  ) as string[];

  const trackedPageMap = new Map<string, string>();
  if (distinctPageIds.length > 0) {
    const pages = await db
      .select({
        id: trackedPages.id,
        pageId: trackedPages.pageId,
      })
      .from(trackedPages)
      .where(inArray(trackedPages.pageId, distinctPageIds));

    for (const p of pages) {
      if (p.pageId) trackedPageMap.set(p.pageId, p.id);
    }
  }

  let queuedCount = 0;
  let alreadyPendingCount = 0;
  const now = new Date();

  for (const item of candidateItems) {
    const isAlreadyQueued = pendingJobProductIds.has(item.id);

    // Update product status to pending with explicit local worker fallback flag
    await db
      .update(scrapedProducts)
      .set({
        scrapeStatus: "pending",
        failureReason: `[Geo 403 Forbidden] ${item.failureReason || "Blocked by cloud geo/firewall"} - Queued for local worker residential fallback`,
        updatedAt: now,
      })
      .where(eq(scrapedProducts.id, item.id));

    if (isAlreadyQueued) {
      alreadyPendingCount++;
      console.log(`  ℹ️  Product ${item.id} already in queue. Status set to pending.`);
      continue;
    }

    const trackedPageUuid = item.pageId ? trackedPageMap.get(item.pageId) || null : null;

    // Enqueue with top priority 10 for immediate residential pickup
    await db
      .insert(queue)
      .values({
        trackedPageId: trackedPageUuid,
        jobType: "product_scrape",
        status: "pending",
        priority: 10,
        failureReason: `product:${item.id}`,
        workspaceId: item.workspaceId || null,
        createdAt: now,
      })
      .onConflictDoNothing();

    pendingJobProductIds.add(item.id);
    queuedCount++;
    console.log(`  ✅ Queued Product ${item.id} (${item.url.slice(0, 70)}...)`);
  }

  // Invalidate product cache
  await deleteByPrefix("cache:products:").catch(() => {});

  console.log("\n=================================================");
  console.log(`🎉 403 Fallback Queue Summary:`);
  console.log(`   - 403 / Geo Blocked Products: ${candidateItems.length}`);
  console.log(`   - Newly Enqueued to Local:    ${queuedCount}`);
  console.log(`   - Already Pending in Queue:   ${alreadyPendingCount}`);
  console.log("=================================================");
  console.log("The local residential worker will pick these up with priority 10.");

  await client.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Fatal queueing error:", err);
  await client.end();
  process.exit(1);
});
