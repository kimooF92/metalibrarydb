import { NextResponse } from "next/server";
import { db } from "@/db";
import { workerState, creativeScans, trackedPages } from "@/db/schema";
import { eq, desc, and, lt, gte } from "drizzle-orm";

import { cleanOrphanedScans } from "@/lib/clean-scans";

async function getOrCreateWorkerState() {
  let state = await db.query.workerState.findFirst({
    where: eq(workerState.id, 1),
  });

  if (!state) {
    const [inserted] = await db
      .insert(workerState)
      .values({ id: 1, isPaused: false })
      .returning();
    state = inserted;
  }

  return state;
}

export async function GET() {
  try {
    const state = await getOrCreateWorkerState();

    const isBackoffActive =
      state.backoffUntil !== null && new Date(state.backoffUntil) > new Date();

    const maxHour = parseInt(process.env.MAX_SCANS_PER_HOUR || "100", 10);
    const maxDay = parseInt(process.env.MAX_SCANS_PER_DAY || "0", 10);

    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Auto-expire any orphaned scans, queue jobs, or stuck scanning pages older than 10 minutes
    await cleanOrphanedScans(10).catch(() => {});

    // Only query active scans started within the last 15 minutes
    const activeScans = await db
      .select({
        id: creativeScans.id,
        trackedPageId: creativeScans.trackedPageId,
        brandName: trackedPages.displayName,
        url: trackedPages.url,
        startedAt: creativeScans.startedAt,
        outcomeDetails: creativeScans.outcomeDetails,
      })
      .from(creativeScans)
      .leftJoin(trackedPages, eq(creativeScans.trackedPageId, trackedPages.id))
      .where(and(eq(creativeScans.status, "running"), gte(creativeScans.startedAt, fifteenMinsAgo)))
      .orderBy(desc(creativeScans.startedAt))
      .limit(5);

    return NextResponse.json({
      state,
      isBackoffActive,
      maxHour,
      maxDay,
      activeScans,
    });
  } catch (error) {
    console.error("Error in GET /api/worker:", error);
    return NextResponse.json(
      { error: "Failed to fetch worker state" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const currentState = await getOrCreateWorkerState();

    if (body.resetLimits === true) {
      const now = new Date();
      const [updated] = await db
        .update(workerState)
        .set({
          scansThisHour: 0,
          scansToday: 0,
          hourWindowStart: now,
          dayWindowStart: now,
          consecutiveFailures: 0,
          backoffUntil: null,
          updatedAt: now,
        })
        .where(eq(workerState.id, 1))
        .returning();

      return NextResponse.json({
        success: true,
        message: "Worker rate limits reset successfully.",
        state: updated,
      });
    }

    // Toggle if pause boolean provided, or flip current state
    const targetPaused =
      typeof body.pause === "boolean" ? body.pause : !currentState.isPaused;

    const [updated] = await db
      .update(workerState)
      .set({
        isPaused: targetPaused,
        updatedAt: new Date(),
      })
      .where(eq(workerState.id, 1))
      .returning();

    return NextResponse.json({
      success: true,
      message: `Worker manually ${targetPaused ? "paused" : "resumed"}.`,
      state: updated,
    });
  } catch (error) {
    console.error("Error in POST /api/worker:", error);
    return NextResponse.json(
      { error: "Failed to toggle worker state" },
      { status: 500 }
    );
  }
}
