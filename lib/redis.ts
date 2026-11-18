if (typeof window === "undefined" && !process.env.UPSTASH_REDIS_REST_URL) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: ".env.local" });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config();
  } catch {}
}

import { Redis } from "@upstash/redis";

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const isConfigured = Boolean(
    url && token && !url.includes("[YOUR-") && !token.includes("[YOUR-")
  );

  // Balanced timeout (default 3500ms, configurable via UPSTASH_REDIS_TIMEOUT_MS):
  // Provides ample headroom for TLS handshakes, parallel batch operations (SCAN/DEL),
  // and distributed lock evaluations while preventing Next.js API routes from stalling indefinitely.
  const timeoutMs = Number(process.env.UPSTASH_REDIS_TIMEOUT_MS) || 3500;

  return isConfigured
    ? new Redis({
        url: url!,
        token: token!,
        signal: () => AbortSignal.timeout(timeoutMs),
        retry: {
          retries: 1,
        },
      })
    : null;
}

/**
 * Singleton Upstash Redis REST Client.
 *
 * Uses stateless HTTP requests rather than persistent TCP sockets,
 * making it ideal for Vercel Serverless, Edge runtimes, and local background tasks.
 * Evaluates to `null` if credentials are not configured, enabling automatic
 * graceful degradation to direct database operations.
 */
export let redis: Redis | null = createRedisClient();

/**
 * Accessor for the Redis client that lazily re-checks environment variables
 * if redis was null during initial module evaluation.
 */
export function getRedis(): Redis | null {
  if (!redis) {
    redis = createRedisClient();
  }
  return redis;
}

/**
 * Quick liveness and configuration check.
 */
export function isRedisAvailable(): boolean {
  if (!redis) {
    redis = createRedisClient();
  }
  return redis !== null;
}

