import { NextResponse } from "next/server";
import { getCached } from "@/lib/cache-service";
import { validateApiSecret } from "@/lib/api-guard";
import { db } from "@/db";
import { trackedPages } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

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
 * Ultra-fast status reader powered by Upstash Redis with auto-healing for crashed workers.
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

    // Auto-rescue any stuck scanning pages that have no active progress in Redis (e.g. worker OOM crash)
    const missingIds = targetIds.filter((id) => !progressMap[id]);
    if (missingIds.length > 0) {
      try {
        const stuckPages = await db
          .select({
            id: trackedPages.id,
            displayName: trackedPages.displayName,
            status: trackedPages.status,
            updatedAt: trackedPages.updatedAt,
            currentResults: trackedPages.currentResults,
            lastSuccessAt: trackedPages.lastSuccessAt,
          })
          .from(trackedPages)
          .where(and(inArray(trackedPages.id, missingIds), eq(trackedPages.status, "scanning")));

        const now = Date.now();
        for (const page of stuckPages) {
          const ageMs = page.updatedAt ? now - new Date(page.updatedAt).getTime() : 999999;
          // If scan started more than 45s ago with zero active Redis progress, the worker was terminated
          if (ageMs > 45_000) {
            const fallbackStatus = page.lastSuccessAt || page.currentResults !== null ? "success" : "failed";
            await db
              .update(trackedPages)
              .set({ status: fallbackStatus, updatedAt: new Date() })
              .where(eq(trackedPages.id, page.id))
              .catch(() => {});

            progressMap[page.id] = {
              pageId: page.id,
              displayName: page.displayName,
              step: fallbackStatus === "success" ? "completed" : "failed",
              label:
                fallbackStatus === "success"
                  ? "Restored prior scan results"
                  : "Scan timed out or worker process terminated",
              percent: 100,
              timestamp: now,
            };
          }
        }
      } catch (checkErr) {
        console.warn("[Scan Progress API] Stale scan check warning:", checkErr);
      }
    }

    return NextResponse.json({ progress: progressMap });
  } catch (err: any) {
    console.error("Error in GET /api/scan-progress:", err);
    return NextResponse.json({ error: "Failed to fetch scan progress" }, { status: 500 });
  }
}
