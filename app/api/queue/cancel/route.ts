import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, queue } from "@/db/schema";
import { inArray, eq, and, or } from "drizzle-orm";
import { cancelPendingSchema } from "@/lib/validators";
import { validateAdminRole } from "@/lib/api-guard";
import { forceReleaseLock, deleteCached, deleteByPrefix, bumpEntityCacheVersion } from "@/lib/cache-service";
import { broadcastEngineState } from "@/lib/realtime-scan";

export async function POST(request: Request) {
  const authError = await validateAdminRole(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = cancelPendingSchema.parse(body);

    const isAll = validated.all === true;
    const requestedIds = validated.ids || [];

    if (!isAll && requestedIds.length === 0) {
      return NextResponse.json(
        { error: "Must provide either 'all: true' or an array of 'ids'." },
        { status: 400 }
      );
    }

    const isUuid = (str: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    let pagesToCancel: {
      id: string;
      displayName: string | null;
      currentResults: number | null;
      lastSuccessAt: Date | null;
      workspaceId: string | null;
    }[] = [];

    if (isAll) {
      pagesToCancel = await db.query.trackedPages.findMany({
        where: eq(trackedPages.status, "pending"),
        columns: {
          id: true,
          displayName: true,
          currentResults: true,
          lastSuccessAt: true,
          workspaceId: true,
        },
      });
    } else {
      const uuidIds = requestedIds.filter(isUuid);
      const nonUuidIds = requestedIds.filter((id) => !isUuid(id));

      pagesToCancel = await db.query.trackedPages.findMany({
        where: (p, { and, eq, or, inArray }) => {
          const idConditions = [];
          if (uuidIds.length > 0) idConditions.push(inArray(p.id, uuidIds));
          if (nonUuidIds.length > 0) idConditions.push(inArray(p.pageId, nonUuidIds));

          return and(
            eq(p.status, "pending"),
            idConditions.length > 1 ? or(...idConditions) : idConditions[0]
          );
        },
        columns: {
          id: true,
          displayName: true,
          currentResults: true,
          lastSuccessAt: true,
          workspaceId: true,
        },
      });
    }

    if (pagesToCancel.length === 0) {
      // Also clean up any orphaned queue jobs if 'all: true' was passed
      if (isAll) {
        await db
          .update(queue)
          .set({
            status: "failed",
            failureReason: "cancelled_manually",
            finishedAt: new Date(),
          })
          .where(inArray(queue.status, ["pending", "running"]));
      }

      return NextResponse.json({
        success: true,
        message: "No pending pages found to cancel.",
        cancelledCount: 0,
      });
    }

    const pageIds = pagesToCancel.map((p) => p.id);
    const now = new Date();

    // 1. Cancel pending/running queue jobs for these pages
    await db
      .update(queue)
      .set({
        status: "failed",
        failureReason: "cancelled_manually",
        finishedAt: now,
      })
      .where(and(inArray(queue.trackedPageId, pageIds), inArray(queue.status, ["pending", "running"])));

    // 2. Restore tracked pages back to 'success' (if verified results exist) or 'unclear'
    for (const page of pagesToCancel) {
      const targetStatus = page.lastSuccessAt !== null || page.currentResults !== null ? "success" : "unclear";

      await db
        .update(trackedPages)
        .set({
          status: targetStatus,
          updatedAt: now,
        })
        .where(eq(trackedPages.id, page.id));

      // Release distributed locks and cached progress
      await forceReleaseLock(`lock:scrape:${page.id}`).catch(() => {});
      await deleteCached(`scan_step:${page.id}`).catch(() => {});
    }

    // 3. Invalidate workspace and dashboard caches
    const workspaceIds = Array.from(new Set(pagesToCancel.map((p) => p.workspaceId).filter(Boolean))) as string[];
    for (const wId of workspaceIds) {
      await Promise.allSettled([
        bumpEntityCacheVersion(wId, "pages"),
        deleteByPrefix(`cache:pages:${wId}:`),
        deleteCached(`cache:stats:${wId}`),
      ]);
    }
    await deleteByPrefix("cache:dashboard:overview:").catch(() => {});

    // 4. Broadcast state update to active dashboards
    await broadcastEngineState({
      isPaused: false,
      circuitBreakerTripped: false,
      timestamp: Date.now(),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Successfully cancelled ${pagesToCancel.length} pending scan(s).`,
      cancelledCount: pagesToCancel.length,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: error.errors[0]?.message }, { status: 400 });
    }
    console.error("Error in POST /api/queue/cancel:", error);
    return NextResponse.json(
      { error: "Failed to cancel pending scans", details: error?.message },
      { status: 500 }
    );
  }
}
