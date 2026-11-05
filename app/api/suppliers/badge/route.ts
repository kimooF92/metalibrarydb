import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers/badge
 * Returns count of suppliers with unseen product drops for the active workspace.
 */
export async function GET(req: NextRequest) {
  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const conditions: any[] = [eq(suppliers.hasUnseenDrop, true)];

    if (activeWorkspace?.id) {
      conditions.push(eq(suppliers.workspaceId, activeWorkspace.id));
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(suppliers)
      .where(and(...conditions));

    return NextResponse.json({
      success: true,
      count: Number(result?.count || 0),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, count: 0 }, { status: 500 });
  }
}

