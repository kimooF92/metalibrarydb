import test from "node:test";
import assert from "node:assert/strict";
import {
  getCached,
  getManyCached,
  getEntityCacheVersion,
  bumpEntityCacheVersion,
  setCached,
  deleteCached,
  deleteByPrefix,
  acquireLock,
  acquireLockDetailed,
  releaseLock,
  forceReleaseLock,
  isLockOwner,
  buildCanonicalFilterHash,
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
    const testKey = "cache:test:roundtrip-object";
    const payload = { hello: "world", count: 99, flags: [true, false] };

    try {
      // 1. Write to cache
      await setCached(testKey, payload, 30);

      // 2. Read back from cache
      const retrieved = await getCached<typeof payload>(testKey);
      assert.deepStrictEqual(retrieved, payload, "Retrieved cached object should match original");

      // 3. Delete and ensure miss
      await deleteCached(testKey);
      const afterDelete = await getCached(testKey);
      assert.strictEqual(afterDelete, null, "Deleted key should return null");
    } finally {
      await deleteCached(testKey);
    }
  });

  await t.test("SCAN-based prefix deletion works across multiple keys without KEYS", async () => {
    const prefix = "cache:test:prefix-scan:ws123:";
    const keyA = `${prefix}tab-all`;
    const keyB = `${prefix}tab-active`;

    try {
      await setCached(keyA, { tab: "all" }, 30);
      await setCached(keyB, { tab: "active" }, 30);

      assert.ok(await getCached(keyA), "Key A should exist before prefix delete");
      assert.ok(await getCached(keyB), "Key B should exist before prefix delete");

      await deleteByPrefix(prefix);

      assert.strictEqual(await getCached(keyA), null, "Key A should be deleted by SCAN prefix");
      assert.strictEqual(await getCached(keyB), null, "Key B should be deleted by SCAN prefix");
    } finally {
      await deleteCached(keyA);
      await deleteCached(keyB);
    }
  });

  await t.test("Distributed lock token ownership and rogue release prevention", async () => {
    const lockKey = "lock:test:mutex-ownership";

    // Clean up any stale lock
    await forceReleaseLock(lockKey);

    try {
      // 1. Worker A acquires lock with custom or auto token
      const tokenA = await acquireLock(lockKey, 30);
      assert.ok(typeof tokenA === "string" && tokenA.length > 0, "Worker A should acquire and receive a token");

      // 2. Worker B attempts to acquire same lock -> must fail closed (null)
      const tokenB = await acquireLock(lockKey, 30);
      assert.strictEqual(tokenB, null, "Worker B must fail to acquire an already-held lock");

      // 3. Worker B attempts rogue release using fake token -> must return false and NOT free the lock
      const rogueRelease = await releaseLock(lockKey, "fake-token-attempt");
      assert.strictEqual(rogueRelease, false, "Release with mismatched token must return false");

      // Lock should STILL be held by Worker A
      const tokenC = await acquireLock(lockKey, 30);
      assert.strictEqual(tokenC, null, "Lock must remain held after rogue release attempt");

      // 4. Worker A releases lock with valid token -> must succeed
      const validRelease = await releaseLock(lockKey, tokenA!);
      assert.strictEqual(validRelease, true, "Worker A release with valid token must succeed");

      // 5. Worker B can now acquire
      const tokenBSecondAttempt = await acquireLock(lockKey, 30);
      assert.ok(typeof tokenBSecondAttempt === "string", "Acquire after release should succeed");

      // Clean up with Worker B's token
      await releaseLock(lockKey, tokenBSecondAttempt!);
    } finally {
      await forceReleaseLock(lockKey);
    }
  });

  await t.test("Administrative forceReleaseLock unconditionally frees lock", async () => {
    const lockKey = "lock:test:reaper-force";

    try {
      const token = await acquireLock(lockKey, 30);
      assert.ok(token, "Initial acquire should succeed");

      // Unconditional reaper force release
      await forceReleaseLock(lockKey);

      // Lock should now be immediately acquirable by another worker
      const secondToken = await acquireLock(lockKey, 30);
      assert.ok(secondToken, "Acquire after forceReleaseLock should succeed immediately");

      await forceReleaseLock(lockKey);
    } finally {
      await forceReleaseLock(lockKey);
    }
  });

  await t.test("Canonical filter hashing eliminates parameter ordering and strips tracking params", () => {
    // 1. Parameter order independence
    const hash1 = buildCanonicalFilterHash({ page: "1", tab: "all", limit: "25" });
    const hash2 = buildCanonicalFilterHash({ limit: "25", tab: "all", page: "1" });
    assert.strictEqual(hash1, hash2, "Disordered query params must generate identical filter hash");

    // 2. Strips ephemeral params (_t, refresh)
    const hashWithEphemeral = buildCanonicalFilterHash({
      page: "1",
      tab: "all",
      limit: "25",
      _t: "123456789",
      refresh: "true",
    });
    assert.strictEqual(hashWithEphemeral, hash1, "Ephemeral params must not alter filter hash");

    // 3. Allowlist filtering
    const allowlist = ["page", "tab"];
    const hashAllowlisted = buildCanonicalFilterHash(
      { page: "1", tab: "all", utm_source: "facebook", fbclid: "xyz" },
      allowlist
    );
    const hashClean = buildCanonicalFilterHash({ page: "1", tab: "all" }, allowlist);
    assert.strictEqual(hashAllowlisted, hashClean, "Untracked query params must be discarded by allowlist");

    // 4. Empty/default produces fixed 'default' string
    const emptyHash = buildCanonicalFilterHash({});
    assert.strictEqual(emptyHash, "default", "Empty params should return default key");
  });

  await t.test("Payload size ceiling (>400 KB) rejects write from BOTH L1 and L2", async () => {
    _clearMemoryCache();
    const oversizeKey = "cache:test:oversized-payload";

    // Create payload larger than 400 KB (500 KB string)
    const largeObject = { data: "x".repeat(500 * 1024) };

    try {
      await setCached(oversizeKey, largeObject, 30);

      // Verify it was rejected from L1 memory
      assert.strictEqual(_getMemoryCacheSize(), 0, "Oversized payload must not be stored in L1 memory");

      // Verify it was rejected from Redis L2
      const readBack = await getCached(oversizeKey);
      assert.strictEqual(readBack, null, "Oversized payload must not be stored in Redis L2");
    } finally {
      await deleteCached(oversizeKey);
      _clearMemoryCache();
    }
  });

  await t.test("Brand cache key scoping and inverted index deduplication", async () => {
    // 1. Tenant-isolated brand cache keys
    const ws1 = "workspace-111";
    const ws2 = "workspace-222";
    const brandId = "brand-acme";

    const keyWs1 = `cache:brand:${ws1}:${brandId}:all`;
    const keyWs2 = `cache:brand:${ws2}:${brandId}:all`;

    try {
      await setCached(keyWs1, { brand: "Acme", isWatchlisted: true }, 30);
      await setCached(keyWs2, { brand: "Acme", isWatchlisted: false }, 30);

      const dataWs1 = await getCached<any>(keyWs1);
      const dataWs2 = await getCached<any>(keyWs2);

      assert.strictEqual(dataWs1?.isWatchlisted, true, "Workspace 1 should see true");
      assert.strictEqual(dataWs2?.isWatchlisted, false, "Workspace 2 should see false");
    } finally {
      await deleteByPrefix(`cache:brand:${ws1}:`);
      await deleteByPrefix(`cache:brand:${ws2}:`);
    }

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

    const product = { id: "prod_A", url: "https://shop.com/prod-a" };
    const matchedMap = new Map<string, MockAd>();
    (adsByProductId.get(product.id) || []).forEach((ad) => matchedMap.set(ad.id, ad));
    if (product.url) {
      (adsByNormUrl.get(product.url) || []).forEach((ad) => matchedMap.set(ad.id, ad));
    }
    const matchingAds = Array.from(matchedMap.values());

    assert.strictEqual(matchingAds.length, 3, "Matching ads must be deduplicated across product ID and URL");
    const matchedIds = matchingAds.map((a) => a.id).sort();
    assert.deepStrictEqual(matchedIds, ["ad_1", "ad_2", "ad_3"], "All 3 unique ads should be matched without duplicates");
  });

  await t.test("L1 Memory capacity is strictly bounded at MAX_MEMORY_ENTRIES (500)", async () => {
    _clearMemoryCache();

    // Insert 510 active entries with high TTL (no expired entries, 0 Redis quota consumed)
    for (let i = 0; i < 510; i++) {
      _setMemoryCacheForTest(`cache:test:bounded:${i}`, { idx: i }, 60_000);
    }

    const finalSize = _getMemoryCacheSize();
    assert.strictEqual(finalSize, 500, "L1 memory cache must never exceed MAX_MEMORY_ENTRIES (500)");

    // The oldest entry (index 0) must have been evicted by FIFO policy
    const evicted = await getCached(`cache:test:bounded:0`);
    assert.strictEqual(evicted, null, "Oldest entry should be evicted and return null on getCached");
    _clearMemoryCache();
  });

  await t.test("L1 custom TTL option is accepted by getCached and setCached", async () => {
    _clearMemoryCache();
    const testKey = "cache:test:custom-l1-ttl";

    try {
      // Set with custom 5-minute L1 retention
      await setCached(testKey, { brand: "test" }, 300, { l1MaxTtlMs: 300 * 1000 });
      const fromL1 = await getCached<any>(testKey, { l1MaxTtlMs: 300 * 1000 });
      assert.deepStrictEqual(fromL1, { brand: "test" }, "Should retrieve payload from L1");
    } finally {
      await deleteCached(testKey);
      _clearMemoryCache();
    }
  });

  await t.test("Canonical filter hashing normalizes multi-value URLSearchParams and arrays", () => {
    // 1. Multi-value URLSearchParams in different order
    const paramsA = new URLSearchParams();
    paramsA.append("category", "fashion");
    paramsA.append("category", "electronics");
    paramsA.append("limit", "24");

    const paramsB = new URLSearchParams();
    paramsB.append("limit", "24");
    paramsB.append("category", "electronics");
    paramsB.append("category", "fashion");

    const hashA = buildCanonicalFilterHash(paramsA);
    const hashB = buildCanonicalFilterHash(paramsB);
    assert.strictEqual(hashA, hashB, "Multi-value parameters in different order must generate identical hash");

    // 2. Object with array of values
    const hashC = buildCanonicalFilterHash({ category: ["fashion", "electronics"], limit: "24" });
    assert.strictEqual(hashA, hashC, "Array parameters must match URLSearchParams multi-values");
  });

  await t.test("Oversized payload eviction deletes existing L1 and L2 cache", async () => {
    _clearMemoryCache();
    const testKey = "cache:test:oversize-eviction";

    try {
      // 1. Write an initial valid small payload
      await setCached(testKey, { initial: "valid-data" }, 30);
      const initialRead = await getCached<any>(testKey);
      assert.deepStrictEqual(initialRead, { initial: "valid-data" }, "Initial payload should be cached");

      // 2. Overwrite with oversized payload (>400 KB)
      const oversized = { big: "y".repeat(500 * 1024) };
      await setCached(testKey, oversized, 30);

      // 3. Stale initial payload must be evicted, returning null
      const afterOversized = await getCached(testKey);
      assert.strictEqual(afterOversized, null, "Oversized payload write must evict stale key from both L1 and L2");
    } finally {
      await deleteCached(testKey);
      _clearMemoryCache();
    }
  });

  await t.test("Discriminated lock acquisition and live ownership verification", async () => {
    const lockKey = "lock:test:discriminated-mutex";
    await forceReleaseLock(lockKey);

    try {
      // 1. Worker 1 acquires lock
      const res1 = await acquireLockDetailed(lockKey, 30);
      assert.strictEqual(res1.acquired, true, "Worker 1 should acquire lock");
      const token1 = (res1 as any).token;

      // 2. Worker 2 attempts acquire -> must return { acquired: false, reason: 'contended' }
      const res2 = await acquireLockDetailed(lockKey, 30);
      assert.strictEqual(res2.acquired, false, "Worker 2 must not acquire locked key");
      assert.strictEqual((res2 as any).reason, "contended", "Reason must be contended");

      // 3. Ownership check
      assert.strictEqual(await isLockOwner(lockKey, token1), true, "Worker 1 should be confirmed owner");
      assert.strictEqual(await isLockOwner(lockKey, "bogus-token"), false, "Bogus token must not be owner");

      // 4. Release lock
      await releaseLock(lockKey, token1);
      assert.strictEqual(await isLockOwner(lockKey, token1), false, "Token should no longer be owner after release");
    } finally {
      await forceReleaseLock(lockKey);
    }
  });

  await t.test("getManyCached retrieves multiple keys across L1 and L2 Upstash in a single MGET call", async () => {
    const key1 = "cache:test:mget-1";
    const key2 = "cache:test:mget-2";
    const key3 = "cache:test:mget-missing";

    try {
      await setCached(key1, { id: 1, name: "Item One" }, 30);
      await setCached(key2, { id: 2, name: "Item Two" }, 30);

      // Verify batch retrieval
      const results = await getManyCached<{ id: number; name: string }>([key1, key2, key3]);
      assert.deepStrictEqual(results[key1], { id: 1, name: "Item One" }, "Key 1 should be fetched");
      assert.deepStrictEqual(results[key2], { id: 2, name: "Item Two" }, "Key 2 should be fetched");
      assert.strictEqual(results[key3], null, "Missing key should resolve to null");
    } finally {
      await deleteCached(key1);
      await deleteCached(key2);
    }
  });

  await t.test("Generational cache versioning provides atomic O(1) invalidation", async () => {
    const wsId = "ws-test-gen-123";
    const entity = "pages";

    try {
      // 1. Initial version defaults to 1
      const initialVersion = await getEntityCacheVersion(wsId, entity);
      assert.strictEqual(initialVersion >= 1, true, "Initial version should be at least 1");

      // 2. Bump version
      const bumpedVersion = await bumpEntityCacheVersion(wsId, entity);
      assert.strictEqual(bumpedVersion, initialVersion + 1, "Bumped version should increment by 1");

      // 3. Next read reflects new version
      const readAfterBump = await getEntityCacheVersion(wsId, entity);
      assert.strictEqual(readAfterBump, bumpedVersion, "Version read after bump should match incremented value");
    } finally {
      await deleteCached(`v:${entity}:${wsId}`);
    }
  });
});



