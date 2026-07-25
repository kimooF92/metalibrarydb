import { NextResponse } from "next/server";
import { db } from "@/db";
import { scanHistory, trackedPages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 });
    }

    // Verify tracked page exists
    const page = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, id),
    });

    if (!page) {
      return NextResponse.json({ error: "Tracked page not found" }, { status: 404 });
    }

    const history = await db.query.scanHistory.findMany({
      where: eq(scanHistory.trackedPageId, id),
      orderBy: [desc(scanHistory.checkedAt)],
      limit: 100,
    });

    return NextResponse.json({
      page,
      history,
    });
  } catch (error) {
    console.error("Error in GET /api/history/[id]:", error);
    return NextResponse.json(
      { error: "Failed to fetch scan history" },
      { status: 500 }
    );
  }
}
