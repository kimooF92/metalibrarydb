import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { db } from "../db";
import { trackedPages, scanHistory, queue } from "../db/schema";
import { inArray, eq } from "drizzle-orm";

async function dedupe() {
  const pages = await db.query.trackedPages.findMany();

  const groups: Record<string, typeof pages> = {};

  for (const p of pages) {
    // Key by lowercased display name + current results (or pageId if available)
    const nameKey = (p.displayName || "").trim().toLowerCase();
    const key = p.pageId ? `pageId_${p.pageId}` : `name_${nameKey}_res_${p.currentResults}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const dupes = Object.entries(groups).filter(([_, list]) => list.length > 1);

  console.log(`Total tracked pages: ${pages.length}`);
  console.log(`Found ${dupes.length} duplicate group(s).`);

  let totalRemoved = 0;

  for (const [key, list] of dupes) {
    // Keep the one with the most recent lastChecked or createdAt
    list.sort((a, b) => {
      const timeA = a.lastChecked ? new Date(a.lastChecked).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.lastChecked ? new Date(b.lastChecked).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA; // Descending
    });

    const keep = list[0];
    const toDelete = list.slice(1);

    console.log(`\nGroup [${key}]: Keeping ID ${keep.id} ("${keep.displayName}")`);

    for (const d of toDelete) {
      console.log(`  - Removing duplicate ID ${d.id} ("${d.displayName}", ${d.currentResults} ads)`);

      // Re-assign scan histories to keeper or delete queue & page
      await db.delete(queue).where(eq(queue.trackedPageId, d.id));
      await db.delete(scanHistory).where(eq(scanHistory.trackedPageId, d.id));
      await db.delete(trackedPages).where(eq(trackedPages.id, d.id));
      totalRemoved++;
    }
  }

  console.log(`\n✅ Deduplication Complete! Removed ${totalRemoved} duplicate pages.`);
}

dedupe().catch(console.error);
