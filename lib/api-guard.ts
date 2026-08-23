import { NextResponse } from "next/server";
import { timingSafeEqual } from "./auth";

/**
 * Validates request header X-API-Secret or Authorization Bearer against API_SECRET or APP_PASSWORD.
 * If neither API_SECRET nor APP_PASSWORD is set, validation is skipped (local development mode).
 */
export function validateApiSecret(request: Request): NextResponse | null {
  const requiredSecret = process.env.API_SECRET || process.env.APP_PASSWORD;

  if (!requiredSecret) {
    return null; // Local dev mode — no secret required
  }

  const clientSecret = request.headers.get("x-api-secret");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (clientSecret && timingSafeEqual(clientSecret, requiredSecret)) {
    return null;
  }

  if (bearerToken && timingSafeEqual(bearerToken, requiredSecret)) {
    return null;
  }

  // Also allow matching APP_PASSWORD if API_SECRET was set separately
  const appPassword = process.env.APP_PASSWORD;
  if (appPassword) {
    if (clientSecret && timingSafeEqual(clientSecret, appPassword)) return null;
    if (bearerToken && timingSafeEqual(bearerToken, appPassword)) return null;
  }

  return NextResponse.json(
    { error: "Unauthorized: Invalid or missing X-API-Secret header" },
    { status: 401 }
  );
}
