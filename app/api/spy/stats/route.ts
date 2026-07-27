import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations } from "@/db/schema";
import { sql, gte, eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const authError = validateApiSecret(req);
  if (authError) return authError;

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 1. Total Ads Captured (distinct observed ads)
    const [totalRes] = await db
      .select({ count: sql<number>`count(distinct ${adObservations.adId})` })
      .from(adObservations);
    const totalAdsCaptured = Number(totalRes?.count || 0);

    // 2. Launched in Last 7 Days
    const [recentRes] = await db
      .select({ count: sql<number>`count(distinct ${ads.id})` })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(gte(ads.startedRunningOn, sevenDaysAgo));
    const launchedLast7Days = Number(recentRes?.count || 0);

    // 3. Scaled Ads Count (duplication_count >= 5)
    const [scaledRes] = await db
      .select({ count: sql<number>`count(distinct ${adObservations.adId})` })
      .from(adObservations)
      .where(gte(adObservations.duplicationCount, 5));
    const scaledAdsCount = Number(scaledRes?.count || 0);

    // 4. Media type distribution (for observed ads)
    const mediaRows = await db
      .select({
        mediaType: ads.mediaType,
        count: sql<number>`count(distinct ${ads.id})`,
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .groupBy(ads.mediaType);

    const mediaDistribution = {
      image: 0,
      video: 0,
      carousel: 0,
      other: 0,
    };

    for (const row of mediaRows) {
      const type = row.mediaType as keyof typeof mediaDistribution;
      const count = Number(row.count || 0);
      if (type === "image" || type === "video" || type === "carousel") {
        mediaDistribution[type] = count;
      } else {
        mediaDistribution.other += count;
      }
    }

    return NextResponse.json({
      totalAdsCaptured,
      launchedLast7Days,
      scaledAdsCount,
      mediaDistribution,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch ad spy stats" },
      { status: 500 }
    );
  }
}
