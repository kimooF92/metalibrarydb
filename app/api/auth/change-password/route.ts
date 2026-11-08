import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/crypto-password";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  timingSafeEqual,
} from "@/lib/auth";
import { validateApiSecret, getRoleFromRequest } from "@/lib/api-guard";
import {
  loginRateLimiter,
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);

    // 1. Rate-limiting check to prevent brute-forcing
    const rate = await checkRateLimit(loginRateLimiter, clientIp);
    if (!rate.success) {
      return rateLimitResponse(
        rate.retryAfterSeconds,
        `Too many password change attempts. Please wait ${rate.retryAfterSeconds}s before trying again.`
      );
    }

    // 2. Authentication check: must have a valid admin session
    const authError = await validateApiSecret(request);
    if (authError) {
      return authError;
    }

    const role = await getRoleFromRequest(request);
    if (role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Only administrators can change the workspace password." },
        { status: 403 }
      );
    }

    // 3. Payload validation
    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: "Both current password and new password are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: "New password must be different from current password." },
        { status: 400 }
      );
    }

    // 4. Verify current password against DB or ENV fallback
    const [settings] = await db
      .select({
        appPasswordHash: appSettings.appPasswordHash,
        appPasswordSalt: appSettings.appPasswordSalt,
      })
      .from(appSettings)
      .where(eq(appSettings.id, "default"))
      .limit(1);

    let isCurrentValid = false;

    if (settings?.appPasswordHash && settings?.appPasswordSalt) {
      isCurrentValid = verifyPassword(currentPassword, settings.appPasswordHash, settings.appPasswordSalt);
    } else {
      const appPassword = process.env.APP_PASSWORD;
      isCurrentValid = appPassword && appPassword.trim() !== "" ? timingSafeEqual(currentPassword, appPassword) : false;
    }

    if (!isCurrentValid) {
      return NextResponse.json(
        { success: false, error: "Current password is incorrect." },
        { status: 401 }
      );
    }

    // 5. Generate secure scrypt hash + random salt and persist to Supabase
    const { hash, salt } = hashPassword(newPassword);
    const now = new Date();

    await db
      .update(appSettings)
      .set({
        appPasswordHash: hash,
        appPasswordSalt: salt,
        appPasswordUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(appSettings.id, "default"));

    // 6. Issue a fresh session cookie for the current device
    const token = await createSessionToken(SESSION_DURATION_SECONDS, "admin");

    const response = NextResponse.json({
      success: true,
      message: "Workspace password successfully updated.",
    });

    const isProduction = process.env.NODE_ENV === "production";

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });

    response.cookies.set({
      name: "ad_tracker_role",
      value: "admin",
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });

    return response;
  } catch (error: any) {
    console.error("[change-password] Error updating password:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

