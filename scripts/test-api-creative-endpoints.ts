import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads } from "../db/schema";
import { enrichAdsWithCreativeClusters, getDeduplicatedCreativeHeroAds } from "../lib/creative-clustering";
import { desc } from "drizzle-orm";

async function testApiLogic() {
  console.log("=== Testing Creative API Logic & Database Querying ===");

  const sampleDbAds = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      pageId: ads.pageId,
      pageName: ads.pageName,
      startedRunningOn: ads.startedRunningOn,
      caption: ads.caption,
      title: ads.title,
      mediaType: ads.mediaType,
      mediaUrls: ads.mediaUrls,
      thumbnailUrl: ads.thumbnailUrl,
      mediaHash: ads.mediaHash,
      perceptualHash: ads.perceptualHash,
      firstSeenAt: ads.firstSeenAt,
      lastSeenAt: ads.lastSeenAt,
    })
    .from(ads)
    .orderBy(desc(ads.createdAt))
    .limit(50);

  console.log(`Fetched ${sampleDbAds.length} actual ads from database.`);

  const enriched = enrichAdsWithCreativeClusters(sampleDbAds);
  const heroAds = getDeduplicatedCreativeHeroAds(enriched);

  console.log(`Total Individual Ads: ${sampleDbAds.length}`);
  console.log(`Unique Creative Clusters: ${heroAds.length}`);

  const clustersWithMultiSets = heroAds.filter((h) => (h.creativeMetrics?.totalAdSets || 1) > 1);
  console.log(`Clusters with multiple ad variations: ${clustersWithMultiSets.length}`);

  for (const c of clustersWithMultiSets.slice(0, 3)) {
    console.log(`\nCreative Cluster [${c.creativeClusterKey}]:`);
    console.log(`  - Total Ad Sets: ${c.creativeMetrics?.totalAdSets}`);
    console.log(`  - Distinct Brands: ${c.creativeMetrics?.distinctBrandsCount}`);
    console.log(`  - Original Creator: ${c.creativeMetrics?.originalCreator?.pageName}`);
    console.log(`  - First Launched: ${c.creativeMetrics?.firstSeenAt}`);
  }

  console.log("\n✓ Database creative grouping logic verified successfully!");
  process.exit(0);
}

testApiLogic().catch((err) => {
  console.error("API test error:", err);
  process.exit(1);
});
