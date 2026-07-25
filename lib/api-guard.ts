import { NextResponse } from "next/server";

/**
 * Validates request header X-API-Secret against env API_SECRET.
 * If API_SECRET is not set, validation is skipped (local development mode).
 */
export function validateApiSecret(request: Request): NextResponse | null {
  const requiredSecret = process.env.API_SECRET;

  if (!requiredSecret) {
    return null; // Local dev mode — no secret required
  }

  const clientSecret = request.headers.get("x-api-secret");

  if (!clientSecret || clientSecret !== requiredSecret) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing X-API-Secret header" },
      { status: 401 }
    );
  }

  return null;
}
