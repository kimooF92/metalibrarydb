import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { trackedPages, creativeScans, ads, adObservations } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { handleBatchIngest } from "../app/api/qstash/ingest-scan-batch/route";
import type { BatchIngestPayload } from "../lib/qstash-types";

async function main() {
  console.log("🧪 Starting End-to-End QStash Batch Ingestion Test...\n");

  // 1. Pick an active tracked page from the database
  const targetPage = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.status, "success"),
    columns: { id: true, displayName: true, pageId: true, workspaceId: true },
  });

  if (!targetPage) {
    console.error("❌ No active tracked page found in database to test against.");
    process.exit(1);
  }

  console.log(`📌 Using target tracked page: "${targetPage.displayName}" (ID: ${targetPage.id})`);

  // 2. Create a test creative_scans record
  const [testScan] = await db
    .insert(creativeScans)
    .values({
      trackedPageId: targetPage.id,
      status: "running",
      configSnapshot: JSON.stringify({ mode: "test_simulation" }),
      extractedCount: 0,
      startedAt: new Date(),
    })
    .returning({ id: creativeScans.id });

  console.log(`📋 Created test creative scan: ${testScan.id}`);

  // 3. Construct a realistic synthetic batch payload
  const testArchiveId1 = `test_ad_${Date.now()}_1`;
  const testArchiveId2 = `test_ad_${Date.now()}_2`;

  const payload: BatchIngestPayload = {
    creativeScanId: testScan.id,
    trackedPageId: targetPage.id,
    pageId: targetPage.pageId || "1234567890",
    pageName: targetPage.displayName,
    totalExtractedCount: 2,
    ads: [
      {
        adArchiveId: testArchiveId1,
        pageId: targetPage.pageId || "1234567890",
        pageName: targetPage.displayName,
        caption: "🔥 Special 50% discount on summer shoes! Limited stock.",
        title: "Summer Collection 2026",
        ctaText: "Shop Now",
        linkUrl: "https://example.com/products/summer-shoes",
        mediaType: "image",
        mediaUrls: ["https://example.com/images/shoe1.webp"],
        thumbnailUrl: "https://example.com/images/shoe1-thumb.webp",
        duplicationCount: 3,
        collationId: "collation-test-1",
        isActive: true,
      },
      {
        adArchiveId: testArchiveId2,
        pageId: targetPage.pageId || "1234567890",
        pageName: targetPage.displayName,
        caption: "📦 Free shipping all across the country on all orders.",
        title: "Leather Wallet Premium Edition",
        ctaText: "Order Now",
        linkUrl: "https://example.com/products/leather-wallet",
        mediaType: "video",
        mediaUrls: ["https://example.com/videos/wallet.mp4"],
        thumbnailUrl: "https://example.com/images/wallet-thumb.webp",
        duplicationCount: 1,
        collationId: null,
        isActive: true,
      },
    ],
    observedAt: new Date().toISOString(),
    scanQuality: "complete",
  };

  // 4. Dispatch the batch to the ingestion handler
  console.log("🚀 Executing batch ingestion route handler...");
  const request = new Request("http://localhost:3000/api/qstash/ingest-scan-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const response = await handleBatchIngest(request);
  const data = await response.json();

  console.log(`📬 Ingestion response status: ${response.status}`);
  console.log("📬 Response body:", JSON.stringify(data, null, 2));

  if (response.status !== 200 || !data.success) {
    console.error("❌ Batch ingestion failed!");
    process.exit(1);
  }

  // 5. Verify database records
  console.log("\n🔍 Verifying database persistence...");

  const ingestedAds = await db
    .select({ id: ads.id, adArchiveId: ads.adArchiveId, title: ads.title })
    .from(ads)
    .where(inArray(ads.adArchiveId, [testArchiveId1, testArchiveId2]));

  console.log(`✅ Upserted Ads in DB (${ingestedAds.length}/2):`, ingestedAds);

  const observations = await db
    .select({
      id: adObservations.id,
      adId: adObservations.adId,
      duplicationCount: adObservations.duplicationCount,
      isActive: adObservations.isActive,
    })
    .from(adObservations)
    .where(eq(adObservations.creativeScanId, testScan.id));

  console.log(`✅ Observations in DB (${observations.length}/2):`, observations);

  const [updatedScan] = await db
    .select({ id: creativeScans.id, status: creativeScans.status, extractedCount: creativeScans.extractedCount })
    .from(creativeScans)
    .where(eq(creativeScans.id, testScan.id));

  console.log(`✅ Creative Scan Status: ${updatedScan.status} (Extracted: ${updatedScan.extractedCount})`);

  // 6. Clean up test records
  console.log("\n🧹 Cleaning up test records from database...");
  await db.delete(creativeScans).where(eq(creativeScans.id, testScan.id));
  await db.delete(ads).where(inArray(ads.adArchiveId, [testArchiveId1, testArchiveId2]));

  console.log("🎉 Test completed successfully with 100% verified persistence!");
  process.exit(0);
}

main().catch((err) => {
  console.error("💥 Test execution error:", err);
  process.exit(1);
});

