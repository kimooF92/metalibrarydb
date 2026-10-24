import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "@/app/api/analytics/export/route";
import { NextRequest } from "next/server";
import { client } from "@/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

const authSecret = process.env.APP_PASSWORD || process.env.AUTH_SECRET || "Sansfacon__11";

function createExportRequest(params: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000/api/analytics/export${params ? `?${params}` : ""}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${authSecret}`,
      ...headers,
    },
  });
}

test("Analytics CSV Export API Route Suite", async (t) => {
  await t.test("Returns 400 when 'type' parameter is missing", async () => {
    const req = createExportRequest("");
    const res = await GET(req);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("Invalid or missing 'type' parameter"));
  });

  await t.test("Returns 400 when 'type' parameter is unrecognized", async () => {
    const req = createExportRequest("type=unknown_dataset");
    const res = await GET(req);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("Invalid or missing 'type' parameter"));
  });

  await t.test("Returns 400 when 'range' parameter is invalid", async () => {
    const req = createExportRequest("type=brands&range=999d");
    const res = await GET(req);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("Invalid 'range' parameter"));
  });

  await t.test("Returns 400 when x-workspace-id header is a malformed UUID", async () => {
    const req = createExportRequest("type=brands", {
      "x-workspace-id": "not-a-valid-uuid",
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("Invalid workspace UUID"));
  });

  await t.test("Enforces staff role confinement to Tunisian workspace even if another x-workspace-id is passed", async () => {
    const staffToken = await createSessionToken(3600, "staff");
    // Attempting to bypass as staff user by providing another workspace UUID
    const req = new NextRequest("http://localhost:3000/api/analytics/export?type=brands", {
      method: "GET",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
        "x-workspace-id": "11111111-1111-1111-1111-111111111111",
      },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    // Filename must be scoped to tunisia
    const disposition = res.headers.get("Content-Disposition") || "";
    assert.ok(
      disposition.includes("tunisia_brands_"),
      "Staff user export filename must be strictly scoped to Tunisian workspace"
    );
  });

  await t.test("Returns 200, valid CSV, and truncation response headers for brands export", async () => {
    const req = createExportRequest("type=brands&range=7d");
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
    assert.ok(res.headers.get("Content-Disposition")?.includes("attachment; filename="));
    assert.ok(res.headers.get("Content-Disposition")?.includes("_brands_"));

    // Verify truncation & row count signals
    assert.strictEqual(res.headers.get("X-Export-Truncated"), "false");
    assert.strictEqual(res.headers.get("X-Export-Limit"), "5000");
    assert.ok(res.headers.has("X-Export-Count"));

    const buf = Buffer.from(await res.arrayBuffer());
    // Verify UTF-8 BOM bytes (EF BB BF) in payload
    assert.strictEqual(buf[0], 0xef, "Byte 0 should be 0xEF (UTF-8 BOM)");
    assert.strictEqual(buf[1], 0xbb, "Byte 1 should be 0xBB (UTF-8 BOM)");
    assert.strictEqual(buf[2], 0xbf, "Byte 2 should be 0xBF (UTF-8 BOM)");

    const text = buf.toString("utf-8");
    const raw = text.startsWith("\uFEFF") ? text.slice(1) : text;
    const firstLine = raw.split("\r\n")[0];
    assert.strictEqual(
      firstLine,
      "brand_name,canonical_domain,page_id,search_type,current_ads,net_delta_7d,status,is_watchlisted,last_checked_at"
    );
  });

  await t.test("Supports lean mode execution", async () => {
    const req = createExportRequest("type=products&range=7d&lean=true");
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
    assert.strictEqual(res.headers.get("X-Export-Truncated"), "false");
  });

  await t.test("Returns 200 and valid CSV for products export", async () => {
    const req = createExportRequest("type=products&range=7d");
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
    assert.ok(res.headers.get("Content-Disposition")?.includes("_products_"));

    const buf = Buffer.from(await res.arrayBuffer());
    assert.strictEqual(buf[0], 0xef);
    assert.strictEqual(buf[1], 0xbb);
    assert.strictEqual(buf[2], 0xbf);

    const text = buf.toString("utf-8");
    const raw = text.startsWith("\uFEFF") ? text.slice(1) : text;
    const firstLine = raw.split("\r\n")[0];
    assert.strictEqual(
      firstLine,
      "product_title,domain,category,current_price_tnd,original_price_tnd,discount_percent,store_count,cod_price_tier,is_cloned_trap,product_url"
    );
  });

  await t.test("Returns 200 and valid CSV for categories export", async () => {
    const req = createExportRequest("type=categories&range=7d");
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
    assert.ok(res.headers.get("Content-Disposition")?.includes("_categories_"));

    const buf = Buffer.from(await res.arrayBuffer());
    assert.strictEqual(buf[0], 0xef);
    assert.strictEqual(buf[1], 0xbb);
    assert.strictEqual(buf[2], 0xbf);

    const text = buf.toString("utf-8");
    const raw = text.startsWith("\uFEFF") ? text.slice(1) : text;
    const firstLine = raw.split("\r\n")[0];
    assert.strictEqual(
      firstLine,
      "category,product_count,store_count,active_ads_count,new_ads_7d_count,avg_price_tnd,min_price_tnd,max_price_tnd"
    );
  });

  await t.test("Returns 200 and valid CSV for ads export filtering active observations", async () => {
    const req = createExportRequest("type=ads&range=7d");
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
    assert.ok(res.headers.get("Content-Disposition")?.includes("_ads_"));

    const buf = Buffer.from(await res.arrayBuffer());
    assert.strictEqual(buf[0], 0xef);
    assert.strictEqual(buf[1], 0xbb);
    assert.strictEqual(buf[2], 0xbf);

    const text = buf.toString("utf-8");
    const raw = text.startsWith("\uFEFF") ? text.slice(1) : text;
    const firstLine = raw.split("\r\n")[0];
    assert.strictEqual(
      firstLine,
      "ad_id,brand_name,media_type,first_seen_at,days_active,has_arabic,has_french,has_free_delivery,has_discount"
    );
  });

  await t.test("Returns 200 and valid ads CSV for creatives alias (ad-blocker defense)", async () => {
    const req = createExportRequest("type=creatives&range=7d");
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
    assert.ok(res.headers.get("Content-Disposition")?.includes("_ads_"));

    const buf = Buffer.from(await res.arrayBuffer());
    assert.strictEqual(buf[0], 0xef);
    const text = buf.toString("utf-8");
    assert.ok(text.includes("ad_id,brand_name,media_type"));
  });
});

test.after(async () => {
  await client.end();
});
