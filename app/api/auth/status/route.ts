import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export async function GET() {
  const appPassword = process.env.APP_PASSWORD;
  const isConfigured = Boolean(appPassword && appPassword.trim().length > 0);

  if (!isConfigured) {
    return NextResponse.json({
      isConfigured: false,
      authenticated: true,
      message: "No APP_PASSWORD set; running in open local development mode.",
    });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(sessionCookie);

  if (!session) {
    return NextResponse.json({
      isConfigured: true,
      authenticated: false,
    });
  }

  return NextResponse.json({
    isConfigured: true,
    authenticated: true,
    session: {
      createdAt: new Date(session.iat * 1000).toISOString(),
      expiresAt: new Date(session.exp * 1000).toISOString(),
    },
  });
}
