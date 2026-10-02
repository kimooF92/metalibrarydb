import { NextResponse } from "next/server";
import { linkPageToDomain } from "@/lib/domain-portfolio";
import { db } from "@/db";
import { trackedPages } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { isValidPageId } from "@/lib/utils";
import { addSingleUrl } from "@/actions/add-url";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id: brandDomainId } = await params;
    const body = await req.json();
    const { trackedPageId, pageIdOrUrl, role = "satellite", forceReassign = false } = body;

    let targetTrackedPageId = trackedPageId;

    // If trackedPageId wasn't directly provided, try resolving from pageIdOrUrl
    if (!targetTrackedPageId && pageIdOrUrl) {
      const cleanInput = pageIdOrUrl.trim();

      // Check if it's already an existing tracked page by pageId or url
      const existing = await db.query.trackedPages.findFirst({
        where: or(
          eq(trackedPages.pageId, cleanInput),
          eq(trackedPages.url, cleanInput)
        ),
      });

      if (existing) {
        targetTrackedPageId = existing.id;
      } else {
        // Automatically add as a new tracked page
        let pageUrl = cleanInput;
        if (isValidPageId(cleanInput)) {
          pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${cleanInput}&search_type=page&media_type=all`;
        }

        const addResult = await addSingleUrl(pageUrl);

        if (!addResult.success || !addResult.page) {
          return NextResponse.json(
            { success: false, error: addResult.message || "Failed to add new page for linking" },
            { status: 400 }
          );
        }

        targetTrackedPageId = addResult.page.id;
      }
    }

    if (!targetTrackedPageId) {
      return NextResponse.json(
        { success: false, error: "trackedPageId or pageIdOrUrl is required" },
        { status: 400 }
      );
    }

    const result = await linkPageToDomain(
      targetTrackedPageId,
      brandDomainId,
      role,
      { forceReassign }
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, conflict: result.conflict },
        { status: result.conflict ? 409 : 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[POST /api/domains/[id]/link] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to link page to domain" },
      { status: 500 }
    );
  }
}
