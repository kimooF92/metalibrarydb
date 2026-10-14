import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export async function GET() {
  const appPassword = process.env.APP_PASSWORD;
  const staffPassword = process.env.STAFF_PASSWORD;
  const isConfigured = Boolean(
    (appPassword && appPassword.trim().length > 0) ||
    (staffPassword && staffPassword.trim().length > 0)
  );

  if (!isConfigured) {
    return NextResponse.json({
      isConfigured: false,
      authenticated: true,
      role: "admin",
      permissions: {
        canEditProduct: true,
        canViewAnalytics: true,
        canAddTrackedPage: true,
        canDelete: true,
        canAccessSettings: true,
        canAccessIntelligence: true,
      },
      message: "No passwords set; running in open local development mode.",
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

  const role = session.role || "admin";
  const isStaff = role === "staff";

  return NextResponse.json({
    isConfigured: true,
    authenticated: true,
    role,
    permissions: {
      canEditProduct: true,
      canViewAnalytics: true,
      canAddTrackedPage: true,
      canDelete: !isStaff,
      canAccessSettings: !isStaff,
      canAccessIntelligence: !isStaff,
    },
    session: {
      createdAt: new Date(session.iat * 1000).toISOString(),
      expiresAt: new Date(session.exp * 1000).toISOString(),
    },
  });
}
