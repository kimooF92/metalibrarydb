import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { db } from "../db";
import { trackedPages } from "../db/schema";

async function main() {
  const pages = await db.query.trackedPages.findMany();
  console.log(`Total tracked pages in DB: ${pages.length}`);

  const groups: Record<string, typeof pages> = {};

  for (const p of pages) {
    const key = `${(p.displayName || "").trim().toLowerCase()}_${p.currentResults}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const dupes = Object.entries(groups).filter(([_, list]) => list.length > 1);
  console.log(`Found ${dupes.length} duplicate group(s) by (displayName + currentResults):`);

  for (const [key, list] of dupes) {
    console.log(`\nGroup key: "${key}" (${list.length} pages):`);
    for (const item of list) {
      console.log(`  - ID: ${item.id} | Name: "${item.displayName}" | Results: ${item.currentResults} | URL: ${item.url}`);
    }
  }
}

main().catch(console.error);
