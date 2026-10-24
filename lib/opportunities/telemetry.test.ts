import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "@/app/api/opportunities/telemetry/route";
import { NextRequest } from "next/server";
import { client } from "@/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getTunisianWorkspace } from "@/lib/workspace-server";

const authSecret = process.env.APP_PASSWORD || process.env.AUTH_SECRET || "Sansfacon__11";

function createTelemetryRequest(params: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000/api/opportunities/telemetry${params ? `?${params}` : ""}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${authSecret}`,
      ...headers,
    },
  });
}

test("Opportunities Telemetry API Suite (TASK-16)", async (t) => {
  await t.test("Returns 400 when range parameter is invalid", async () => {
    const req = createTelemetryRequest("range=999d");
    const res = await GET(req);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("Invalid 'range' parameter"));
  });

  await t.test("Returns 400 when x-workspace-id header is a malformed UUID", async () => {
    const req = createTelemetryRequest("range=7d", {
      "x-workspace-id": "bad-uuid",
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("Invalid workspace UUID format"));
  });

  await t.test("Staff role is strictly confined to Tunisian workspace and rejects foreign workspace overrides", async () => {
    const tunisianWs = await getTunisianWorkspace();
    const staffToken = await createSessionToken(3600, "staff");

    // 1. Staff attempting to specify a foreign workspace UUID must be rejected with 403 Forbidden
    const forbiddenReq = new NextRequest("http://localhost:3000/api/opportunities/telemetry?range=7d", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
        "x-workspace-id": "11111111-1111-1111-1111-111111111111",
      },
    });
    const forbiddenRes = await GET(forbiddenReq);
    assert.strictEqual(forbiddenRes.status, 403);
    const forbiddenJson = await forbiddenRes.json();
    assert.ok(forbiddenJson.error.includes("Staff members are restricted"));

    // 2. Staff without override is successfully scoped strictly to Tunisian workspace
    const validStaffReq = new NextRequest("http://localhost:3000/api/opportunities/telemetry?range=7d", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
      },
    });
    const validStaffRes = await GET(validStaffReq);
    assert.strictEqual(validStaffRes.status, 200);
    const validStaffJson = await validStaffRes.json();
    assert.strictEqual(validStaffJson.workspaceId, tunisianWs.id, "Staff must strictly resolve to Tunisian workspace ID");
  });

  await t.test("Returns 200 and valid TelemetrySnapshot for standard 7d range", async () => {
    const req = createTelemetryRequest("range=7d");
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();

    assert.strictEqual(json.effectiveWindow, "7d");
    assert.strictEqual(json.rangeDays, 7);
    assert.ok(json.metrics, "Should contain metrics object");
    assert.ok(typeof json.metrics.totalActiveAds === "number");
    assert.ok(typeof json.metrics.scalingBrandsCount === "number");
    assert.ok(typeof json.metrics.descalingBrandsCount === "number");
    assert.ok(typeof json.metrics.totalProductsCount === "number");

    assert.ok(Array.isArray(json.categories), "categories should be an array");
    assert.ok(Array.isArray(json.scalingBrands), "scalingBrands should be an array");
    assert.ok(Array.isArray(json.descalingBrands), "descalingBrands should be an array");
    assert.ok(Array.isArray(json.products), "products should be an array");
    assert.ok(Array.isArray(json.creatives), "creatives should be an array");
  });

  await t.test("Rejects undocumented ranges today and 15d with 400 Bad Request", async () => {
    const reqToday = createTelemetryRequest("range=today");
    const resToday = await GET(reqToday);
    assert.strictEqual(resToday.status, 400);

    const req15 = createTelemetryRequest("range=15d");
    const res15 = await GET(req15);
    assert.strictEqual(res15.status, 400);
  });

  await t.test("Returns 200 and valid TelemetrySnapshot for 14d and 30d ranges, and hits 60s cache", async () => {
    const req14 = createTelemetryRequest("range=14d");
    const res14 = await GET(req14);
    assert.strictEqual(res14.status, 200);
    const json14 = await res14.json();
    assert.strictEqual(json14.effectiveWindow, "14d");
    assert.strictEqual(json14.rangeDays, 14);

    // Second call within 60s must return X-Telemetry-Cache: HIT
    const req14Cached = createTelemetryRequest("range=14d");
    const res14Cached = await GET(req14Cached);
    assert.strictEqual(res14Cached.status, 200);
    assert.strictEqual(res14Cached.headers.get("x-telemetry-cache"), "HIT");

    const req30 = createTelemetryRequest("range=30d");
    const res30 = await GET(req30);
    assert.strictEqual(res30.status, 200);
    const json30 = await res30.json();
    assert.strictEqual(json30.effectiveWindow, "30d");
    assert.strictEqual(json30.rangeDays, 30);
  });

  await t.test("Scaling brands are strictly positive and ordered descending by netDelta", async () => {
    const req = createTelemetryRequest("range=7d");
    const res = await GET(req);
    const json = await res.json();

    for (let i = 0; i < json.scalingBrands.length; i++) {
      assert.ok(json.scalingBrands[i].netDelta > 0, "Scaling brand delta must be strictly positive");
      if (i > 0) {
        assert.ok(
          json.scalingBrands[i - 1].netDelta >= json.scalingBrands[i].netDelta,
          "Scaling brands must be ordered descending by net delta"
        );
      }
    }
  });

  await t.test("Unicode-escaped Arabic creative signal patterns match expected phrases", () => {
    const freeDeliveryRegex = /(livraison gratuite|\u062A\u0648\u0635\u064A\u0644 \u0645\u062C\u0627\u0646\u064A|\u062A\u0648\u0635\u064A\u0644 \u0628\u0644\u0627\u0634|free delivery|livraison 0)/i;
    const discountRegex = /(remise|\u062A\u062E\u0641\u064A\u0636|\u062E\u0635\u0645|promo|solde|%|\u0639\u0631\u0636)/i;

    assert.ok(freeDeliveryRegex.test("سارع بالطلب الآن توصيل مجاني إلى كامل تراب الجمهورية"));
    assert.ok(freeDeliveryRegex.test("Livraison gratuite disponible"));
    assert.ok(freeDeliveryRegex.test("توصيل بلاش"));

    assert.ok(discountRegex.test("تخفيض خاص بنسبة 30%"));
    assert.ok(discountRegex.test("خصم حصري لهذا الأسبوع"));
    assert.ok(discountRegex.test("Remise exceptionnelle"));
    assert.ok(discountRegex.test("عرض خاص بمناسبة العيد"));
  });
});

test.after(async () => {
  await client.end();
});
