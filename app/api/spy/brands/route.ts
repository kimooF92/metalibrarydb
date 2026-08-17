import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages } from "@/db/schema";
import { asc, desc, isNotNull, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export async function GET(req: Request) {
  const authError = validateApiSecret(req);
  if (authError) return authError;

  try {
    const pages = await db
      .select({
        id: trackedPages.id,
        pageId: trackedPages.pageId,
        displayName: trackedPages.displayName,
        adCount: trackedPages.currentResults,
        isWatchlisted: trackedPages.isWatchlisted,
      })
      .from(trackedPages)
      .where(isNotNull(trackedPages.pageId))
      .orderBy(asc(trackedPages.displayName));

    const brands = pages.map((p) => ({
      id: p.id,
      pageId: p.pageId || p.id,
      displayName: p.displayName || `Page (${p.pageId})`,
      adCount: p.adCount || 0,
      isWatchlisted: Boolean(p.isWatchlisted),
    }));

    return NextResponse.json({ brands });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch brands" },
      { status: 500 }
    );
  }
}
