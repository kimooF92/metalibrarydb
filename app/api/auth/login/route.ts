import { NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  timingSafeEqual,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    // Extract client IP for brute force throttling
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : realIp || "127.0.0.1";

    // Check rate limiter
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

    // If no password is set on the server, reject or advise configuration
    if (!appPassword || appPassword.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration missing: APP_PASSWORD is not set in environment variables.",
        },
        { status: 500 }
      );
    }

    // Verify password with timing-safe comparison
    const isMatch = timingSafeEqual(password, appPassword);

    if (!isMatch) {
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

    // Reset rate limiter on successful authentication
    resetLoginRateLimit(clientIp);

    // Duration: 30 days if rememberMe, otherwise 1 day
    const durationSeconds = rememberMe ? SESSION_DURATION_SECONDS : 24 * 60 * 60;
    const token = await createSessionToken(durationSeconds);

    const response = NextResponse.json({
      success: true,
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

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal authentication error" },
      { status: 500 }
    );
  }
}
