import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces, trackedPages, scrapedProducts } from "@/db/schema";
import { eq, desc, asc, sql, not, and } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/workspaces - Lists all workspaces with page & product counts
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const active = await getActiveWorkspace(req);

    // Fetch workspaces with aggregated counts
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        countryCode: workspaces.countryCode,
        currency: workspaces.currency,
        currencySymbol: workspaces.currencySymbol,
        flag: workspaces.flag,
        isDefault: workspaces.isDefault,
        description: workspaces.description,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
        pageCount: sql<number>`cast(count(distinct ${trackedPages.id}) as integer)`,
        productCount: sql<number>`cast(count(distinct ${scrapedProducts.id}) as integer)`,
      })
      .from(workspaces)
      .leftJoin(trackedPages, eq(trackedPages.workspaceId, workspaces.id))
      .leftJoin(scrapedProducts, eq(scrapedProducts.workspaceId, workspaces.id))
      .groupBy(workspaces.id)
      .orderBy(desc(workspaces.isDefault), asc(workspaces.name));

    return NextResponse.json({
      workspaces: rows,
      activeWorkspace: active,
    });
  } catch (error: any) {
    console.error("[GET /api/workspaces] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspaces", details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/workspaces - Create a new market workspace
export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const name = body.name?.trim();

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "Workspace name must be at least 2 characters." },
        { status: 400 }
      );
    }

    const countryCode = (body.countryCode?.trim() || "TN").toUpperCase();
    const currency = (body.currency?.trim() || "TND").toUpperCase();
    const currencySymbol = body.currencySymbol?.trim() || "DT";
    const flag = body.flag?.trim() || "🌐";
    const description = body.description?.trim() || null;

    // Generate base slug
    let baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!baseSlug) baseSlug = `workspace-${countryCode.toLowerCase()}`;

    // Ensure unique slug
    let slug = baseSlug;
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    const [created] = await db
      .insert(workspaces)
      .values({
        name,
        slug,
        countryCode,
        currency,
        currencySymbol,
        flag,
        isDefault: false,
        description,
      })
      .returning();

    return NextResponse.json({
      success: true,
      workspace: created,
    });
  } catch (error: any) {
    console.error("[POST /api/workspaces] Error:", error);
    return NextResponse.json(
      { error: "Failed to create workspace", details: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/workspaces - Update an existing workspace
export async function PATCH(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const id = body.id?.trim();

    if (!id) {
      return NextResponse.json(
        { error: "Workspace ID is required for update." },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (body.name?.trim()) updateData.name = body.name.trim();
    if (body.countryCode?.trim()) updateData.countryCode = body.countryCode.trim().toUpperCase();
    if (body.currency?.trim()) updateData.currency = body.currency.trim().toUpperCase();
    if (body.currencySymbol?.trim()) updateData.currencySymbol = body.currencySymbol.trim();
    if (body.flag?.trim()) updateData.flag = body.flag.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;

    if (body.isDefault === true) {
      // Unset previous default
      await db.update(workspaces).set({ isDefault: false });
      updateData.isDefault = true;
    }

    const [updated] = await db
      .update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      workspace: updated,
    });
  } catch (error: any) {
    console.error("[PATCH /api/workspaces] Error:", error);
    return NextResponse.json(
      { error: "Failed to update workspace", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces - Delete a workspace
export async function DELETE(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json({ error: "Workspace ID required." }, { status: 400 });
    }

    const [target] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    if (target.isDefault) {
      return NextResponse.json(
        { error: "Cannot delete the default workspace. Assign a different default workspace first." },
        { status: 400 }
      );
    }

    await db.delete(workspaces).where(eq(workspaces.id, id));

    return NextResponse.json({
      success: true,
      message: `Workspace '${target.name}' deleted.`,
    });
  } catch (error: any) {
    console.error("[DELETE /api/workspaces] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete workspace", details: error.message },
      { status: 500 }
    );
  }
}
