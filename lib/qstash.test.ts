import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isQStashConfigured,
  getDeduplicationId,
  getAppBaseUrl,
} from "./qstash";

describe("Upstash QStash Utility Suite", () => {
  it("should confirm QStash is configured when token is provided", () => {
    assert.strictEqual(typeof isQStashConfigured(), "boolean");
    // With .env.local loaded, token should be configured
    assert.strictEqual(isQStashConfigured(), true);
  });

  it("should generate deterministic deduplication IDs", () => {
    const url1 = "https://example.com/products/leather-jacket?utm_source=facebook";
    const url2 = "https://example.com/products/leather-jacket?utm_source=facebook";
    const url3 = "https://example.com/products/different-product";

    const id1 = getDeduplicationId("prod-scrape", url1);
    const id2 = getDeduplicationId("prod-scrape", url2);
    const id3 = getDeduplicationId("prod-scrape", url3);

    assert.strictEqual(id1, id2, "Identical URLs must yield the exact same deduplication ID");
    assert.notStrictEqual(id1, id3, "Different URLs must yield distinct deduplication IDs");
    assert.ok(id1.startsWith("prod-scrape_"), "Deduplication ID should have the expected prefix");
  });

  it("should resolve app base URL cleanly", () => {
    const url = getAppBaseUrl();
    assert.ok(typeof url === "string" && url.length > 0);
    assert.ok(url.startsWith("http://") || url.startsWith("https://"));
  });

  it("should reject unsigned webhook requests to /api/qstash/extract-product", async () => {
    const { POST } = await import("../app/api/qstash/extract-product/route");

    // Create mock unauthenticated request without Upstash signature headers
    const mockReq = new Request("http://localhost:3000/api/qstash/extract-product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com/products/test",
      }),
    });

    const response = await POST(mockReq);
    // verifySignatureAppRouter must reject requests lacking signature headers with 400, 401, or 403
    assert.ok(
      [400, 401, 403].includes(response.status),
      `Expected 400, 401, or 403 unauthorized, got status ${response.status}`
    );
  });
});
