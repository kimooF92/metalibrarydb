import { NextResponse } from "next/server";
import { db } from "@/db";
import { workerState } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  try {
    // Unpause worker state if paused, resetting consecutive failures
    await db
      .insert(workerState)
      .values({
        id: 1,
        isPaused: false,
        consecutiveFailures: 0,
      })
      .onConflictDoUpdate({
        target: workerState.id,
        set: {
          isPaused: false,
          consecutiveFailures: 0,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({
      success: true,
      message: "Large import processing confirmed. Worker started.",
    });
  } catch (error) {
    console.error("Error in POST /api/queue/confirm:", error);
    return NextResponse.json(
      { error: "Failed to confirm queue execution" },
      { status: 500 }
    );
  }
}
