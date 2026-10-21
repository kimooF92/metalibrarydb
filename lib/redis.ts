import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const isConfigured = Boolean(url && token && !url.includes("[YOUR-") && !token.includes("[YOUR-"));

/**
 * Singleton Upstash Redis REST Client.
 *
 * Uses stateless HTTP requests rather than persistent TCP sockets,
 * making it ideal for Vercel Serverless, Edge runtimes, and local background tasks.
 * Evaluates to `null` if credentials are not configured, enabling automatic
 * graceful degradation to direct database operations.
 */
export const redis: Redis | null = isConfigured
  ? new Redis({
      url: url!,
      token: token!,
    })
  : null;

/**
 * Quick liveness and configuration check.
 */
export function isRedisAvailable(): boolean {
  return redis !== null;
}
