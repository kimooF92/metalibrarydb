import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

let cachedDbConfigured: { value: boolean; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60s in-memory cache to strictly preserve database egress

async function checkIsDbPasswordSet(): Promise<boolean> {
  const now = Date.now();
  if (cachedDbConfigured && now - cachedDbConfigured.timestamp < CACHE_TTL_MS) {
    return cachedDbConfigured.value;
  }

  try {
    const [settings] = await db
      .select({ appPasswordHash: appSettings.appPasswordHash })
      .from(appSettings)
      .where(eq(appSettings.id, "default"))
      .limit(1);

    const hasHash = Boolean(settings?.appPasswordHash);
    cachedDbConfigured = { value: hasHash, timestamp: now };
    return hasHash;
  } catch {
    return false;
  }
}

export async function GET() {
  if (process.env.DISABLE_AUTH === "true") {
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
      message: "Authentication explicitly disabled; running in open local development mode.",
    });
  }

  const appPassword = process.env.APP_PASSWORD;
  const staffPassword = process.env.STAFF_PASSWORD;
  const hasDbPassword = await checkIsDbPasswordSet();

  const isConfigured = Boolean(
    hasDbPassword ||
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

  let sessionCookie: string | undefined;
  try {
    const cookieStore = await cookies();
    sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  } catch {
    // Graceful fallback if invoked outside active Next.js request store
  }
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
