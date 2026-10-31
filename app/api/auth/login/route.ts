import { NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  timingSafeEqual,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  UserRole,
} from "@/lib/auth";
import {
  loginRateLimiter,
  checkRateLimit,
  resetRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/ratelimit";

export async function POST(request: Request) {
  try {
    // Extract client IP for brute force throttling
    const clientIp = getClientIp(request);

    // 1. Check Upstash distributed rate limiter (works across all serverless instances)
    const upstashRate = await checkRateLimit(loginRateLimiter, clientIp);
    if (!upstashRate.success) {
      return rateLimitResponse(
        upstashRate.retryAfterSeconds,
        `Too many login attempts from this IP. Please wait ${upstashRate.retryAfterSeconds}s before trying again.`
      );
    }

    // 2. Fallback check local in-memory rate limiter
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed attempts. Please wait ${rateCheck.waitSeconds}s before trying again.`,
          retryAfter: rateCheck.waitSeconds,
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";
    const rememberMe = body.rememberMe !== false; // Default true

    const appPassword = process.env.APP_PASSWORD;
    const staffPassword = process.env.STAFF_PASSWORD;

    // Check credentials against both configured passwords
    const isAdmin = appPassword && appPassword.trim() !== "" ? timingSafeEqual(password, appPassword) : false;
    const isStaff = staffPassword && staffPassword.trim() !== "" ? timingSafeEqual(password, staffPassword) : false;

    // If neither password matched (or neither is configured)
    if (!isAdmin && !isStaff) {
      // If no password at all is configured in the environment
      if ((!appPassword || appPassword.trim() === "") && (!staffPassword || staffPassword.trim() === "")) {
        return NextResponse.json(
          {
            success: false,
            error: "Server configuration missing: Neither APP_PASSWORD nor STAFF_PASSWORD is set in environment variables.",
          },
          { status: 500 }
        );
      }

      const { attemptsLeft, blockedSeconds } = recordFailedLogin(clientIp);
      if (blockedSeconds) {
        return NextResponse.json(
          {
            success: false,
            error: `Too many failed attempts. Account locked for ${Math.ceil(blockedSeconds / 60)} minutes.`,
            retryAfter: blockedSeconds,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `Incorrect password. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`,
          attemptsLeft,
        },
        { status: 401 }
      );
    }

    // Reset rate limiters on successful authentication
    resetLoginRateLimit(clientIp);
    await resetRateLimit(loginRateLimiter, clientIp);

    const role: UserRole = isAdmin ? "admin" : "staff";

    // Duration: 30 days if rememberMe, otherwise 1 day
    const durationSeconds = rememberMe ? SESSION_DURATION_SECONDS : 24 * 60 * 60;
    const token = await createSessionToken(durationSeconds, role);

    const response = NextResponse.json({
      success: true,
      role,
      message: "Authentication successful",
    });

    const isProduction = process.env.NODE_ENV === "production";

    // Set secure HTTP-only cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: durationSeconds,
    });

    // Also set client-accessible role cookie to eliminate SSR/hydration flash
    response.cookies.set({
      name: "ad_tracker_role",
      value: role,
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: durationSeconds,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal authentication error" },
      { status: 500 }
    );
  }
}
