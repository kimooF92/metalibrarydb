import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads } from "../db/schema";
import { eq, desc } from "drizzle-orm";

async function inspectPageAds() {
  const pageId = "685629314642242";
  console.log(`=== Inspecting Ads for Page ID: ${pageId} ===`);

  const pageAds = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      pageId: ads.pageId,
      pageName: ads.pageName,
      mediaType: ads.mediaType,
      thumbnailUrl: ads.thumbnailUrl,
      thumbnailStoragePath: ads.thumbnailStoragePath,
      mediaUrls: ads.mediaUrls,
      mediaHash: ads.mediaHash,
      perceptualHash: ads.perceptualHash,
      createdAt: ads.createdAt,
    })
    .from(ads)
    .where(eq(ads.pageId, pageId))
    .orderBy(desc(ads.createdAt));

  console.log(`Found ${pageAds.length} ad(s) for page ${pageId}:\n`);

  for (const ad of pageAds) {
    console.log(`Ad Archive ID: ${ad.adArchiveId}`);
    console.log(`  Page Name: ${ad.pageName}`);
    console.log(`  Media Type: ${ad.mediaType}`);
    console.log(`  Thumbnail URL: ${ad.thumbnailUrl}`);
    console.log(`  Storage Path: ${ad.thumbnailStoragePath}`);
    console.log(`  Media URLs (${ad.mediaUrls?.length || 0}):`, ad.mediaUrls);
    console.log(`  Media Hash: ${ad.mediaHash}`);
    console.log(`  Perceptual Hash: ${ad.perceptualHash}`);
    console.log("-----------------------------------------");
  }

  process.exit(0);
}

inspectPageAds();
