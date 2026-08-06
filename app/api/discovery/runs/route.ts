import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveryRuns } from "@/db/schema";
import { desc } from "drizzle-orm";
import { triggerGitHubWorkflow } from "@/lib/github";

export async function GET() {
  try {
    const runs = await db.query.discoveryRuns.findMany({
      orderBy: [desc(discoveryRuns.createdAt)],
      limit: 20,
    });
    return NextResponse.json({ success: true, runs });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch discovery runs" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const country = (body.country || "TN").toUpperCase().trim();
    const query = body.query || "\u200D";
    const mediaType = body.mediaType || "video";

    // Date Range calculation: Default to Last 7 Days
    const today = new Date();
    const defaultMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const minDateStr = body.startDateMin || defaultMin.toISOString().split("T")[0];
    const maxDateStr = body.startDateMax || today.toISOString().split("T")[0];

    const startDateMin = new Date(minDateStr);
    const startDateMax = new Date(maxDateStr);

    // Build canonical Meta Ad Library country search URL
    const searchUrl =
      `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&content_languages[0]=ar&country=${country}&is_targeted_country=false&media_type=${mediaType}&publisher_platforms[0]=facebook&publisher_platforms[1]=instagram&q=${encodeURIComponent(
        query
      )}&search_type=keyword_unordered&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc&start_date[min]=${minDateStr}&start_date[max]=${maxDateStr}`;

    const [newRun] = await db
      .insert(discoveryRuns)
      .values({
        country,
        searchUrl,
        query,
        startDateMin,
        startDateMax,
        status: "pending",
        totalAdsScanned: 0,
        totalPagesDiscovered: 0,
      })
      .returning();

    // Trigger GitHub Action worker if configured
    await triggerGitHubWorkflow("discovery-worker.yml", { country }).catch(() => {});

    return NextResponse.json({
      success: true,
      runId: newRun.id,
      run: newRun,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create discovery run" },
      { status: 500 }
    );
  }
}

