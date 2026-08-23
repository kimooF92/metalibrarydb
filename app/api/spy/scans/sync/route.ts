import { NextRequest, NextResponse } from "next/server";
import { syncApifyRuns } from "@/lib/apify-sync";
import { validateApiSecret } from "@/lib/api-guard";

export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const result = await syncApifyRuns();
    return NextResponse.json({
      success: true,
      message: `Checked ${result.checkedCount} Apify scan(s), synced ${result.syncedCount} scan(s).`,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to sync Apify scans" },
      { status: 500 }
    );
  }
}
