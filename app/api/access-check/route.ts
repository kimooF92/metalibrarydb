import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  // Return a representative URL from DB (first completed page) for access check
  const sample = await db.query.trackedPages.findFirst({
    where: sql`${trackedPages.status} = 'success' AND ${trackedPages.url} IS NOT NULL`,
  });

  return NextResponse.json({
    sampleUrl: sample?.url ?? null,
    message: sample
      ? "Use this URL to verify Meta Ad Library access before starting a scan session."
      : "No completed scans to use as reference URL.",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const url: string =
      body.url ||
      "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=test&search_type=keyword_exact_phrase";

    // We can't run Playwright from a Next.js serverless route,
    // so this endpoint returns instructions to run locally via the worker script.
    return NextResponse.json({
      status: "info",
      message: "Access check must be run locally via the worker script.",
      command: `npx tsx worker/check-access.ts --url "${url}"`,
      instructions: [
        "1. Open a terminal in the project directory.",
        "2. Run: npx tsx scripts/check-access.ts",
        "3. The script will navigate to Meta Ad Library and report: Working / CAPTCHA / Blocked.",
      ],
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process access check request" }, { status: 500 });
  }
}
