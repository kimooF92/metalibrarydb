import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { BatchIngestPayloadSchema, RawAdItemSchema } from "@/lib/qstash-types";
import { getDeduplicationId } from "@/lib/qstash";
import { POST, handleBatchIngest } from "./ingest-scan-batch/route";

describe("Batch Scan Ingestion API & Schema Suite (/api/qstash/ingest-scan-batch)", () => {
  const validCreativeScanId = "11111111-1111-4111-8111-111111111111";
  const validTrackedPageId = "22222222-2222-4222-8222-222222222222";

  it("RawAdItemSchema strictly parses valid ad and observation properties", () => {
    const raw = {
      adArchiveId: "1234567890",
      pageId: "9876543210",
      pageName: "Test Brand",
      caption: "Special discount today!",
      title: "Best Seller Pack",
      ctaText: "Shop Now",
      linkUrl: "https://example.com/products/pack",
      mediaType: "video",
      mediaUrls: ["https://example.com/video.mp4"],
      thumbnailUrl: "https://example.com/thumb.webp",
      duplicationCount: 4,
      collationId: "collation-abc",
      isActive: true,
    };

    const parsed = RawAdItemSchema.safeParse(raw);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(parsed.data.adArchiveId, "1234567890");
      assert.strictEqual(parsed.data.duplicationCount, 4);
      assert.strictEqual(parsed.data.mediaType, "video");
      assert.strictEqual(parsed.data.isActive, true);
    }
  });

  it("RawAdItemSchema falls back to sensible defaults for optional fields", () => {
    const minimal = {
      adArchiveId: "9999999",
      pageId: "8888888",
    };

    const parsed = RawAdItemSchema.safeParse(minimal);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(parsed.data.mediaType, "unknown");
      assert.strictEqual(parsed.data.duplicationCount, 1);
      assert.strictEqual(parsed.data.isActive, true);
      assert.deepStrictEqual(parsed.data.mediaUrls, []);
    }
  });

  it("BatchIngestPayloadSchema rejects batches missing required UUIDs or exceeding 100 ads", () => {
    // Missing creativeScanId
    const missingUuid = {
      trackedPageId: validTrackedPageId,
      pageId: "12345678",
      ads: [],
    };
    const res1 = BatchIngestPayloadSchema.safeParse(missingUuid);
    assert.strictEqual(res1.success, false);

    // Invalid non-UUID format
    const badUuid = {
      creativeScanId: "not-a-uuid",
      trackedPageId: validTrackedPageId,
      pageId: "12345678",
      ads: [],
    };
    const res2 = BatchIngestPayloadSchema.safeParse(badUuid);
    assert.strictEqual(res2.success, false);

    // Over 100 ads
    const oversizedBatch = {
      creativeScanId: validCreativeScanId,
      trackedPageId: validTrackedPageId,
      pageId: "12345678",
      ads: Array.from({ length: 101 }, (_, i) => ({
        adArchiveId: `ad-${i}`,
        pageId: "12345678",
      })),
    };
    const res3 = BatchIngestPayloadSchema.safeParse(oversizedBatch);
    assert.strictEqual(res3.success, false);
  });

  it("getDeduplicationId formats batch deduplication IDs with underscore delimiter", () => {
    const dedupId = getDeduplicationId("batch", validCreativeScanId);
    assert.ok(dedupId.startsWith("batch_"), "Deduplication ID must start with batch_ prefix");
    assert.strictEqual(dedupId.includes(":"), false, "Upstash QStash disallows colons in deduplicationId");
  });

  it("POST route rejects unauthenticated requests lacking secret or signature", async () => {
    const originalSecret = process.env.API_SECRET;
    const originalAppPassword = process.env.APP_PASSWORD;
    const originalCurrentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const originalNextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      // Emulate production environment with QStash keys configured
      process.env.API_SECRET = "test-secret-value";
      delete process.env.APP_PASSWORD;
      process.env.QSTASH_CURRENT_SIGNING_KEY = "sigkey_current_test";
      process.env.QSTASH_NEXT_SIGNING_KEY = "sigkey_next_test";
      (process.env as any).NODE_ENV = "production";

      const unauthReq = new NextRequest("https://metalibrarydb.vercel.app/api/qstash/ingest-scan-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          creativeScanId: validCreativeScanId,
          trackedPageId: validTrackedPageId,
          pageId: "123456",
          ads: [],
        }),
      });

      const response = await POST(unauthReq);
      // verifySignatureAppRouter will reject unsigned requests with 400, 401, or 403
      assert.ok(
        [400, 401, 403].includes(response.status),
        `Expected signature rejection status (400, 401, or 403), received: ${response.status}`
      );
    } finally {
      process.env.API_SECRET = originalSecret;
      process.env.APP_PASSWORD = originalAppPassword;
      process.env.QSTASH_CURRENT_SIGNING_KEY = originalCurrentKey;
      process.env.QSTASH_NEXT_SIGNING_KEY = originalNextKey;
      (process.env as any).NODE_ENV = originalNodeEnv;
    }
  });

  it("POST route accepts valid x-api-secret header and returns 400 for malformed payload", async () => {
    const testSecret = "batch-test-secret-fastpath";
    const originalSecret = process.env.API_SECRET;
    process.env.API_SECRET = testSecret;

    try {
      const authReq = new NextRequest("http://localhost:3000/api/qstash/ingest-scan-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": testSecret,
        },
        body: JSON.stringify({
          // Missing required fields triggers 400 from handleBatchIngest, proving it bypassed 401/403
          invalidKey: "junk",
        }),
      });

      const response = await POST(authReq);
      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.strictEqual(data.error, "Invalid payload structure");
    } finally {
      process.env.API_SECRET = originalSecret;
    }
  });

  it("handleBatchIngest returns 400 if trackedPage does not exist", async () => {
    const nonExistentPageId = "00000000-0000-4000-8000-000000000001";
    const nonExistentScanId = "00000000-0000-4000-8000-000000000002";

    const req = new NextRequest("http://localhost:3000/api/qstash/ingest-scan-batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        creativeScanId: nonExistentScanId,
        trackedPageId: nonExistentPageId,
        pageId: "123456789",
        ads: [],
        scanQuality: "complete",
      }),
    });

    const response = await handleBatchIngest(req);
    assert.strictEqual(response.status, 400);
    const data = await response.json();
    assert.strictEqual(data.error, "Tracked page not found");
  });

  it("BatchIngestPayloadSchema defaults scanQuality to 'partial' when omitted", () => {
    const payload = {
      creativeScanId: validCreativeScanId,
      trackedPageId: validTrackedPageId,
      pageId: "12345678",
      ads: [],
    };
    const parsed = BatchIngestPayloadSchema.safeParse(payload);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(parsed.data.scanQuality, "partial");
    }
  });
});

