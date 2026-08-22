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

    const isNumericString = (str?: string | null) => Boolean(str && /^\d{6,25}$/.test(str.trim()));

    const brands = pages.map((p) => {
      const validPageId = isNumericString(p.pageId) ? p.pageId! : "";
      const validDisplayName =
        p.displayName && !p.displayName.startsWith("http")
          ? p.displayName
          : validPageId
          ? `Page ${validPageId}`
          : "Unnamed Brand";

      return {
        id: p.id,
        pageId: validPageId || p.id,
        displayName: validDisplayName,
        adCount: p.adCount || 0,
        isWatchlisted: Boolean(p.isWatchlisted),
      };
    });

    return NextResponse.json({ brands });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch brands" },
      { status: 500 }
    );
  }
}
