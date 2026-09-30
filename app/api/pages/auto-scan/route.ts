import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export async function POST(req: Request) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { pageIds, autoCreativeScan } = body;

    if (!Array.isArray(pageIds) || pageIds.length === 0) {
      return NextResponse.json(
        { error: "pageIds array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (typeof autoCreativeScan !== "boolean") {
      return NextResponse.json(
        { error: "autoCreativeScan boolean is required" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(trackedPages)
      .set({
        autoCreativeScan,
        updatedAt: new Date(),
      })
      .where(inArray(trackedPages.id, pageIds))
      .returning({ id: trackedPages.id, autoCreativeScan: trackedPages.autoCreativeScan });

    return NextResponse.json({
      success: true,
      updatedCount: updated.length,
      autoCreativeScan,
      pageIds: updated.map((p) => p.id),
    });
  } catch (error: any) {
    console.error("Error in POST /api/pages/auto-scan:", error);
    return NextResponse.json(
      { error: "Failed to update auto scan status", details: error?.message },
      { status: 500 }
    );
  }
}
