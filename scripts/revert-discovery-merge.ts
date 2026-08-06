import { db } from "../db";
import { discoveredPages, trackedPages } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
  console.log("Reverting auto-merged discovered pages back to 'discovered' status...");

  // Find all discovered pages currently marked as 'imported'
  const importedPages = await db.query.discoveredPages.findMany({
    where: eq(discoveredPages.status, "imported"),
  });

  console.log(`Found ${importedPages.length} imported discovered pages to reset.`);

  let resetCount = 0;
  for (const dp of importedPages) {
    // Reset status to 'discovered' and clear trackedPageId link
    await db
      .update(discoveredPages)
      .set({
        status: "discovered",
        trackedPageId: null,
        updatedAt: new Date(),
      })
      .where(eq(discoveredPages.id, dp.id));

    // Remove from trackedPages if it was created as a pending page from discovery
    if (dp.trackedPageId) {
      await db
        .delete(trackedPages)
        .where(eq(trackedPages.id, dp.trackedPageId))
        .catch(() => {});
    }

    resetCount++;
  }

  console.log(`Successfully reset ${resetCount} pages back to 'discovered' status!`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to revert pages:", err);
  process.exit(1);
});
