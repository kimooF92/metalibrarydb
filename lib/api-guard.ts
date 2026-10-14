import { NextResponse } from "next/server";
import { timingSafeEqual, verifySessionToken, SESSION_COOKIE_NAME, UserRole } from "./auth";

/**
 * Extracts session cookie value from a NextRequest or standard Request.
 */
function getSessionCookie(request: Request): string | null {
  // If NextRequest with cookies map
  if ("cookies" in request && typeof (request as any).cookies?.get === "function") {
    const val = (request as any).cookies.get(SESSION_COOKIE_NAME)?.value;
    if (val) return val;
  }

  // Parse Cookie header fallback
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

/**
 * Resolves the authenticated user role from the request.
 * - If authenticated via API secret or Bearer matching APP_PASSWORD / API_SECRET (or local dev mode), returns "admin"
 * - If authenticated via Bearer / header matching STAFF_PASSWORD, returns "staff"
 * - If authenticated via browser session cookie, returns session.role || "admin"
 * - If unauthenticated, returns null
 */
export async function getRoleFromRequest(request: Request): Promise<UserRole | null> {
  const appPassword = process.env.APP_PASSWORD;
  const staffPassword = process.env.STAFF_PASSWORD;
  const apiSecret = process.env.API_SECRET;
  const requiredSecret = apiSecret || appPassword;

  // Local dev mode without any passwords
  if ((!appPassword || appPassword.trim() === "") && (!staffPassword || staffPassword.trim() === "")) {
    return "admin";
  }

  // Check header credentials (API secret / Bearer)
  const clientSecret = request.headers.get("x-api-secret");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (clientSecret) {
    if (requiredSecret && timingSafeEqual(clientSecret, requiredSecret)) return "admin";
    if (appPassword && timingSafeEqual(clientSecret, appPassword)) return "admin";
    if (staffPassword && timingSafeEqual(clientSecret, staffPassword)) return "staff";
  }

  if (bearerToken) {
    if (requiredSecret && timingSafeEqual(bearerToken, requiredSecret)) return "admin";
    if (appPassword && timingSafeEqual(bearerToken, appPassword)) return "admin";
    if (staffPassword && timingSafeEqual(bearerToken, staffPassword)) return "staff";
  }

  // Check browser session cookie
  const sessionToken = getSessionCookie(request);
  if (sessionToken) {
    const session = await verifySessionToken(sessionToken);
    if (session) {
      return session.role || "admin";
    }
  }

  return null;
}

/**
 * Validates request authentication against:
 * 1. Valid browser session cookie (ad_tracker_session)
 * 2. Header X-API-Secret matching API_SECRET, APP_PASSWORD, or STAFF_PASSWORD
 * 3. Header Authorization: Bearer <token> matching API_SECRET, APP_PASSWORD, or STAFF_PASSWORD
 * 
 * If neither API_SECRET nor APP_PASSWORD nor STAFF_PASSWORD is set, validation is skipped (local development mode).
 */
export async function validateApiSecret(request: Request): Promise<NextResponse | null> {
  const role = await getRoleFromRequest(request);

  if (role) {
    return null; // Authenticated with either admin or staff
  }

  // Return 401 Unauthorized
  return NextResponse.json(
    {
      error: "Unauthorized: Invalid or missing authentication credentials",
      message: "Authentication required. Please log in or provide X-API-Secret header.",
    },
    { status: 401 }
  );
}

/**
 * Validates that the request has administrator privilege.
 * Rejects staff or unauthenticated callers with 403 / 401 in-memory without database queries.
 */
export async function validateAdminRole(request: Request): Promise<NextResponse | null> {
  const role = await getRoleFromRequest(request);

  if (!role) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Authentication required. Please log in.",
      },
      { status: 401 }
    );
  }

  if (role !== "admin") {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "Administrator privilege required to perform this action.",
      },
      { status: 403 }
    );
  }

  return null;
}


