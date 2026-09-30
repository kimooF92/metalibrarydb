import { NextResponse } from "next/server";
import { getApifyAccountBalance } from "@/lib/apify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";
    const balance = await getApifyAccountBalance({ forceRefresh: force });
    if (!balance) {
      return NextResponse.json(
        { error: "Apify credentials not configured or API error" },
        { status: 503 }
      );
    }
    return NextResponse.json(balance);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
