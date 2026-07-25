import { NextResponse } from "next/server";
import { db } from "@/db";
import { queue } from "@/db/schema";
import { lt, eq, and } from "drizzle-orm";

export async function POST() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db
      .delete(queue)
      .where(
        and(
          eq(queue.status, "completed"),
          lt(queue.finishedAt!, thirtyDaysAgo)
        )
      )
      .returning({ id: queue.id });

    return NextResponse.json({
      success: true,
      pruned: result.length,
      message: `Pruned ${result.length} completed queue job(s) older than 30 days.`,
    });
  } catch (error) {
    console.error("Error in POST /api/queue/prune:", error);
    return NextResponse.json(
      { error: "Failed to prune queue" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const eligible = await db
      .select({ id: queue.id })
      .from(queue)
      .where(
        and(
          eq(queue.status, "completed"),
          lt(queue.finishedAt!, thirtyDaysAgo)
        )
      );

    return NextResponse.json({ eligible: eligible.length });
  } catch (error) {
    console.error("Error in GET /api/queue/prune:", error);
    return NextResponse.json(
      { error: "Failed to count prunable jobs" },
      { status: 500 }
    );
  }
}
