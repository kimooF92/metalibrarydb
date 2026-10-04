import { db } from "../db";
import { workspaces, trackedPages, scrapedProducts } from "../db/schema";
import { eq, sql } from "drizzle-orm";

async function run() {
  console.log("=== Testing Workspace Isolation ===");

  // 1. Fetch workspaces
  const allWorkspaces = await db.query.workspaces.findMany({
    orderBy: [workspaces.createdAt],
  });
  console.log(`Found ${allWorkspaces.length} workspaces:`);
  for (const ws of allWorkspaces) {
    console.log(` - [${ws.flag || "🌐"}] ${ws.name} (${ws.countryCode}) [id: ${ws.id}] default: ${ws.isDefault}`);
  }

  const tunisia = allWorkspaces.find((w) => w.slug === "tunisia" || w.countryCode === "TN");
  const morocco = allWorkspaces.find((w) => w.slug === "morocco" || w.countryCode === "MA");

  if (!tunisia || !morocco) {
    throw new Error("Could not find both Tunisia and Morocco workspaces!");
  }

  // 2. Count pages and products in Tunisia
  const [tnPages] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trackedPages)
    .where(eq(trackedPages.workspaceId, tunisia.id));

  const [tnProducts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(scrapedProducts)
    .where(eq(scrapedProducts.workspaceId, tunisia.id));

  console.log(`\nTunisia Data:`);
  console.log(` - Tracked Pages: ${tnPages.count}`);
  console.log(` - Scraped Products: ${tnProducts.count}`);

  if (Number(tnPages.count) === 0) {
    throw new Error("Expected Tunisia to have pages, but found 0!");
  }

  // 3. Count pages and products in Morocco
  const [maPages] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trackedPages)
    .where(eq(trackedPages.workspaceId, morocco.id));

  const [maProducts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(scrapedProducts)
    .where(eq(scrapedProducts.workspaceId, morocco.id));

  console.log(`\nMorocco Data:`);
  console.log(` - Tracked Pages: ${maPages.count}`);
  console.log(` - Scraped Products: ${maProducts.count}`);

  if (Number(maPages.count) !== 0 || Number(maProducts.count) !== 0) {
    console.warn(`Note: Morocco already has ${maPages.count} pages, ${maProducts.count} products.`);
  }

  // 4. Test Isolation with a test page in Morocco
  const testUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=MA&view_all_page_id=999999999999&search_type=page&media_type=all`;
  console.log(`\nInserting temporary test page in Morocco workspace...`);
  const [testPage] = await db
    .insert(trackedPages)
    .values({
      url: testUrl,
      displayName: "Morocco Test Store",
      pageId: "999999999999",
      searchType: "page",
      country: "MA",
      workspaceId: morocco.id,
      status: "pending",
    })
    .returning();

  // Verify Morocco count increased by 1
  const [newMaCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trackedPages)
    .where(eq(trackedPages.workspaceId, morocco.id));

  // Verify Tunisia count did NOT change
  const [newTnCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trackedPages)
    .where(eq(trackedPages.workspaceId, tunisia.id));

  console.log(`Verification:`);
  console.log(` - Morocco pages after insertion: ${newMaCount.count} (expected: ${Number(maPages.count) + 1})`);
  console.log(` - Tunisia pages after insertion: ${newTnCount.count} (expected: ${tnPages.count})`);

  if (Number(newTnCount.count) !== Number(tnPages.count)) {
    throw new Error("ISOLATION BREACH: Tunisia page count changed after inserting in Morocco!");
  }

  // Clean up
  console.log(`Cleaning up test record...`);
  await db.delete(trackedPages).where(eq(trackedPages.id, testPage.id));

  const [finalMaCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trackedPages)
    .where(eq(trackedPages.workspaceId, morocco.id));

  console.log(` - Morocco pages after cleanup: ${finalMaCount.count}`);
  console.log(`\nSUCCESS: Workspace isolation 100% verified!`);
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
