import { db } from "../db";
import { trackedPages, scanHistory, adObservations, creativeScans, queue, discoveredPages } from "../db/schema";
import { eq, and, ne } from "drizzle-orm";

async function run() {
  console.log("🔍 Checking for tracked pages with mismatched URLs or search types...");

  const allPages = await db.query.trackedPages.findMany();
  console.log(`Total tracked pages in DB: ${allPages.length}`);

  const mismatched = allPages.filter((p) => {
    const hasValidPageId = p.pageId && /^\d+$/.test(p.pageId.trim());
    const isKeywordUrl = p.url.includes("search_type=keyword_exact_phrase") || p.url.includes("search_type=keyword_unordered") || p.url.includes("&q=");
    const isKeywordSearchType = p.searchType !== "page";
    return hasValidPageId && (isKeywordUrl || isKeywordSearchType);
  });

  console.log(`Found ${mismatched.length} page(s) with valid Page ID but keyword search URL/type.`);

  for (const page of mismatched) {
    const cleanPageId = page.pageId!.trim();
    const country = page.country || "TN";
    const canonicalUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${cleanPageId}&search_type=page&media_type=all`;

    console.log(`\nFixing page [${page.id}]: "${page.displayName || cleanPageId}"`);
    console.log(`  Old URL: ${page.url}`);
    console.log(`  New URL: ${canonicalUrl}`);

    // Check if canonical URL already exists in another row
    const existing = await db.query.trackedPages.findFirst({
      where: and(eq(trackedPages.url, canonicalUrl), ne(trackedPages.id, page.id)),
    });

    if (existing) {
      console.log(`  Merging into existing record [${existing.id}]...`);
      // Re-point child relations
      await db.update(scanHistory).set({ trackedPageId: existing.id }).where(eq(scanHistory.trackedPageId, page.id));
      await db.update(adObservations).set({ trackedPageId: existing.id }).where(eq(adObservations.trackedPageId, page.id));
      await db.update(creativeScans).set({ trackedPageId: existing.id }).where(eq(creativeScans.trackedPageId, page.id));
      await db.update(queue).set({ trackedPageId: existing.id }).where(eq(queue.trackedPageId, page.id));
      await db.update(discoveredPages).set({ trackedPageId: existing.id }).where(eq(discoveredPages.trackedPageId, page.id));

      // Update existing record
      await db.update(trackedPages).set({
        landingPage: existing.landingPage || page.landingPage || page.url,
        displayName: existing.displayName || page.displayName,
        updatedAt: new Date(),
      }).where(eq(trackedPages.id, existing.id));

      // Delete duplicate
      await db.delete(trackedPages).where(eq(trackedPages.id, page.id));
      console.log(`  ✓ Merged and removed duplicate.`);
    } else {
      // Update in place
      await db.update(trackedPages).set({
        url: canonicalUrl,
        searchType: "page",
        pageId: cleanPageId,
        landingPage: page.landingPage || page.url,
        updatedAt: new Date(),
      }).where(eq(trackedPages.id, page.id));
      console.log(`  ✓ Updated in place.`);
    }
  }

  console.log("\n🎉 All merged and resolved pages normalized successfully!");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
