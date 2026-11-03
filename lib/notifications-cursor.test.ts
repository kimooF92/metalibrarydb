import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "@/app/api/notifications/route";
import { NextRequest } from "next/server";

const authSecret = process.env.APP_PASSWORD || process.env.AUTH_SECRET || "Sansfacon__11";

function createNotificationRequest(params = "") {
  return new NextRequest(`http://localhost:3000/api/notifications${params ? `?${params}` : ""}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${authSecret}`,
    },
  });
}

test("Notifications Cursor-Based Pagination Suite", async (t) => {
  await t.test("Initial page returns notifications, unreadCount, and cursor metadata", async () => {
    const req = createNotificationRequest("limit=5");
    const res = await GET(req);
    assert.strictEqual(res.status, 200);

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(Array.isArray(json.notifications));
    assert.ok(typeof json.unreadCount === "number");
    assert.strictEqual(typeof json.hasMore, "boolean");

    if (json.notifications.length === 5 && json.hasMore) {
      assert.ok(typeof json.nextCursor === "string");
      assert.ok(json.nextCursor.includes("|"));
    }
  });

  await t.test("Cursor request returns next page without scanning unreadCount", async () => {
    // 1. Fetch first page of 2 items
    const req1 = createNotificationRequest("limit=2");
    const res1 = await GET(req1);
    const json1 = await res1.json();

    if (json1.hasMore && json1.nextCursor) {
      // 2. Fetch page 2 using nextCursor
      const req2 = createNotificationRequest(`limit=2&cursor=${encodeURIComponent(json1.nextCursor)}`);
      const res2 = await GET(req2);
      assert.strictEqual(res2.status, 200);

      const json2 = await res2.json();
      assert.strictEqual(json2.success, true);
      assert.ok(Array.isArray(json2.notifications));
      // unreadCount must be omitted on cursor queries to save database scan quota
      assert.strictEqual(json2.unreadCount, undefined);

      // Verify no duplicates between page 1 and page 2
      const page1Ids = new Set(json1.notifications.map((n: any) => n.id));
      for (const item of json2.notifications) {
        assert.ok(!page1Ids.has(item.id), `Item ${item.id} from page 2 should not exist in page 1`);
      }
    }
  });

  await t.test("Supports summary-only fast-path without fetching notifications list", async () => {
    const req = createNotificationRequest("summary=true");
    const res = await GET(req);
    assert.strictEqual(res.status, 200);

    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.notifications.length, 0);
    assert.ok(typeof json.unreadCount === "number");
  });
});

