import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads } from "../db/schema";
import { eq, sql, and, or, isNull } from "drizzle-orm";
import { uploadMediaWithHashing, isB2Configured } from "../lib/b2-storage";

interface MigrateOptions {
  limit: number;
  activeOnly: boolean;
  concurrency: number;
}

function parseCliArgs(): MigrateOptions {
  const args = process.argv.slice(2);
  const options: MigrateOptions = {
    limit: 100,
    activeOnly: false,
    concurrency: 5,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--active-only") {
      options.activeOnly = true;
    } else if (arg === "--concurrency" && args[i + 1]) {
      options.concurrency = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

async function main() {
  if (!isB2Configured()) {
    console.error("❌ ERROR: Backblaze B2 is not configured in .env.local!");
    process.exit(1);
  }

  const options = parseCliArgs();

  console.log("==========================================================");
  console.log(" 🚀 Backblaze B2 Max-Compression Media Migration Pipeline ");
  console.log("==========================================================");
  console.log(`Settings: Limit=${options.limit} | ActiveOnly=${options.activeOnly} | Concurrency=${options.concurrency}\n`);

  // Target ads whose thumbnails are still on FB CDN / external hosts
  const conditions = [
    sql`${ads.thumbnailUrl} IS NOT NULL`,
    sql`NOT (${ads.thumbnailUrl} LIKE '%backblazeb2.com%' OR ${ads.thumbnailUrl} LIKE '%/api/spy/b2-media%' OR ${ads.thumbnailUrl} LIKE '%b2/%')`,
  ];

  if (options.activeOnly) {
    conditions.push(eq(ads.isArchived, false));
  }

  const targetAds = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      mediaType: ads.mediaType,
      thumbnailUrl: ads.thumbnailUrl,
      mediaUrls: ads.mediaUrls,
      isArchived: ads.isArchived,
    })
    .from(ads)
    .where(and(...conditions))
    .limit(options.limit);

  console.log(`Found ${targetAds.length} candidate ad(s) to process for Backblaze B2 backup.`);

  if (targetAds.length === 0) {
    console.log("✨ All targeted ad thumbnails are already stored in Backblaze B2!");
    process.exit(0);
  }

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Process in concurrent chunks
  for (let i = 0; i < targetAds.length; i += options.concurrency) {
    const chunk = targetAds.slice(i, i + options.concurrency);
    await Promise.all(
      chunk.map(async (ad) => {
        if (!ad.thumbnailUrl) return;

        try {
          console.log(`[B2 Migration] Processing ${ad.adArchiveId} (${ad.isArchived ? "Archived" : "Active"})...`);

          // 1. Upload thumbnail with Max-Compression Sharp WebP
          const thumbRes = await uploadMediaWithHashing(ad.thumbnailUrl, "thumbnails", ad.adArchiveId);

          if (thumbRes?.url && (thumbRes.url.includes("b2") || thumbRes.url.includes("backblaze"))) {
            const updatePayload: Record<string, any> = {
              thumbnailUrl: thumbRes.url,
              thumbnailStoragePath: `b2/thumbnails/${thumbRes.mediaHash || ad.adArchiveId}.webp`,
              updatedAt: new Date(),
            };

            if (thumbRes.mediaHash) updatePayload.mediaHash = thumbRes.mediaHash;
            if (thumbRes.perceptualHash) updatePayload.perceptualHash = thumbRes.perceptualHash;

            await db
              .update(ads)
              .set(updatePayload)
              .where(eq(ads.id, ad.id));

            successCount++;
            console.log(`  ✓ Saved WebP thumbnail: ${thumbRes.url}`);
          } else {
            // If Meta link expired or failed to download
            skippedCount++;
            console.warn(`  ⚠️ Could not migrate thumbnail for ${ad.adArchiveId} (expired or blocked)`);
          }
        } catch (err: any) {
          errorCount++;
          console.error(`  ❌ Error processing ${ad.adArchiveId}:`, err.message);
        }
      })
    );
  }

  console.log("\n==========================================================");
  console.log(" 📊 Migration Batch Summary                               ");
  console.log("==========================================================");
  console.log(`Total Candidates Processed : ${targetAds.length}`);
  console.log(`Successfully Uploaded to B2 : ${successCount}`);
  console.log(`Skipped / Expired / Unchanged: ${skippedCount}`);
  console.log(`Errors Encountered         : ${errorCount}`);
  console.log("==========================================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});
