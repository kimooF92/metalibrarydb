import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(trackedPages)
      .where(eq(trackedPages.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Tracked page not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Tracked page deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("Error in DELETE /api/page/[id]:", error);
    return NextResponse.json(
      { error: "Failed to delete tracked page" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { displayName } = body;

    if (!id) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(trackedPages)
      .set({
        displayName: displayName?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(trackedPages.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Tracked page not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Display name updated successfully",
      page: updated,
    });
  } catch (error) {
    console.error("Error in PATCH /api/page/[id]:", error);
    return NextResponse.json(
      { error: "Failed to update display name" },
      { status: 500 }
    );
  }
}
