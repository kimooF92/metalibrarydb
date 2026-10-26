import { redis } from "./redis";

interface MemoryEntry {
  value: any;
  expiresAt: number;
}

// In-Memory L1 Cache (Coalesces rapid requests within the same Node/Serverless process)
const memoryCache = new Map<string, MemoryEntry>();
const MAX_MEMORY_ENTRIES = 500;
const L1_MAX_TTL_MS = 10 * 1000; // 10 seconds max L1 retention

/**
 * Evict expired keys from L1 memory, and if capacity is still reached,
 * evict the oldest entry (FIFO/insertion-order) to guarantee MAX_MEMORY_ENTRIES bound.
 */
function ensureMemoryCapacity(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }

  while (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (!oldestKey) break;
    memoryCache.delete(oldestKey);
  }
}

/**
 * For unit testing memory cache metrics and bounds.
 */
export function _getMemoryCacheSize(): number {
  return memoryCache.size;
}

export function _clearMemoryCache(): void {
  memoryCache.clear();
}

export function _setMemoryCacheForTest(key: string, value: any, ttlMs: number): void {
  ensureMemoryCapacity();
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Retrieve cached data with Hybrid L1 (Memory) -> L2 (Upstash Redis) lookup.
 * Automatically handles serialization, fallback, and error suppression.
 */
export async function getCached<T>(
  key: string,
  options?: { l1MaxTtlMs?: number }
): Promise<T | null> {
  const now = Date.now();

  // 1. Check L1 Memory Cache (0 Upstash commands consumed)
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > now) {
    return mem.value as T;
  } else if (mem) {
    memoryCache.delete(key);
  }

  // 2. Check L2 Upstash Redis
  if (!redis) return null;

  try {
    const data = await redis.get<T>(key);
    if (data !== null && data !== undefined) {
      // Backfill L1 memory for subsequent micro-requests with bounded capacity
      ensureMemoryCapacity();
      const maxL1 = options?.l1MaxTtlMs ?? L1_MAX_TTL_MS;
      memoryCache.set(key, {
        value: data,
        expiresAt: now + maxL1,
      });
      return data;
    }
    return null;
  } catch (err: any) {
    // Suppress network or quota errors gracefully
    console.warn(`[Upstash Cache Warning] getCached("${key}") failed:`, err?.message || err);
    return null;
  }
}

/**
 * Store data into both L1 Memory and L2 Upstash Redis with a mandatory TTL.
 *
 * @param key Cache key string
 * @param value JSON-serializable data payload
 * @param ttlSeconds Expiration in seconds (mandatory to prevent orphaned Redis keys)
 * @param options Optional configuration including custom l1MaxTtlMs
 */
export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number,
  options?: { l1MaxTtlMs?: number }
): Promise<void> {
  const now = Date.now();
  const maxL1 = options?.l1MaxTtlMs ?? L1_MAX_TTL_MS;
  const l1TtlMs = Math.min(ttlSeconds * 1000, maxL1);

  // 1. Populate L1 Memory with bounded capacity
  ensureMemoryCapacity();
  memoryCache.set(key, {
    value,
    expiresAt: now + l1TtlMs,
  });

  // 2. Populate L2 Upstash Redis
  if (!redis) return;

  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (err: any) {
    console.warn(`[Upstash Cache Warning] setCached("${key}") failed:`, err?.message || err);
  }
}

/**
 * Delete a single key from both L1 Memory and L2 Upstash Redis.
 */
export async function deleteCached(key: string): Promise<void> {
  memoryCache.delete(key);

  if (!redis) return;

  try {
    await redis.del(key);
  } catch (err: any) {
    console.warn(`[Upstash Cache Warning] deleteCached("${key}") failed:`, err?.message || err);
  }
}

/**
 * Invalidate all keys matching a given prefix.
 * Example: `deleteByPrefix("cache:pages:workspace_123:")`
 */
export async function deleteByPrefix(prefix: string): Promise<void> {
  // 1. Clear matching L1 memory keys
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }

  // 2. Clear matching L2 Upstash keys
  if (!redis) return;

  try {
    const keys = await redis.keys(`${prefix}*`);
    if (keys && keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err: any) {
    console.warn(`[Upstash Cache Warning] deleteByPrefix("${prefix}") failed:`, err?.message || err);
  }
}

/**
 * Acquire an atomic distributed lock using Redis `SET key 1 NX EX <ttlSeconds>`.
 * Returns `true` if lock was successfully acquired, `false` if another worker holds it.
 *
 * Note: If Redis is unconfigured, returns `true` as a graceful pass-through.
 */
export async function acquireLock(lockKey: string, ttlSeconds = 120): Promise<boolean> {
  if (!redis) return true; // Graceful pass-through

  try {
    const res = await redis.set(lockKey, "1", {
      nx: true,
      ex: ttlSeconds,
    });
    return res === "OK";
  } catch (err: any) {
    console.warn(`[Upstash Lock Warning] acquireLock("${lockKey}") failed:`, err?.message || err);
    // On Redis error, fail open so scraping is not permanently blocked
    return true;
  }
}

/**
 * Release an atomic distributed lock.
 */
export async function releaseLock(lockKey: string): Promise<void> {
  if (!redis) return;

  try {
    await redis.del(lockKey);
  } catch (err: any) {
    console.warn(`[Upstash Lock Warning] releaseLock("${lockKey}") failed:`, err?.message || err);
  }
}
