import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { Redis } from "@upstash/redis";

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const isConfigured = Boolean(
    url && token && !url.includes("[YOUR-") && !token.includes("[YOUR-")
  );

  return isConfigured
    ? new Redis({
        url: url!,
        token: token!,
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

