import { createHash } from "crypto";
import { redis } from "./redis";

interface MemoryEntry {
  value: any;
  expiresAt: number;
}

// In-Memory L1 Cache (Coalesces rapid requests within the same Node/Serverless process)
const memoryCache = new Map<string, MemoryEntry>();
const MAX_MEMORY_ENTRIES = 500;
const L1_MAX_TTL_MS = 10 * 1000; // 10 seconds max L1 retention
const MAX_PAYLOAD_BYTES = 400 * 1024; // 400 KB limit for BOTH L1 and L2 cache

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
 * Generates a stable, canonical SHA-256 representation of query filters for cache keys.
 * Strips tracking parameters (_t, refresh), applies allowlisting, sorts keys, and returns a fixed 12-char hex string.
 */
export function buildCanonicalFilterHash(
  params: URLSearchParams | Record<string, any>,
  allowlist?: string[]
): string {
  const map = new Map<string, string[]>();

  if (params instanceof URLSearchParams) {
    for (const [k, v] of params.entries()) {
      if (allowlist && !allowlist.includes(k)) continue;
      if (k === "_t" || k === "refresh" || v === "" || v === undefined || v === null) continue;
      const cleanVal = String(v).trim().toLowerCase();
      if (!cleanVal) continue;
      const existing = map.get(k) || [];
      existing.push(cleanVal);
      map.set(k, existing);
    }
  } else {
    for (const [k, v] of Object.entries(params)) {
      if (allowlist && !allowlist.includes(k)) continue;
      if (k === "_t" || k === "refresh" || v === "" || v === undefined || v === null) continue;
      const vals = Array.isArray(v) ? v : [v];
      const cleanVals = vals
        .map((x) => String(x).trim().toLowerCase())
        .filter(Boolean);
      if (cleanVals.length > 0) {
        map.set(k, cleanVals);
      }
    }
  }

  const sortedKeys = Array.from(map.keys()).sort();
  if (sortedKeys.length === 0) return "default";

  const sortedObj: Record<string, string> = {};
  for (const k of sortedKeys) {
    const sortedVals = Array.from(new Set(map.get(k)!)).sort();
    sortedObj[k] = sortedVals.join(",");
  }

  const raw = JSON.stringify(sortedObj);
  return createHash("sha256").update(raw).digest("hex").slice(0, 12);
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
 * Strictly enforces a 400 KB ceiling across both L1 and L2 to prevent quota and RAM bloat.
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
  // 1. Measure serialized size before writing to either cache tier
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
      console.warn(`[Cache Warning] Payload exceeds 400 KB (${key}). Evicting both L1 and L2 cache.`);
      memoryCache.delete(key);
      if (redis) {
        await redis.del(key).catch(() => {});
      }
      return;
    }
  } catch {
    return; // Safely skip un-serializable payloads
  }

  const now = Date.now();
  const maxL1 = options?.l1MaxTtlMs ?? L1_MAX_TTL_MS;
  const l1TtlMs = Math.min(ttlSeconds * 1000, maxL1);

  // 2. Populate L1 Memory with bounded capacity
  ensureMemoryCapacity();
  memoryCache.set(key, {
    value,
    expiresAt: now + l1TtlMs,
  });

  // 3. Populate L2 Upstash Redis
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
 * Invalidate all keys matching a given prefix safely using cursor-based SCAN.
 * Protects Redis from blocking KEYS scans and limits command bursts via circuit-breaker.
 * Example: `deleteByPrefix("cache:pages:workspace_123:")`
 */
export async function deleteByPrefix(prefix: string): Promise<void> {
  // 1. Clear matching L1 memory keys
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }

  // 2. Clear matching L2 Upstash keys safely via SCAN
  if (!redis) return;

  try {
    let cursor = 0;
    let iterations = 0;
    const MAX_SCAN_ITERATIONS = 20; // Bound to protect Upstash commands while handling multi-thousand key sets

    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: `${prefix}*`,
        count: 200,
      });
      cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor;
      if (keys && keys.length > 0) {
        await redis.del(...keys);
      }
      iterations++;
    } while (cursor !== 0 && iterations < MAX_SCAN_ITERATIONS);

    if (cursor !== 0) {
      console.warn(`[Upstash Cache Warning] deleteByPrefix("${prefix}") stopped after ${iterations} iterations (cursor: ${cursor}). Invalidation may be partial.`);
    }
  } catch (err: any) {
    console.warn(`[Upstash Cache Warning] deleteByPrefix("${prefix}") failed:`, err?.message || err);
  }
}

// Lua Script: Atomic Compare-and-Delete for safe lock release
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export type AcquireLockResult =
  | { acquired: true; token: string }
  | { acquired: false; reason: "contended" | "unavailable" };

/**
 * Acquire an atomic distributed lock using Redis `SET key <token> NX EX <ttlSeconds>`.
 * Returns a discriminated result indicating whether lock was acquired or the failure reason.
 */
export async function acquireLockDetailed(
  lockKey: string,
  ttlSeconds = 120,
  ownerToken?: string
): Promise<AcquireLockResult> {
  if (!redis) return { acquired: false, reason: "unavailable" };

  const token =
    ownerToken ||
    (typeof crypto !== "undefined" && (crypto as any).randomUUID
      ? (crypto as any).randomUUID()
      : `${Date.now()}_${Math.random()}`);

  try {
    const res = await redis.set(lockKey, token, {
      nx: true,
      ex: ttlSeconds,
    });
    if (res === "OK") {
      return { acquired: true, token };
    }
    return { acquired: false, reason: "contended" };
  } catch (err: any) {
    console.warn(`[Upstash Lock Warning] acquireLock("${lockKey}") failed:`, err?.message || err);
    return { acquired: false, reason: "unavailable" };
  }
}

/**
 * Convenience wrapper returning token string if acquired, or null otherwise.
 * Preserves fail-closed behavior for standard callers.
 */
export async function acquireLock(
  lockKey: string,
  ttlSeconds = 120,
  ownerToken?: string
): Promise<string | null> {
  const result = await acquireLockDetailed(lockKey, ttlSeconds, ownerToken);
  return result.acquired ? result.token : null;
}

/**
 * Check whether the given lockToken currently owns the lock in Redis.
 * Used before writing expensive responses to cache to prevent expired/superseded writes.
 */
export async function isLockOwner(lockKey: string, lockToken: string): Promise<boolean> {
  if (!redis || !lockToken) return false;
  try {
    const current = await redis.get<string>(lockKey);
    return current === lockToken;
  } catch {
    return false;
  }
}

/**
 * Release an atomic distributed lock using compare-and-delete Lua script.
 * Only deletes the lock if the current caller's token matches the value in Redis.
 * Returns true if released, false if the token did not match or lock was already expired.
 */
export async function releaseLock(lockKey: string, lockToken: string): Promise<boolean> {
  if (!redis || !lockToken) return false;

  try {
    const res = await redis.eval(RELEASE_LOCK_SCRIPT, [lockKey], [lockToken]);
    return res === 1;
  } catch (err: any) {
    console.warn(`[Upstash Lock Warning] releaseLock("${lockKey}") failed:`, err?.message || err);
    return false;
  }
}

/**
 * Force-release a lock unconditionally without token verification.
 * Strictly intended for administrative orphan reaper scripts (e.g. clean-scans.ts).
 */
export async function forceReleaseLock(lockKey: string): Promise<void> {
  if (!redis) return;

  try {
    await redis.del(lockKey);
  } catch (err: any) {
    console.warn(`[Upstash Lock Warning] forceReleaseLock("${lockKey}") failed:`, err?.message || err);
  }
}

