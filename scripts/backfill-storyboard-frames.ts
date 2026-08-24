import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads } from "../db/schema";
import { isNull, and, or, like, eq } from "drizzle-orm";
import { extractStoryboardFrames } from "../lib/video-storyboard";
import { uploadStoryboardFrames } from "../lib/b2-storage";

async function backfillStoryboards() {
  console.log("=== Backfill 5-Shot Storyboard Hover Frames ===");

  // Find video ads missing storyboard_urls
  const videoAds = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      mediaUrls: ads.mediaUrls,
      thumbnailUrl: ads.thumbnailUrl,
      mediaType: ads.mediaType,
    })
    .from(ads)
    .where(
      and(
        isNull(ads.storyboardUrls),
        or(
          eq(ads.mediaType, "video"),
          like(ads.thumbnailUrl, "%.mp4%"),
          like(ads.thumbnailUrl, "%/videos/%")
        )
      )
    )
    .limit(50);

  console.log(`Found ${videoAds.length} video ads needing storyboard extraction.`);

  let processed = 0;
  for (const ad of videoAds) {
    const firstVid = ad.mediaUrls?.find((u) => u.includes(".mp4") || u.includes("/videos/"));
    if (!firstVid) continue;

    console.log(`\n[${++processed}/${videoAds.length}] Extracting 5 frames for ${ad.adArchiveId}...`);
    try {
      const frames = await extractStoryboardFrames(firstVid, 5);
      if (frames.length > 0) {
        const urls = await uploadStoryboardFrames(frames, ad.adArchiveId);
        if (urls.length > 0) {
          await db
            .update(ads)
            .set({ storyboardUrls: urls })
            .where(eq(ads.id, ad.id));
          console.log(`  ✓ Saved ${urls.length} storyboard frames for ${ad.adArchiveId}`);
        }
      } else {
        console.log(`  - No frames captured (video link expired or inaccessible).`);
      }
    } catch (e: any) {
      console.warn(`  ✗ Failed for ${ad.adArchiveId}:`, e.message);
    }
  }

  console.log("\n=== Backfill Complete ===");
  process.exit(0);
}

backfillStoryboards();
