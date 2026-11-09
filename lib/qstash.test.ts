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

  it("should bypass signature check when valid x-api-secret header is supplied", async () => {
    const { POST } = await import("../app/api/qstash/extract-product/route");
    const testSecret = "test-secret-fastpath";
    process.env.API_SECRET = testSecret;

    // Send invalid payload to test that it reached handleProductExtraction instead of being rejected by signature verifier
    const mockReq = new Request("http://localhost:3000/api/qstash/extract-product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-secret": testSecret,
      },
      body: JSON.stringify({
        url: "", // Invalid URL triggers 400 from handler, proving it bypassed QStash 403 signature rejection
      }),
    });

    const response = await POST(mockReq);
    assert.strictEqual(response.status, 400);
    const data = await response.json();
    assert.strictEqual(data.error, "Missing required 'url' in payload");
  });

  it("should allow /api/qstash/ routes through middleware without 401 blocking", async () => {
    const { middleware } = await import("../middleware");
    const { NextRequest } = await import("next/server");

    process.env.APP_PASSWORD = "production-app-password";

    const qstashReq = new NextRequest("https://metalibrarydb.vercel.app/api/qstash/extract-product", {
      method: "POST",
    });

    const res = await middleware(qstashReq);
    // When middleware allows a path through, it returns NextResponse.next() with status 200 and x-middleware-next header
    assert.notStrictEqual(res.status, 401, "Middleware must NOT reject /api/qstash/ with 401");
    assert.strictEqual(res.headers.get("x-middleware-next"), "1");
  });

  it("should allow cron triggers authenticated via secret or reject when unauthenticated", async () => {
    const { POST: cronPost } = await import("../app/api/cron/trigger-workers/route");
    const { NextRequest } = await import("next/server");

    process.env.CRON_SECRET = "cron-test-secret";

    // Unauthenticated request
    const unauthReq = new NextRequest("https://metalibrarydb.vercel.app/api/cron/trigger-workers?target=keepalive", {
      method: "POST",
    });
    const unauthRes = await cronPost(unauthReq);
    assert.strictEqual(unauthRes.status, 401);

    // Authenticated request with x-api-secret
    const authReq = new NextRequest("https://metalibrarydb.vercel.app/api/cron/trigger-workers?target=keepalive", {
      method: "POST",
      headers: {
        "x-api-secret": "cron-test-secret",
      },
    });
    const authRes = await authReq;
    // We only test that auth passes past the 401 check
    const authCall = await cronPost(authReq);
    assert.notStrictEqual(authCall.status, 401);
  });
});
