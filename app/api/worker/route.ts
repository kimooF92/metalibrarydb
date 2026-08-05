import { NextResponse } from "next/server";
import { db } from "@/db";
import { workerState } from "@/db/schema";
import { eq } from "drizzle-orm";

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

    return NextResponse.json({
      state,
      isBackoffActive,
      maxHour,
      maxDay,
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
