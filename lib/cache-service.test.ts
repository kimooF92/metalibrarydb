import test from "node:test";
import assert from "node:assert/strict";
import {
  getCached,
  setCached,
  deleteCached,
  deleteByPrefix,
  acquireLock,
  releaseLock,
  _getMemoryCacheSize,
  _clearMemoryCache,
  _setMemoryCacheForTest,
} from "./cache-service";
import { isRedisAvailable } from "./redis";

test("Upstash Cache & Lock Service Suite", async (t) => {
  await t.test("Redis client is configured and available", () => {
    assert.strictEqual(isRedisAvailable(), true, "Upstash Redis should be configured in test run");
  });

  await t.test("L1 and L2 Caching roundtrip", async () => {
    const testKey = "cache:unit-test:object";
    const payload = { hello: "world", count: 99, flags: [true, false] };

    // 1. Write to cache
    await setCached(testKey, payload, 30);

    // 2. Read back from cache
    const retrieved = await getCached<typeof payload>(testKey);
    assert.deepStrictEqual(retrieved, payload, "Retrieved cached object should match original");

    // 3. Delete and ensure miss
    await deleteCached(testKey);
    const afterDelete = await getCached(testKey);
    assert.strictEqual(afterDelete, null, "Deleted key should return null");
  });

  await t.test("Prefix deletion works across multiple keys", async () => {
    const prefix = "cache:unit-test-prefix:ws123:";
    const keyA = `${prefix}tab-all`;
    const keyB = `${prefix}tab-active`;

    await setCached(keyA, { tab: "all" }, 30);
    await setCached(keyB, { tab: "active" }, 30);

    assert.ok(await getCached(keyA), "Key A should exist before prefix delete");
    assert.ok(await getCached(keyB), "Key B should exist before prefix delete");

    await deleteByPrefix(prefix);

    assert.strictEqual(await getCached(keyA), null, "Key A should be deleted by prefix");
    assert.strictEqual(await getCached(keyB), null, "Key B should be deleted by prefix");
  });

  await t.test("Distributed lock concurrency and double-lock prevention", async () => {
    const lockKey = "lock:unit-test:scrape-mutex";

    // Clean up any stale lock
    await releaseLock(lockKey);

    // 1. First worker acquires lock
    const firstAcquire = await acquireLock(lockKey, 30);
    assert.strictEqual(firstAcquire, true, "First acquire should succeed");

    // 2. Second worker attempts to acquire same lock
    const secondAcquire = await acquireLock(lockKey, 30);
    assert.strictEqual(secondAcquire, false, "Second concurrent acquire must fail (mutex)");

    // 3. First worker finishes and releases lock
    await releaseLock(lockKey);

    // 4. Third worker can now acquire
    const thirdAcquire = await acquireLock(lockKey, 30);
    assert.strictEqual(thirdAcquire, true, "Acquire after release should succeed");

    // Clean up
    await releaseLock(lockKey);
  });

  await t.test("Brand cache key scoping and inverted index deduplication", async () => {
    // 1. Tenant-isolated brand cache keys
    const ws1 = "workspace-111";
    const ws2 = "workspace-222";
    const brandId = "brand-acme";

    const keyWs1 = `cache:brand:${ws1}:${brandId}:all`;
    const keyWs2 = `cache:brand:${ws2}:${brandId}:all`;

    await setCached(keyWs1, { brand: "Acme", isWatchlisted: true }, 30);
    await setCached(keyWs2, { brand: "Acme", isWatchlisted: false }, 30);

    const dataWs1 = await getCached<any>(keyWs1);
    const dataWs2 = await getCached<any>(keyWs2);

    assert.strictEqual(dataWs1?.isWatchlisted, true, "Workspace 1 should see true");
    assert.strictEqual(dataWs2?.isWatchlisted, false, "Workspace 2 should see false");

    // Clean up
    await deleteByPrefix(`cache:brand:${ws1}:`);
    await deleteByPrefix(`cache:brand:${ws2}:`);

    // 2. Inverted index ad deduplication logic
    type MockAd = { id: string; productId: string | null; normUrl: string | null };
    const adsByProductId = new Map<string, MockAd[]>();
    const adsByNormUrl = new Map<string, MockAd[]>();

    const ad1: MockAd = { id: "ad_1", productId: "prod_A", normUrl: "https://shop.com/prod-a" };
    const ad2: MockAd = { id: "ad_2", productId: "prod_A", normUrl: null };
    const ad3: MockAd = { id: "ad_3", productId: null, normUrl: "https://shop.com/prod-a" };

    const allMockAds = [ad1, ad2, ad3];
    for (const ad of allMockAds) {
      if (ad.productId) {
        let list = adsByProductId.get(ad.productId);
        if (!list) { list = []; adsByProductId.set(ad.productId, list); }
        list.push(ad);
      }
      if (ad.normUrl) {
        let list = adsByNormUrl.get(ad.normUrl);
        if (!list) { list = []; adsByNormUrl.set(ad.normUrl, list); }
        list.push(ad);
      }
    }

    // Product A matches ad1 by productId AND by normUrl, ad2 by productId, ad3 by normUrl
    const product = { id: "prod_A", url: "https://shop.com/prod-a" };
    const matchedMap = new Map<string, MockAd>();
    (adsByProductId.get(product.id) || []).forEach((ad) => matchedMap.set(ad.id, ad));
    if (product.url) {
      (adsByNormUrl.get(product.url) || []).forEach((ad) => matchedMap.set(ad.id, ad));
    }
    const matchingAds = Array.from(matchedMap.values());

    // Without deduplication, ad1 would be included twice (length 4). With deduplication, length must be 3.
    assert.strictEqual(matchingAds.length, 3, "Matching ads must be deduplicated across product ID and URL");
    const matchedIds = matchingAds.map((a) => a.id).sort();
    assert.deepStrictEqual(matchedIds, ["ad_1", "ad_2", "ad_3"], "All 3 unique ads should be matched without duplicates");
  });

  await t.test("L1 Memory capacity is strictly bounded at MAX_MEMORY_ENTRIES (500)", async () => {
    _clearMemoryCache();

    // Insert 510 active entries with high TTL (no expired entries, 0 Redis quota consumed)
    for (let i = 0; i < 510; i++) {
      _setMemoryCacheForTest(`cache:unit-test:bounded:${i}`, { idx: i }, 60_000);
    }

    const finalSize = _getMemoryCacheSize();
    assert.strictEqual(finalSize, 500, "L1 memory cache must never exceed MAX_MEMORY_ENTRIES (500)");

    // The oldest entry (index 0) must have been evicted by FIFO policy
    const evicted = await getCached(`cache:unit-test:bounded:0`);
    assert.strictEqual(evicted, null, "Oldest entry should be evicted and return null on getCached");
    _clearMemoryCache();
  });

  await t.test("L1 custom TTL option is accepted by getCached and setCached", async () => {
    _clearMemoryCache();
    const testKey = "cache:unit-test:custom-l1-ttl";

    // Set with custom 5-minute L1 retention
    await setCached(testKey, { brand: "test" }, 300, { l1MaxTtlMs: 300 * 1000 });
    const fromL1 = await getCached<any>(testKey, { l1MaxTtlMs: 300 * 1000 });
    assert.deepStrictEqual(fromL1, { brand: "test" }, "Should retrieve payload from L1");

    await deleteCached(testKey);
    _clearMemoryCache();
  });
});


