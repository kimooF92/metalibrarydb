import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads } from "../db/schema";
import { or, like, eq, sql } from "drizzle-orm";
import { uploadMediaWithHashing, isB2Configured } from "../lib/b2-storage";

async function backfillUncachedMedia() {
  console.log("=== Backfilling Uncached Images & Carousels to B2 ===");

  if (!isB2Configured()) {
    console.error("Backblaze B2 is not configured. Check .env.local!");
    process.exit(1);
  }

  // Find ads whose thumbnailUrl or mediaUrls contain raw external URLs (fbcdn, scontent, etc.)
  const targetAds = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      mediaType: ads.mediaType,
      thumbnailUrl: ads.thumbnailUrl,
      mediaUrls: ads.mediaUrls,
      mediaHash: ads.mediaHash,
      perceptualHash: ads.perceptualHash,
    })
    .from(ads)
    .where(
      or(
        like(ads.thumbnailUrl, "%fbcdn.net%"),
        like(ads.thumbnailUrl, "%scontent%"),
        like(ads.thumbnailUrl, "%cdninstagram%")
      )
    )
    .limit(50);

  console.log(`Found ${targetAds.length} ad(s) with raw CDN media to cache in B2.`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < targetAds.length; i++) {
    const ad = targetAds[i];
    console.log(`\n[${i + 1}/${targetAds.length}] Processing Ad ${ad.adArchiveId} (${ad.mediaType})...`);

    let finalThumbnailUrl = ad.thumbnailUrl;
    let finalMediaUrls = ad.mediaUrls || [];
    let mediaHash = ad.mediaHash;
    let perceptualHash = ad.perceptualHash;

    // 1. Cache thumbnail
    if (finalThumbnailUrl && !finalThumbnailUrl.includes("/api/spy/b2-media")) {
      try {
        const res = await uploadMediaWithHashing(finalThumbnailUrl, "thumbnails", `${ad.adArchiveId}_thumb`);
        if (res && res.url) {
          finalThumbnailUrl = res.url;
          if (!mediaHash) mediaHash = res.mediaHash;
          if (!perceptualHash) perceptualHash = res.perceptualHash;
        }
      } catch (err: any) {
        console.warn(`  Thumbnail upload failed: ${err.message}`);
      }
    }

    // 2. Cache mediaUrls (all images / carousel slides)
    if (finalMediaUrls.length > 0) {
      try {
        const b2Urls = await Promise.all(
          finalMediaUrls.map(async (url, idx) => {
            if (url.includes("backblazeb2.com") || url.includes("/api/spy/b2-media")) return url;
            const folder = ad.mediaType === "video" || url.includes(".mp4") ? "videos" : "images";
            const res = await uploadMediaWithHashing(url, folder as any, `${ad.adArchiveId}_${idx}`);
            if (res && res.url) {
              if (!mediaHash) mediaHash = res.mediaHash;
              if (!perceptualHash) perceptualHash = res.perceptualHash;
              return res.url;
            }
            return url;
          })
        );
        finalMediaUrls = b2Urls;
        if (!finalThumbnailUrl && finalMediaUrls.length > 0) {
          finalThumbnailUrl = finalMediaUrls[0];
        }
      } catch (err: any) {
        console.warn(`  Media URLs upload failed: ${err.message}`);
      }
    }

    if (finalThumbnailUrl !== ad.thumbnailUrl || JSON.stringify(finalMediaUrls) !== JSON.stringify(ad.mediaUrls)) {
      await db
        .update(ads)
        .set({
          thumbnailUrl: finalThumbnailUrl,
          mediaUrls: finalMediaUrls,
          ...(mediaHash ? { mediaHash } : {}),
          ...(perceptualHash ? { perceptualHash } : {}),
        })
        .where(eq(ads.id, ad.id));

      succeeded++;
      console.log(`  ✓ Successfully cached: ${finalThumbnailUrl}`);
    } else {
      failed++;
    }
  }

  console.log(`\nBackfill Summary: ${succeeded} ads updated with permanent B2 storage, ${failed} skipped.`);
  process.exit(0);
}

backfillUncachedMedia();
