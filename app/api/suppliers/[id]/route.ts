import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeFacebookPageUrl } from "@/lib/supplier-scraper";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/suppliers/[id]
 * Updates supplier details or toggles status / unseen drop.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.facebookUrl !== undefined) updateData.facebookUrl = normalizeFacebookPageUrl(body.facebookUrl);
    if (body.phone !== undefined) updateData.phone = body.phone ? body.phone.trim() : null;
    if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp ? body.whatsapp.trim() : null;
    if (body.category !== undefined) updateData.category = body.category ? body.category.trim() : "general";
    if (body.notes !== undefined) updateData.notes = body.notes ? body.notes.trim() : null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.hasUnseenDrop !== undefined) updateData.hasUnseenDrop = Boolean(body.hasUnseenDrop);

    await db.update(suppliers).set(updateData).where(eq(suppliers.id, id));

    return NextResponse.json({ success: true, message: "Supplier updated successfully." });
  } catch (err: any) {
    console.error("[API Suppliers PATCH] Error:", err);
    return NextResponse.json({ error: "Failed to update supplier", message: err?.message }, { status: 500 });
  }
}

/**
 * DELETE /api/suppliers/[id]
 * Removes a supplier and cascades deletion to their photos.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.delete(suppliers).where(eq(suppliers.id, id));
    return NextResponse.json({ success: true, message: "Supplier deleted successfully." });
  } catch (err: any) {
    console.error("[API Suppliers DELETE] Error:", err);
    return NextResponse.json({ error: "Failed to delete supplier", message: err?.message }, { status: 500 });
  }
}

