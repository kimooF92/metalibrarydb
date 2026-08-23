import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads } from "../db/schema";
import { sql, desc } from "drizzle-orm";

async function diagnose() {
  console.log("=== Diagnosing Stored Ads Media ===");

  const recentAds = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      mediaType: ads.mediaType,
      mediaUrls: ads.mediaUrls,
      thumbnailUrl: ads.thumbnailUrl,
      thumbnailStoragePath: ads.thumbnailStoragePath,
      createdAt: ads.createdAt,
    })
    .from(ads)
    .orderBy(desc(ads.createdAt))
    .limit(15);

  console.log(`Found ${recentAds.length} recent ads:`);
  for (const ad of recentAds) {
    console.log(`\nAd ID: ${ad.adArchiveId} | Type: ${ad.mediaType}`);
    console.log(`  Thumbnail: ${ad.thumbnailUrl}`);
    console.log(`  Storage Path: ${ad.thumbnailStoragePath}`);
    console.log(`  Media URLs (${ad.mediaUrls?.length || 0}):`, ad.mediaUrls);
  }

  const mediaTypeCounts = await db
    .select({
      mediaType: ads.mediaType,
      count: sql<number>`count(*)`,
    })
    .from(ads)
    .groupBy(ads.mediaType);

  console.log("\nMedia Type Breakdown in DB:", mediaTypeCounts);
  process.exit(0);
}

diagnose();
