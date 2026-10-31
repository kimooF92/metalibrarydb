import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/redis";
import { timingSafeEqual } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export function createLimiter(
  tokens: number,
  window: `${number} ${"s" | "m" | "h" | "d"}`,
  prefix: string,
  algorithm: "sliding" | "fixed" = "sliding"
): Ratelimit | null {
  const redisClient = getRedis();
  if (!redisClient) return null;

  return new Ratelimit({
    redis: redisClient,
    limiter:
      algorithm === "fixed"
        ? Ratelimit.fixedWindow(tokens, window)
        : Ratelimit.slidingWindow(tokens, window),
    ephemeralCache: new Map(),
    prefix,
    analytics: false,
  });
}

/**
 * 1. Authentication brute-force protection (5 requests / 10 minutes per IP)
 */
export const loginRateLimiter = createLimiter(5, "10 m", "rl:auth:login");

/**
 * 2. Public media & image proxy abuse protection (60 requests / 1 minute per IP)
 */
export const mediaProxyRateLimiter = createLimiter(60, "1 m", "rl:media:proxy");

/**
 * 3. Paid scraping / Firecrawl extraction protection (10 requests / 1 minute per IP/user)
 */
export const scraperRateLimiter = createLimiter(10, "1 m", "rl:scraper:extract");

/**
 * 4. Heavy CSV / Analytics database export protection (5 requests / 1 minute per IP/user)
 */
export const exportRateLimiter = createLimiter(5, "1 m", "rl:export:analytics");

/**
 * 5. Ad refresh and crawler trigger protection (10 requests / 1 minute per IP/user)
 */
export const scanRateLimiter = createLimiter(10, "1 m", "rl:scan:refresh");

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfterSeconds: number;
}

/**
 * Determines whether a request comes from trusted internal automation (e.g. worker scripts,
 * Trigger.dev tasks, GitHub Actions, or automated CI/unit tests) authenticated via the master API_SECRET.
 * Trusted internal background workers are exempted so they aren't halted mid-batch.
 */
export function isTrustedInternalRequest(req: Request | NextRequest): boolean {
  if (process.env.DISABLE_RATE_LIMIT === "true" || process.env.NODE_ENV === "test") {
    return true;
  }

  const appPassword = process.env.APP_PASSWORD;
  const apiSecret = process.env.API_SECRET;
  const master = apiSecret || appPassword;
  if (!master || master.trim() === "") return false;

  const secretHeader = req.headers.get("x-api-secret");
  if (secretHeader && timingSafeEqual(secretHeader, master)) return true;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (timingSafeEqual(token, master)) return true;
  }

  return false;
}

/**
 * Executes a rate limit check with fail-open safety.
 * If Redis is offline, unconfigured, or times out, it gracefully allows the request.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<RateLimitResult> {
  if (!limiter) {
    return {
      success: true,
      limit: 0,
      remaining: 0,
      reset: 0,
      retryAfterSeconds: 0,
    };
  }

  try {
    const result = await limiter.limit(identifier);
    const now = Date.now();
    const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - now) / 1000));

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfterSeconds,
    };
  } catch (error) {
    // Fail-open: Never block legitimate user requests due to transient Redis network hiccups
    console.warn("[RateLimit] Upstash check failed, allowing request (fail-open):", error);
    return {
      success: true,
      limit: 0,
      remaining: 0,
      reset: 0,
      retryAfterSeconds: 0,
    };
  }
}

/**
 * Reset used tokens for an identifier (e.g., on successful login).
 */
export async function resetRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<void> {
  if (!limiter) return;
  try {
    await limiter.resetUsedTokens(identifier);
  } catch (error) {
    console.warn("[RateLimit] Failed to reset tokens:", error);
  }
}

/**
 * Extracts client IP across Next.js Route Handlers and middleware.
 */
export function getClientIp(req: Request | NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }

  return "127.0.0.1";
}

/**
 * Standard HTTP 429 Too Many Requests response with standard Retry-After header.
 */
export function rateLimitResponse(retryAfterSeconds: number, message?: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message || `Too many requests. Please wait ${retryAfterSeconds}s before trying again.`,
      retryAfter: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}


