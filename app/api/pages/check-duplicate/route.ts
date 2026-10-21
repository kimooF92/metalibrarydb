import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages } from "@/db/schema";
import { eq, or, and, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { extractUrlMetadata, normalizeAddUrlInput, parseTrackableUrl } from "@/lib/url-parser";

export const dynamic = "force-dynamic";

/**
 * GET /api/pages/check-duplicate
 * Lean duplicate detection endpoint.
 * Strictly projects only essential columns (id, displayName, url, currentResults, pageId, landingPage).
 * Zero heavy columns, LIMIT 1.
 */
export async function GET(request: Request) {
  const authError = await validateApiSecret(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url")?.trim() || "";
    const paramPageId = searchParams.get("pageId")?.trim() || "";
    const paramDomain = searchParams.get("domain")?.trim() || "";

    if (!rawUrl && !paramPageId && !paramDomain) {
      return NextResponse.json({ isDuplicate: false, page: null });
    }

    const activeWorkspace = await getActiveWorkspace(request);

    let parsedPageId = paramPageId;
    let targetDomain = paramDomain;
    let normalizedUrl: string | null = null;
    let displayNameCandidate: string | null = null;

    if (rawUrl) {
      normalizedUrl = normalizeAddUrlInput(rawUrl);
      const parsedTrackable = parseTrackableUrl(rawUrl);
      if (parsedTrackable) {
        if (!targetDomain && parsedTrackable.targetDomain) {
          targetDomain = parsedTrackable.targetDomain;
        }
      }

      if (normalizedUrl) {
        const meta = extractUrlMetadata(normalizedUrl);
        if (!parsedPageId && meta.pageId) {
          parsedPageId = meta.pageId;
        }
        if (meta.displayName) {
          displayNameCandidate = meta.displayName.trim().toLowerCase();
        }
      }
    }

    const conditions = [];

    if (normalizedUrl) {
      conditions.push(eq(trackedPages.url, normalizedUrl));
    }
    if (rawUrl && rawUrl !== normalizedUrl) {
      conditions.push(eq(trackedPages.url, rawUrl));
    }
    if (parsedPageId) {
      conditions.push(eq(trackedPages.pageId, parsedPageId));
    }
    if (targetDomain) {
      const cleanDomain = targetDomain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      conditions.push(sql`lower(${trackedPages.landingPage}) = ${cleanDomain}`);
      conditions.push(sql`lower(trim(${trackedPages.displayName})) = ${cleanDomain}`);
    }
    if (displayNameCandidate) {
      conditions.push(sql`lower(trim(${trackedPages.displayName})) = ${displayNameCandidate}`);
    }

    if (conditions.length === 0) {
      return NextResponse.json({ isDuplicate: false, page: null });
    }

    const [existing] = await db
      .select({
        id: trackedPages.id,
        displayName: trackedPages.displayName,
        url: trackedPages.url,
        currentResults: trackedPages.currentResults,
        pageId: trackedPages.pageId,
        landingPage: trackedPages.landingPage,
        status: trackedPages.status,
      })
      .from(trackedPages)
      .where(
        and(
          eq(trackedPages.workspaceId, activeWorkspace.id),
          or(...conditions)
        )
      )
      .limit(1);

    return NextResponse.json({
      isDuplicate: Boolean(existing),
      page: existing || null,
    });
  } catch (error: any) {
    console.error("Error in GET /api/pages/check-duplicate:", error);
    return NextResponse.json(
      { error: "Failed to check for duplicate page" },
      { status: 500 }
    );
  }
}
