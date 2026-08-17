import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { uploadMediaFromUrlToB2, isB2Configured } from "../lib/b2-storage";

async function main() {
  if (!isB2Configured()) {
    console.error("Backblaze B2 is not configured in .env.local!");
    process.exit(1);
  }

  console.log("Starting Backblaze B2 Media Migration Script...");

  // 1. Fetch video ads that don't yet point to Backblaze B2
  const targetAds = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      mediaType: ads.mediaType,
      mediaUrls: ads.mediaUrls,
      thumbnailUrl: ads.thumbnailUrl,
    })
    .from(ads)
    .where(
      sql`(${ads.mediaType} = 'video' OR ${ads.thumbnailUrl} IS NOT NULL) AND NOT (${ads.thumbnailUrl} LIKE '%backblazeb2.com%')`
    )
    .limit(50);

  console.log(`Found ${targetAds.length} candidate ad(s) to process for Backblaze B2 backup.`);

  let successCount = 0;
  let skippedCount = 0;

  for (const ad of targetAds) {
    console.log(`\nProcessing Ad Archive ID: ${ad.adArchiveId} (Type: ${ad.mediaType})`);
    let updated = false;
    const newMediaUrls = [...(ad.mediaUrls || [])];
    let newThumbnailUrl = ad.thumbnailUrl;

    // Backup Video Media
    if (ad.mediaUrls && ad.mediaUrls.length > 0) {
      for (let i = 0; i < ad.mediaUrls.length; i++) {
        const url = ad.mediaUrls[i];
        if (url.includes("backblazeb2.com")) continue;

        if (url.includes(".mp4") || url.includes("video") || ad.mediaType === "video") {
          console.log(`  -> Backing up video URL: ${url.substring(0, 70)}...`);
          const b2VideoUrl = await uploadMediaFromUrlToB2(url, "videos", `${ad.adArchiveId}_${i}`);
          if (b2VideoUrl) {
            newMediaUrls[i] = b2VideoUrl;
            updated = true;
            console.log(`  ✓ Video saved to B2: ${b2VideoUrl}`);
          }
        }
      }
    }

    // Backup Thumbnail
    if (ad.thumbnailUrl && !ad.thumbnailUrl.includes("backblazeb2.com")) {
      console.log(`  -> Backing up thumbnail: ${ad.thumbnailUrl.substring(0, 70)}...`);
      const b2ThumbUrl = await uploadMediaFromUrlToB2(ad.thumbnailUrl, "thumbnails", ad.adArchiveId);
      if (b2ThumbUrl) {
        newThumbnailUrl = b2ThumbUrl;
        updated = true;
        console.log(`  ✓ Thumbnail saved to B2: ${b2ThumbUrl}`);
      }
    }

    if (updated) {
      await db
        .update(ads)
        .set({
          mediaUrls: newMediaUrls,
          thumbnailUrl: newThumbnailUrl,
          updatedAt: new Date(),
        })
        .where(eq(ads.id, ad.id));
      successCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n=== Migration Run Complete ===`);
  console.log(`Successfully backed up: ${successCount} ad(s)`);
  console.log(`Skipped / expired: ${skippedCount} ad(s)`);

  process.exit(0);
}

main();
