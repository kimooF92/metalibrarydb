import { NextResponse } from "next/server";
import { getDomainPortfolio } from "@/lib/domain-portfolio";
import { db } from "@/db";
import { brandDomains } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Domain ID is required" }, { status: 400 });
    }

    const portfolio = await getDomainPortfolio(id);
    if (!portfolio) {
      return NextResponse.json({ success: false, error: "Domain portfolio not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, portfolio });
  } catch (err: any) {
    console.error("[GET /api/domains/[id]] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch domain portfolio" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await req.json();
    const { displayName, category, storePlatform, notes, isWatchlisted } = body;

    const updatePayload: Record<string, any> = { updatedAt: new Date() };
    if (displayName !== undefined) updatePayload.displayName = displayName.trim();
    if (category !== undefined) updatePayload.category = category?.trim() || null;
    if (storePlatform !== undefined) updatePayload.storePlatform = storePlatform?.trim() || null;
    if (notes !== undefined) updatePayload.notes = notes?.trim() || null;
    if (isWatchlisted !== undefined) updatePayload.isWatchlisted = Boolean(isWatchlisted);

    const [updated] = await db
      .update(brandDomains)
      .set(updatePayload)
      .where(eq(brandDomains.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ success: false, error: "Domain not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, domain: updated });
  } catch (err: any) {
    console.error("[PATCH /api/domains/[id]] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update domain" },
      { status: 500 }
    );
  }
}
