import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredPages, trackedPages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const trackedPageId = searchParams.get("trackedPageId");

    if (!trackedPageId) {
      return NextResponse.json(
        { error: "trackedPageId is required" },
        { status: 400 }
      );
    }

    const trackedPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, trackedPageId),
    });

    if (!trackedPage) {
      return NextResponse.json(
        { error: "Tracked page not found" },
        { status: 404 }
      );
    }

    const candidates = await db.query.discoveredPages.findMany({
      where: eq(discoveredPages.trackedPageId, trackedPageId),
      orderBy: [desc(discoveredPages.matchingAdCount), desc(discoveredPages.createdAt)],
    });

    return NextResponse.json({
      success: true,
      trackedPage: {
        id: trackedPage.id,
        displayName: trackedPage.displayName,
        url: trackedPage.url,
        pageId: trackedPage.pageId,
        searchType: trackedPage.searchType,
        discoveredPagesCount: trackedPage.discoveredPagesCount || candidates.length,
      },
      candidates,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch candidate pages" },
      { status: 500 }
    );
  }
}
