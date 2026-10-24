import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret, getRoleFromRequest } from "@/lib/api-guard";
import { getActiveWorkspace, getTunisianWorkspace } from "@/lib/workspace-server";
import { getOpportunityTelemetrySnapshot } from "@/lib/opportunities/telemetry-feeder";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TelemetrySnapshot } from "@/lib/opportunities/prompt-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Strictly align with TimeWindow type contract ("7d" | "14d" | "30d")
const RANGE_MAP: Record<string, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

// 60-Second In-Memory Cache to protect Supabase pooler & prevent duplicate execution on remounts
interface CacheEntry {
  timestamp: number;
  snapshot: TelemetrySnapshot;
}
const telemetryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

export async function GET(req: NextRequest) {
  // 1. Auth Guard
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = req.nextUrl;

    // 2. Validate Range strictly against documented 7d | 14d | 30d contract
    const rangeParam = searchParams.get("range")?.toLowerCase()?.trim() || "7d";
    if (!rangeParam || !(rangeParam in RANGE_MAP)) {
      return NextResponse.json(
        {
          error: "Invalid 'range' parameter. Expected: 7d | 14d | 30d",
        },
        { status: 400 }
      );
    }
    const rangeDays = RANGE_MAP[rangeParam];

    // 3. Strict Workspace Resolution & Non-Tautological Authorization
    const role = await getRoleFromRequest(req);
    let targetWorkspaceId: string;

    if (role === "staff") {
      // Staff users are strictly scoped to the Tunisian workspace; reject attempts to probe other workspaces
      const tunisianWs = await getTunisianWorkspace();
      const headerWorkspaceId = req.headers.get("x-workspace-id")?.trim();
      if (headerWorkspaceId && headerWorkspaceId !== tunisianWs.id) {
        return NextResponse.json(
          { error: "Forbidden: Staff members are restricted to the default workspace" },
          { status: 403 }
        );
      }
      targetWorkspaceId = tunisianWs.id;
    } else if (role === "admin") {
      const headerWorkspaceId = req.headers.get("x-workspace-id")?.trim();
      if (headerWorkspaceId) {
        if (!UUID_REGEX.test(headerWorkspaceId)) {
          return NextResponse.json(
            { error: "Invalid workspace UUID format in x-workspace-id header" },
            { status: 400 }
          );
        }

        const [found] = await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.id, headerWorkspaceId))
          .limit(1);

        if (!found) {
          return NextResponse.json(
            { error: "Specified workspace not found" },
            { status: 404 }
          );
        }
        targetWorkspaceId = found.id;
      } else {
        const activeWorkspace = await getActiveWorkspace(req);
        targetWorkspaceId = activeWorkspace.id;
      }
    } else {
      return NextResponse.json(
        { error: "Forbidden: You are not authorized to access telemetry" },
        { status: 403 }
      );
    }

    // 4. Cache Check (60s TTL keyed by workspace and range)
    const cacheKey = `${targetWorkspaceId}:${rangeDays}`;
    const cached = telemetryCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.snapshot, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
          "X-Telemetry-Cache": "HIT",
        },
      });
    }

    // 5. Fetch Telemetry Snapshot
    const snapshot = await getOpportunityTelemetrySnapshot(targetWorkspaceId, rangeDays);

    // Save to Cache
    telemetryCache.set(cacheKey, {
      timestamp: now,
      snapshot,
    });

    return NextResponse.json(snapshot, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
        "X-Telemetry-Cache": "MISS",
      },
    });
  } catch (error: any) {
    console.error("[Opportunities Telemetry API] Error generating snapshot:", error);
    return NextResponse.json(
      { error: "Failed to generate market telemetry snapshot" },
      { status: 500 }
    );
  }
}
