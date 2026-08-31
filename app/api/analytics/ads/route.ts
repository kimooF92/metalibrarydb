import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages } from "@/db/schema";
import { sql, desc, count, and, eq, or, gte, isNull, inArray } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const range = req.nextUrl.searchParams.get("range") ?? "7d";
    const rangeDays = ({ today: 1, "7d": 7, "15d": 15, "30d": 30 } as Record<string, number>)[range] ?? 7;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - rangeDays);
    const observationWindow = gte(adObservations.observedAt, windowStart);

    // 1. Safe Date Expression for Longevity (Fallback to firstSeenAt or createdAt if startedRunningOn is missing)
    const dateExpr = sql`COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}, ${ads.createdAt})`;
    const ageDaysExpr = sql`GREATEST(0, EXTRACT(DAY FROM NOW() - ${dateExpr}))`;

    // 2. Summary KPIs across all distinct ads
    const [summaryRes] = await db
      .select({
        totalAds: count(),
        activeAds: sql<number>`COUNT(CASE WHEN ${adObservations.isActive} = true AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL) THEN 1 END)`.mapWith(Number),
        videoAds: sql<number>`COUNT(CASE WHEN ${ads.mediaType} = 'video' THEN 1 END)`.mapWith(Number),
        imageAds: sql<number>`COUNT(CASE WHEN ${ads.mediaType} = 'image' THEN 1 END)`.mapWith(Number),
        carouselAds: sql<number>`COUNT(CASE WHEN ${ads.mediaType} = 'carousel' THEN 1 END)`.mapWith(Number),
        scaledAdsCount: sql<number>`COUNT(CASE WHEN ${adObservations.duplicationCount} >= 5 THEN 1 END)`.mapWith(Number),
        breakoutAdsCount: sql<number>`COUNT(CASE WHEN ${dateExpr} >= ${windowStart} AND ${adObservations.duplicationCount} >= 3 THEN 1 END)`.mapWith(Number),
        avgDuplication: sql<number>`ROUND(AVG(${adObservations.duplicationCount}), 1)`.mapWith(Number),
        maxDuplication: sql<number>`MAX(${adObservations.duplicationCount})`.mapWith(Number),
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(observationWindow);

    const totalAdsCount = Math.max(1, Number(summaryRes?.totalAds || 0));

    // 3. Longevity & Survival Cohorts (Testing -> Validation -> Scaling -> Winner -> Evergreen)
    const cohortRows = await db
      .select({
        cohortKey: sql<string>`
          CASE
            WHEN ${dateExpr} IS NULL THEN 'unknown'
            WHEN ${ageDaysExpr} <= 3 THEN 'testing_0_3d'
            WHEN ${ageDaysExpr} <= 7 THEN 'validation_4_7d'
            WHEN ${ageDaysExpr} <= 14 THEN 'scaling_8_14d'
            WHEN ${ageDaysExpr} <= 30 THEN 'winner_15_30d'
            ELSE 'evergreen_30d_plus'
          END
        `,
        cohortLabel: sql<string>`
          CASE
            WHEN ${dateExpr} IS NULL THEN 'Unknown Launch Date'
            WHEN ${ageDaysExpr} <= 3 THEN 'Testing Phase (0 - 3 Days)'
            WHEN ${ageDaysExpr} <= 7 THEN 'Validation Phase (4 - 7 Days)'
            WHEN ${ageDaysExpr} <= 14 THEN 'Scaling Phase (8 - 14 Days)'
            WHEN ${ageDaysExpr} <= 30 THEN 'Proven Winner (15 - 30 Days)'
            ELSE 'Evergreen Cash-Cow (30+ Days)'
          END
        `,
        cohortOrder: sql<number>`
          CASE
            WHEN ${dateExpr} IS NULL THEN 6
            WHEN ${ageDaysExpr} <= 3 THEN 1
            WHEN ${ageDaysExpr} <= 7 THEN 2
            WHEN ${ageDaysExpr} <= 14 THEN 3
            WHEN ${ageDaysExpr} <= 30 THEN 4
            ELSE 5
          END
        `,
        count: count(),
        activeCount: sql<number>`COUNT(CASE WHEN ${adObservations.isActive} = true AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL) THEN 1 END)`.mapWith(Number),
        avgDuplication: sql<number>`ROUND(AVG(${adObservations.duplicationCount}), 1)`.mapWith(Number),
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(observationWindow)
      .groupBy(sql`1`, sql`2`, sql`3`)
      .orderBy(sql`3`);

    // 4. Creative Format & Scaling Efficiency
    const formatRows = await db
      .select({
        mediaType: sql<string>`COALESCE(${ads.mediaType}, 'unknown')`,
        count: count(),
        activeCount: sql<number>`COUNT(CASE WHEN ${adObservations.isActive} = true AND (${ads.isArchived} = false OR ${ads.isArchived} IS NULL) THEN 1 END)`.mapWith(Number),
        avgDuplication: sql<number>`ROUND(AVG(${adObservations.duplicationCount}), 1)`.mapWith(Number),
        maxDuplication: sql<number>`MAX(${adObservations.duplicationCount})`.mapWith(Number),
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(observationWindow)
      .groupBy(sql`COALESCE(${ads.mediaType}, 'unknown')`)
      .orderBy(desc(count()));

    // 5. CTA Conversion Psychology (All vs High Scaled >= 5 copies)
    const allCtaRows = await db
      .select({
        ctaText: sql<string>`COALESCE(NULLIF(TRIM(${ads.ctaText}), ''), 'No CTA Button')`,
        count: count(),
        avgDuplication: sql<number>`ROUND(AVG(${adObservations.duplicationCount}), 1)`.mapWith(Number),
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(observationWindow)
      .groupBy(sql`1`)
      .orderBy(desc(count()))
      .limit(10);

    const scaledCtaRows = await db
      .select({
        ctaText: sql<string>`COALESCE(NULLIF(TRIM(${ads.ctaText}), ''), 'No CTA Button')`,
        count: count(),
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(and(observationWindow, gte(adObservations.duplicationCount, 5)))
      .groupBy(sql`1`)
      .orderBy(desc(count()))
      .limit(10);

    const totalScaledAds = scaledCtaRows.reduce((sum, r) => sum + Number(r.count || 0), 0) || 1;

    // 6. Copywriting, Hook & Angle Analysis
    const copyLengthRows = await db
      .select({
        tier: sql<string>`
          CASE
            WHEN ${ads.caption} IS NULL OR length(${ads.caption}) < 20 THEN 'Minimal / No Text'
            WHEN length(${ads.caption}) < 100 THEN 'Short Hook (< 100 chars)'
            WHEN length(${ads.caption}) <= 300 THEN 'Medium Pitch (100 - 300 chars)'
            ELSE 'Long-Form Storytelling (> 300 chars)'
          END
        `,
        tierKey: sql<string>`
          CASE
            WHEN ${ads.caption} IS NULL OR length(${ads.caption}) < 20 THEN 'minimal'
            WHEN length(${ads.caption}) < 100 THEN 'short'
            WHEN length(${ads.caption}) <= 300 THEN 'medium'
            ELSE 'long'
          END
        `,
        count: count(),
        avgDuplication: sql<number>`ROUND(AVG(${adObservations.duplicationCount}), 1)`.mapWith(Number),
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(observationWindow)
      .groupBy(sql`1`, sql`2`)
      .orderBy(desc(count()));

    // Triggers detection in Ad Copies (Arabic / French triggers)
    const [triggerStats] = await db
      .select({
        discountTriggers: sql<number>`
          COUNT(CASE WHEN ${ads.caption} ~* '(%|remise|تخفيض|solde|promo|خصم|تخفيضات|offert)' THEN 1 END)
        `.mapWith(Number),
        urgencyTriggers: sql<number>`
          COUNT(CASE WHEN ${ads.caption} ~* '(gratuit|livraison gratuite|كمية محدودة|عرض خاص|dernière chance|urgent|مجانا|توصيل مجاني)' THEN 1 END)
        `.mapWith(Number),
        hasArabic: sql<number>`
          COUNT(CASE WHEN ${ads.caption} ~* '[\u0600-\u06FF]' THEN 1 END)
        `.mapWith(Number),
        hasFrench: sql<number>`
          COUNT(CASE WHEN ${ads.caption} ~* '(livraison|commande|prix|qualité|gratuit|boutique|disponible|tunisie)' THEN 1 END)
        `.mapWith(Number),
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(observationWindow);

    // 7. Duplication / Scale Tiers Distribution
    const duplicationTierRows = await db
      .select({
        tier: sql<string>`
          CASE
            WHEN ${adObservations.duplicationCount} = 1 THEN 'Single Ad (1 copy)'
            WHEN ${adObservations.duplicationCount} <= 4 THEN 'Light Scale (2 - 4 copies)'
            WHEN ${adObservations.duplicationCount} <= 9 THEN 'Medium Scale (5 - 9 copies)'
            WHEN ${adObservations.duplicationCount} <= 19 THEN 'Aggressive Scale (10 - 19 copies)'
            ELSE 'Mega Scale (20+ copies)'
          END
        `,
        tierKey: sql<string>`
          CASE
            WHEN ${adObservations.duplicationCount} = 1 THEN 'single'
            WHEN ${adObservations.duplicationCount} <= 4 THEN 'light'
            WHEN ${adObservations.duplicationCount} <= 9 THEN 'medium'
            WHEN ${adObservations.duplicationCount} <= 19 THEN 'aggressive'
            ELSE 'mega'
          END
        `,
        count: count(),
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(observationWindow)
      .groupBy(sql`1`, sql`2`)
      .orderBy(desc(count()));

    // 8. Top 10 Breakout Scalers Leaderboard (Launched in the selected window + High Duplication >= 3)
    const breakoutAds = await db
      .select({
        id: ads.id,
        adArchiveId: ads.adArchiveId,
        pageName: ads.pageName,
        pageId: ads.pageId,
        startedRunningOn: ads.startedRunningOn,
        firstSeenAt: ads.firstSeenAt,
        caption: ads.caption,
        title: ads.title,
        ctaText: ads.ctaText,
        linkUrl: ads.linkUrl,
        mediaType: ads.mediaType,
        thumbnailUrl: ads.thumbnailUrl,
        thumbnailStoragePath: ads.thumbnailStoragePath,
        duplicationCount: adObservations.duplicationCount,
        isActive: adObservations.isActive,
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(
        and(
          observationWindow,
          gte(dateExpr, windowStart),
          gte(adObservations.duplicationCount, 3),
          eq(adObservations.isActive, true)
        )
      )
      .orderBy(desc(adObservations.duplicationCount), desc(ads.startedRunningOn))
      .limit(10);

    const enrichedBreakoutAds = breakoutAds.map((a) => {
      const launch = a.startedRunningOn || a.firstSeenAt;
      const daysRunning = launch
        ? Math.max(0, Math.round((Date.now() - new Date(launch).getTime()) / 86400000))
        : 0;

      return {
        ...a,
        daysRunning,
      };
    });

    // 9. Top 10 Advertising Brands by Creative Volume
    const topAdvertisers = await db
      .select({
        pageName: sql<string>`COALESCE(NULLIF(${ads.pageName}, ''), ${trackedPages.displayName}, ${ads.pageId})`,
        pageId: ads.pageId,
        adCount: count(),
        videoCount: sql<number>`COUNT(CASE WHEN ${ads.mediaType} = 'video' THEN 1 END)`.mapWith(Number),
        avgDuplication: sql<number>`ROUND(AVG(${adObservations.duplicationCount}), 1)`.mapWith(Number),
        maxDuplication: sql<number>`MAX(${adObservations.duplicationCount})`.mapWith(Number),
      })
      .from(ads)
      .innerJoin(adObservations, eq(ads.id, adObservations.adId))
      .leftJoin(trackedPages, eq(adObservations.trackedPageId, trackedPages.id))
      .where(observationWindow)
      .groupBy(sql`1`, ads.pageId)
      .orderBy(desc(count()))
      .limit(10);

    return NextResponse.json(
      {
        summary: {
          totalAds: Number(summaryRes?.totalAds || 0),
          activeAds: Number(summaryRes?.activeAds || 0),
          videoAds: Number(summaryRes?.videoAds || 0),
          imageAds: Number(summaryRes?.imageAds || 0),
          carouselAds: Number(summaryRes?.carouselAds || 0),
          scaledAdsCount: Number(summaryRes?.scaledAdsCount || 0),
          breakoutAdsCount: Number(summaryRes?.breakoutAdsCount || 0),
          avgDuplication: Number(summaryRes?.avgDuplication || 1),
          maxDuplication: Number(summaryRes?.maxDuplication || 1),
          videoSharePct: totalAdsCount > 0 ? Math.round((Number(summaryRes?.videoAds || 0) / totalAdsCount) * 100) : 0,
        },
        longevityCohorts: cohortRows.map((c) => {
          const totalInCohort = Number(c.count || 0);
          const activeInCohort = Number(c.activeCount || 0);
          const survivalRate = totalInCohort > 0 ? Math.round((activeInCohort / totalInCohort) * 100) : 0;

          return {
            key: c.cohortKey,
            label: c.cohortLabel,
            order: Number(c.cohortOrder || 1),
            count: totalInCohort,
            activeCount: activeInCohort,
            survivalRate,
            avgDuplication: Number(c.avgDuplication || 1),
          };
        }),
        formatEfficiency: formatRows.map((f) => ({
          mediaType: f.mediaType,
          count: Number(f.count || 0),
          activeCount: Number(f.activeCount || 0),
          avgDuplication: Number(f.avgDuplication || 1),
          maxDuplication: Number(f.maxDuplication || 1),
          sharePct: totalAdsCount > 0 ? Math.round((Number(f.count || 0) / totalAdsCount) * 100) : 0,
        })),
        ctaPsychology: {
          allCtas: allCtaRows.map((cta) => ({
            name: cta.ctaText,
            count: Number(cta.count || 0),
            avgDuplication: Number(cta.avgDuplication || 1),
            sharePct: totalAdsCount > 0 ? Math.round((Number(cta.count || 0) / totalAdsCount) * 100) : 0,
          })),
          scaledCtas: scaledCtaRows.map((cta) => ({
            name: cta.ctaText,
            count: Number(cta.count || 0),
            sharePct: totalScaledAds > 0 ? Math.round((Number(cta.count || 0) / totalScaledAds) * 100) : 0,
          })),
        },
        copyIntelligence: {
          lengths: copyLengthRows.map((l) => ({
            tier: l.tier,
            key: l.tierKey,
            count: Number(l.count || 0),
            avgDuplication: Number(l.avgDuplication || 1),
            sharePct: totalAdsCount > 0 ? Math.round((Number(l.count || 0) / totalAdsCount) * 100) : 0,
          })),
          triggers: {
            discountRate: totalAdsCount > 0 ? Math.round((Number(triggerStats?.discountTriggers || 0) / totalAdsCount) * 100) : 0,
            urgencyRate: totalAdsCount > 0 ? Math.round((Number(triggerStats?.urgencyTriggers || 0) / totalAdsCount) * 100) : 0,
            hasArabicRate: totalAdsCount > 0 ? Math.round((Number(triggerStats?.hasArabic || 0) / totalAdsCount) * 100) : 0,
            hasFrenchRate: totalAdsCount > 0 ? Math.round((Number(triggerStats?.hasFrench || 0) / totalAdsCount) * 100) : 0,
          },
        },
        duplicationTiers: duplicationTierRows.map((d) => ({
          tier: d.tier,
          key: d.tierKey,
          count: Number(d.count || 0),
          sharePct: totalAdsCount > 0 ? Math.round((Number(d.count || 0) / totalAdsCount) * 100) : 0,
        })),
        breakoutAds: enrichedBreakoutAds,
        topAdvertisers: topAdvertisers.map((a) => ({
          pageName: a.pageName,
          pageId: a.pageId,
          adCount: Number(a.adCount || 0),
          videoCount: Number(a.videoCount || 0),
          videoRatio: Number(a.adCount || 0) > 0 ? Math.round((Number(a.videoCount || 0) / Number(a.adCount || 0)) * 100) : 0,
          avgDuplication: Number(a.avgDuplication || 1),
          maxDuplication: Number(a.maxDuplication || 1),
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("[Ads Analytics API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch ads analytics" },
      { status: 500 }
    );
  }
}
