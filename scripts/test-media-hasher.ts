import { computeSha256, computeDHash, getHammingDistance, areVisuallyIdentical } from "../lib/media-hasher";
import { enrichAdsWithCreativeClusters, getDeduplicatedCreativeHeroAds } from "../lib/creative-clustering";
import sharp from "sharp";

async function runTests() {
  console.log("=== Testing Media Hasher & Creative Clustering Engine ===\n");

  // 1. Create a gradient image (Left = Black, Right = White)
  // SVG with left-to-right gradient
  const svgGradient1 = Buffer.from(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(0,0,0);stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(255,255,255);stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#grad1)" />
    </svg>
  `);

  // 2. Create the same gradient but smaller (100x100 resized)
  const svgGradient2 = Buffer.from(`
    <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(5,5,5);stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(250,250,250);stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#grad2)" />
    </svg>
  `);

  // 3. Create an opposite gradient (Left = White, Right = Black)
  const svgGradient3 = Buffer.from(`
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(255,255,255);stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(0,0,0);stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#grad3)" />
    </svg>
  `);

  const imageBuffer1 = await sharp(svgGradient1).jpeg().toBuffer();
  const imageBuffer2 = await sharp(svgGradient2).jpeg().toBuffer();
  const imageBuffer3 = await sharp(svgGradient3).jpeg().toBuffer();

  const sha1 = computeSha256(imageBuffer1);
  const sha2 = computeSha256(imageBuffer2);
  const sha3 = computeSha256(imageBuffer3);

  const dHash1 = await computeDHash(imageBuffer1);
  const dHash2 = await computeDHash(imageBuffer2);
  const dHash3 = await computeDHash(imageBuffer3);

  console.log(`Image 1 (L->R Grad 200px) -> SHA: ${sha1.substring(0, 10)}... | dHash: ${dHash1}`);
  console.log(`Image 2 (L->R Grad 100px) -> SHA: ${sha2.substring(0, 10)}... | dHash: ${dHash2}`);
  console.log(`Image 3 (R->L Opposite)   -> SHA: ${sha3.substring(0, 10)}... | dHash: ${dHash3}`);

  const distanceSame = getHammingDistance(dHash1, dHash2);
  const distanceDiff = getHammingDistance(dHash1, dHash3);
  const isVisualMatch = areVisuallyIdentical(dHash1, dHash2, 6);
  const isDiffMatch = areVisuallyIdentical(dHash1, dHash3, 6);

  console.log(`\nHamming Distance (Image 1 vs Image 2 [Resized version]): ${distanceSame} (Visual Match: ${isVisualMatch})`);
  console.log(`Hamming Distance (Image 1 vs Image 3 [Opposite image]): ${distanceDiff} (Visual Match: ${isDiffMatch})`);

  if (!isVisualMatch) {
    throw new Error("Test Failed: Similar gradient images were not recognized as visually identical!");
  }
  if (isDiffMatch) {
    throw new Error("Test Failed: Opposite images were incorrectly flagged as visual match!");
  }
  console.log("✓ Perceptual dHash and Hamming distance test PASSED!");

  // 4. Test Creative Clustering Engine
  console.log("\n--- Testing Creative Clustering Engine ---");
  const sampleAds = [
    {
      id: "ad-1",
      adArchiveId: "1001",
      pageId: "brand-a",
      pageName: "Brand Alpha",
      startedRunningOn: new Date("2026-01-01"),
      mediaHash: sha1,
      perceptualHash: dHash1,
      duplicationCount: 1,
      isActive: true,
    },
    {
      id: "ad-2",
      adArchiveId: "1002",
      pageId: "brand-a",
      pageName: "Brand Alpha",
      startedRunningOn: new Date("2026-01-05"),
      mediaHash: sha1,
      perceptualHash: dHash1,
      duplicationCount: 5,
      isActive: true,
    },
    {
      id: "ad-3",
      adArchiveId: "1003",
      pageId: "brand-b", // Copycat brand running same visual creative!
      pageName: "Brand Beta",
      startedRunningOn: new Date("2026-01-10"),
      mediaHash: sha2,
      perceptualHash: dHash2,
      duplicationCount: 2,
      isActive: true,
    },
    {
      id: "ad-4",
      adArchiveId: "1004",
      pageId: "brand-c", // Different brand running different creative
      pageName: "Brand Gamma",
      startedRunningOn: new Date("2026-01-15"),
      mediaHash: sha3,
      perceptualHash: dHash3,
      duplicationCount: 1,
      isActive: true,
    },
  ];

  const clustered = enrichAdsWithCreativeClusters(sampleAds);
  const heroAds = getDeduplicatedCreativeHeroAds(clustered);

  console.log(`\nInput Ads: ${sampleAds.length} | Output Hero Cards: ${heroAds.length}`);
  console.log(`Hero Ad 1 Cluster: totalAdSets = ${heroAds[0].creativeMetrics?.totalAdSets}, distinctBrandsCount = ${heroAds[0].creativeMetrics?.distinctBrandsCount}, isCrossBrand = ${heroAds[0].creativeMetrics?.isCrossBrand}`);
  console.log(`Original Creator: ${heroAds[0].creativeMetrics?.originalCreator?.pageName}`);

  if (heroAds.length !== 2) {
    throw new Error(`Expected 2 distinct creative clusters, got ${heroAds.length}`);
  }

  if (heroAds[0].creativeMetrics?.totalAdSets !== 3) {
    throw new Error(`Expected cluster 1 to have 3 ad variations, got ${heroAds[0].creativeMetrics?.totalAdSets}`);
  }

  if (!heroAds[0].creativeMetrics?.isCrossBrand) {
    throw new Error(`Expected cluster 1 to be marked as isCrossBrand = true!`);
  }

  if (heroAds[0].creativeMetrics?.distinctBrandsCount !== 2) {
    throw new Error(`Expected cluster 1 to have 2 distinct brands, got ${heroAds[0].creativeMetrics?.distinctBrandsCount}`);
  }

  console.log("\n✓ All Media Hashing & Creative Clustering tests PASSED successfully!");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
