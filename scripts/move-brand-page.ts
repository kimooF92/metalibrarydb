import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client, db } from "../db";
import {
  workspaces,
  brandDomains,
  trackedPages,
  scrapedProducts,
  queue,
  activityNotifications,
} from "../db/schema";
import { eq, inArray, or, and, sql } from "drizzle-orm";
import { deleteByPrefix, deleteCached } from "../lib/cache-service";

async function main() {
  console.log("🔄 Starting Brand Relocation Execution...");

  const targetCountry = "DZ";
  const brandDomainId = "e510d532-c9c9-4ea1-8d95-c419342ce85a"; // lekidi.com

  // 1. Fetch Algeria Workspace
  const [algeriaWs] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      countryCode: workspaces.countryCode,
      flag: workspaces.flag,
    })
    .from(workspaces)
    .where(eq(workspaces.countryCode, targetCountry))
    .limit(1);

  if (!algeriaWs) {
    throw new Error(`Target workspace for country ${targetCountry} not found!`);
  }

  console.log(`📍 Destination Workspace: ${algeriaWs.flag} ${algeriaWs.name} (${algeriaWs.id})`);

  // 2. Fetch Brand Domain & Linked Pages
  const [bDomain] = await db
    .select({
      id: brandDomains.id,
      domain: brandDomains.domain,
      displayName: brandDomains.displayName,
      workspaceId: brandDomains.workspaceId,
    })
    .from(brandDomains)
    .where(eq(brandDomains.id, brandDomainId))
    .limit(1);

  if (!bDomain) {
    throw new Error(`Brand domain ${brandDomainId} not found!`);
  }

  const sourceWorkspaceId = bDomain.workspaceId;
  console.log(`📦 Brand: "${bDomain.displayName}" (${bDomain.domain}), Source Workspace: ${sourceWorkspaceId}`);

  const pages = await db
    .select({
      id: trackedPages.id,
      pageId: trackedPages.pageId,
      displayName: trackedPages.displayName,
      pageRole: trackedPages.pageRole,
      workspaceId: trackedPages.workspaceId,
    })
    .from(trackedPages)
    .where(eq(trackedPages.brandDomainId, brandDomainId));

  console.log(`📄 Found ${pages.length} linked pages:`);
  pages.forEach((p) => {
    console.log(`   - [${p.pageRole}] ${p.displayName} (Page ID: ${p.pageId}, UUID: ${p.id})`);
  });

  const trackedPageIds = pages.map((p) => p.id);
  const metaPageIds = pages.map((p) => p.pageId).filter(Boolean) as string[];

  // 3. Count products before move
  const [initialProducts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scrapedProducts)
    .where(
      or(
        eq(scrapedProducts.brandDomainId, brandDomainId),
        inArray(scrapedProducts.pageId, metaPageIds)
      )
    );

  console.log(`🛍️ Linked catalog products found: ${initialProducts?.count || 0}`);

  const now = new Date();

  // 4. Atomic Database Transaction
  await db.transaction(async (tx) => {
    // 4a. Update brand_domains
    await tx
      .update(brandDomains)
      .set({
        workspaceId: algeriaWs.id,
        updatedAt: now,
      })
      .where(eq(brandDomains.id, brandDomainId));

    // 4b. Update tracked_pages
    await tx
      .update(trackedPages)
      .set({
        workspaceId: algeriaWs.id,
        country: algeriaWs.countryCode,
        updatedAt: now,
      })
      .where(inArray(trackedPages.id, trackedPageIds));

    // 4c. Update scraped_products
    await tx
      .update(scrapedProducts)
      .set({
        workspaceId: algeriaWs.id,
        updatedAt: now,
      })
      .where(
        or(
          eq(scrapedProducts.brandDomainId, brandDomainId),
          inArray(scrapedProducts.pageId, metaPageIds)
        )
      );

    // 4d. Update queue
    await tx
      .update(queue)
      .set({ workspaceId: algeriaWs.id })
      .where(inArray(queue.trackedPageId, trackedPageIds));

    // 4e. Update activity_notifications
    await tx
      .update(activityNotifications)
      .set({ workspaceId: algeriaWs.id })
      .where(inArray(activityNotifications.trackedPageId, trackedPageIds));
  });

  console.log("✅ Database transaction committed successfully.");

  // 5. Invalidate Caches
  console.log("🧹 Invalidating Upstash Redis and in-memory caches...");
  const workspacesToInvalidate = [sourceWorkspaceId, algeriaWs.id].filter(Boolean) as string[];

  const cachePromises: Promise<any>[] = [deleteByPrefix("cache:workspaces:")];
  for (const wsId of workspacesToInvalidate) {
    cachePromises.push(
      deleteByPrefix(`cache:pages:${wsId}:`),
      deleteCached(`cache:stats:${wsId}`),
      deleteByPrefix(`cache:products:${wsId}:`),
      deleteByPrefix(`cache:spy_ads:${wsId}:`),
      deleteByPrefix(`cache:fresh_winners:${wsId}:`),
      deleteByPrefix(`cache:fresh_winners_stats:${wsId}`),
      deleteByPrefix(`cache:brand:${wsId}:`),
      deleteCached(`cache:spy_brands:${wsId}`),
      deleteCached(`cache:notifications:summary:${wsId}`)
    );
  }

  await Promise.allSettled(cachePromises);
  console.log("✅ Caches invalidated.");

  // 6. Verification with strict assertions (Finding [P2] Fix)
  console.log("\n🔍 Verification Check:");
  const [verifyBDomain] = await db
    .select({ id: brandDomains.id, workspaceId: brandDomains.workspaceId })
    .from(brandDomains)
    .where(eq(brandDomains.id, brandDomainId));

  if (!verifyBDomain || verifyBDomain.workspaceId !== algeriaWs.id) {
    throw new Error(
      `❌ Verification failed: Brand domain workspaceId is "${verifyBDomain?.workspaceId}", expected "${algeriaWs.id}"`
    );
  }

  const verifyPages = await db
    .select({ id: trackedPages.id, pageId: trackedPages.pageId, country: trackedPages.country, workspaceId: trackedPages.workspaceId })
    .from(trackedPages)
    .where(eq(trackedPages.brandDomainId, brandDomainId));

  if (verifyPages.length !== pages.length) {
    throw new Error(
      `❌ Verification failed: Found ${verifyPages.length} linked pages in verification, expected ${pages.length}`
    );
  }

  for (const p of verifyPages) {
    if (p.workspaceId !== algeriaWs.id || p.country !== "DZ") {
      throw new Error(
        `❌ Verification failed: Page ${p.pageId} has workspaceId="${p.workspaceId}", country="${p.country}". Expected "${algeriaWs.id}" and "DZ".`
      );
    }
  }

  const [verifyProducts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scrapedProducts)
    .where(
      and(
        eq(scrapedProducts.workspaceId, algeriaWs.id),
        or(
          eq(scrapedProducts.brandDomainId, brandDomainId),
          inArray(scrapedProducts.pageId, metaPageIds)
        )
      )
    );

  const finalProductCount = verifyProducts?.count || 0;
  const initialProductCount = initialProducts?.count || 0;
  if (finalProductCount !== initialProductCount) {
    throw new Error(
      `❌ Verification failed: Moved products count mismatch. Expected ${initialProductCount}, got ${finalProductCount}.`
    );
  }

  console.log(`   ✓ Brand Domain Workspace ID: ${verifyBDomain.workspaceId} (Algeria)`);
  verifyPages.forEach((p) => {
    console.log(`   ✓ Page ${p.pageId}: country=${p.country}, workspaceId=${p.workspaceId}`);
  });
  console.log(`   ✓ Verified ${finalProductCount}/${initialProductCount} catalog products in Algeria workspace.`);

  console.log("\n🎉 Brand & Linked Pages Relocation Verified Successfully!");
}

main()
  .catch((err) => {
    console.error("❌ Relocation failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
