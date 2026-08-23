import { NextResponse } from "next/server";
import { timingSafeEqual, verifySessionToken, SESSION_COOKIE_NAME } from "./auth";

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
 * Validates request authentication against:
 * 1. Valid browser session cookie (ad_tracker_session)
 * 2. Header X-API-Secret matching API_SECRET or APP_PASSWORD
 * 3. Header Authorization: Bearer <token> matching API_SECRET or APP_PASSWORD
 * 
 * If neither API_SECRET nor APP_PASSWORD is set, validation is skipped (local development mode).
 */
export async function validateApiSecret(request: Request): Promise<NextResponse | null> {
  const appPassword = process.env.APP_PASSWORD;
  const apiSecret = process.env.API_SECRET;
  const requiredSecret = apiSecret || appPassword;

  // 1. Local development mode — no secret or password configured
  if (!requiredSecret || requiredSecret.trim() === "") {
    return null;
  }

  // 2. Check X-API-Secret header or Bearer token (for background workers & automation)
  const clientSecret = request.headers.get("x-api-secret");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (clientSecret) {
    if (timingSafeEqual(clientSecret, requiredSecret)) return null;
    if (appPassword && timingSafeEqual(clientSecret, appPassword)) return null;
  }

  if (bearerToken) {
    if (timingSafeEqual(bearerToken, requiredSecret)) return null;
    if (appPassword && timingSafeEqual(bearerToken, appPassword)) return null;
  }

  // 3. Check browser session cookie (for logged-in UI users)
  const sessionToken = getSessionCookie(request);
  if (sessionToken) {
    const session = await verifySessionToken(sessionToken);
    if (session) {
      return null;
    }
  }

  // 4. Return 401 Unauthorized
  return NextResponse.json(
    {
      error: "Unauthorized: Invalid or missing X-API-Secret header",
      message: "Authentication required. Please log in or provide X-API-Secret header.",
    },
    { status: 401 }
  );
}

