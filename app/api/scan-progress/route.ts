import { NextResponse } from "next/server";
import { getCached } from "@/lib/cache-service";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export interface ScanProgressStep {
  pageId: string;
  displayName?: string | null;
  step: "locked" | "launching" | "navigating" | "settling" | "extracting" | "saving" | "completed" | "failed";
  label: string;
  percent: number;
  activeAds?: number | null;
  timestamp: number;
}

/**
 * GET /api/scan-progress?pageId=xxx OR ?pageIds=xxx,yyy
 * Ultra-fast status reader powered 100% by Upstash Redis.
 * Zero database queries, zero PostgreSQL egress bloat.
 */
export async function GET(request: Request) {
  const authError = await validateApiSecret(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const singleId = searchParams.get("pageId")?.trim();
    const multiIdsRaw = searchParams.get("pageIds")?.trim();

    const ids: string[] = [];
    if (singleId) ids.push(singleId);
    if (multiIdsRaw) {
      multiIdsRaw.split(",").forEach((id) => {
        const clean = id.trim();
        if (clean && !ids.includes(clean)) ids.push(clean);
      });
    }

    if (ids.length === 0) {
      return NextResponse.json({ progress: {} });
    }

    // Limit batch to 25 keys to prevent Redis abuse
    const targetIds = ids.slice(0, 25);

    const results = await Promise.all(
      targetIds.map(async (id) => {
        const stepData = await getCached<ScanProgressStep>(`scan_step:${id}`);
        return [id, stepData] as const;
      })
    );

    const progressMap: Record<string, ScanProgressStep> = {};
    for (const [id, step] of results) {
      if (step) {
        progressMap[id] = step;
      }
    }

    return NextResponse.json({ progress: progressMap });
  } catch (err: any) {
    console.error("Error in GET /api/scan-progress:", err);
    return NextResponse.json({ error: "Failed to fetch scan progress" }, { status: 500 });
  }
}
