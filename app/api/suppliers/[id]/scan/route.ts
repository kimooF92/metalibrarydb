import { NextRequest, NextResponse } from "next/server";
import { scanSupplierNow } from "@/lib/supplier-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s max execution limit on Vercel Serverless

/**
 * POST /api/suppliers/[id]/scan
 * Triggers an immediate watchdog and photo scrape for the specified supplier.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await scanSupplierNow(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Scrape failed", success: false },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      newPhotosCount: result.newPhotosCount,
      albumDetected: result.albumDetected,
      message:
        result.newPhotosCount > 0
          ? `Ingested ${result.newPhotosCount} new photos!`
          : "Checked page. No new posts or albums found.",
    });
  } catch (err: any) {
    console.error("[API Suppliers SCAN] Error:", err);
    return NextResponse.json({ error: "Failed to scan supplier", message: err?.message }, { status: 500 });
  }
}

