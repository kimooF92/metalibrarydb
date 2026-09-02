import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { PRIVATE_AUTH_VARY, PRIVATE_DETAIL_CACHE_CONTROL } from "@/lib/http-cache";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await req.json();
    const { isArchived } = body;

    if (typeof isArchived !== "boolean") {
      return NextResponse.json(
        { error: "isArchived boolean field is required" },
        { status: 400 }
      );
    }

    const existingAd = await db.query.ads.findFirst({
      where: eq(ads.id, id),
    });

    if (!existingAd) {
      return NextResponse.json({ error: "Ad creative not found" }, { status: 404 });
    }

    const now = new Date();
    const [updated] = await db
      .update(ads)
      .set({
        isArchived,
        archivedAt: isArchived ? now : null,
        updatedAt: now,
      })
      .where(eq(ads.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      ad: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update ad archive status" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const [ad] = await db
      .select({
        id: ads.id,
        mediaType: ads.mediaType,
        mediaUrls: ads.mediaUrls,
        thumbnailUrl: ads.thumbnailUrl,
        thumbnailStoragePath: ads.thumbnailStoragePath,
        storyboardUrls: ads.storyboardUrls,
      })
      .from(ads)
      .where(eq(ads.id, id))
      .limit(1);

    if (!ad) return NextResponse.json({ error: "Ad creative not found" }, { status: 404 });

    return NextResponse.json(
      { success: true, ad },
      { headers: { "Cache-Control": PRIVATE_DETAIL_CACHE_CONTROL, Vary: PRIVATE_AUTH_VARY } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load ad media" },
      { status: 500 }
    );
  }
}
