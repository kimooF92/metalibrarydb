import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret } from "@/lib/api-guard";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { fetchDashboardOverview } from "@/services/dashboard-overview-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

/**
 * GET /api/dashboard/overview
 * Thin orchestrator delegating to dashboard-overview-service
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";
    const clientTz = searchParams.get("tz") || req.headers.get("x-timezone");

    const payload = await fetchDashboardOverview({
      workspaceId: activeWorkspace.id,
      countryCode: activeWorkspace.countryCode,
      clientTz,
      forceRefresh,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
        Vary: PRIVATE_AUTH_VARY,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/dashboard/overview:", error);
    return NextResponse.json(
      { error: "Failed to generate dashboard overview" },
      { status: 500 }
    );
  }
}
