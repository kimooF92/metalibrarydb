import test from "node:test";
import assert from "node:assert/strict";
import {
  getCached,
  setCached,
  deleteCached,
  deleteByPrefix,
  acquireLock,
  releaseLock,
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
});
