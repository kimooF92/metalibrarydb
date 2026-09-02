import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, scrapedProducts } from "@/db/schema";
import { sql, desc, count, and, eq, or, isNull, gte } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";

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
    const windowStartIso = windowStart.toISOString();
    const productWindow = gte(scrapedProducts.createdAt, windowStart);

    // 1. Price Extraction Helper in SQL
    // Handles decimal and comma formats (e.g. 49.00, 49,900, DT, TND)
    const priceExpr = sql`COALESCE(NULLIF(SUBSTRING(REPLACE(${scrapedProducts.currentPrice}, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0)`;

    // 2. Overall Product Catalog KPI & Data Quality Summary
    const [summaryRes] = await db
      .select({
        totalProducts: count(),
        successfulScrapes: sql<number>`COUNT(CASE WHEN ${scrapedProducts.scrapeStatus} = 'success' THEN 1 END)`.mapWith(Number),
        classifiedCount: sql<number>`COUNT(CASE WHEN ${scrapedProducts.category} IS NOT NULL AND ${scrapedProducts.category} != '' AND ${scrapedProducts.category} != 'General & Other' THEN 1 END)`.mapWith(Number),
        parsedPriceCount: sql<number>`COUNT(CASE WHEN ${priceExpr} > 0 THEN 1 END)`.mapWith(Number),
        withOffersCount: sql<number>`COUNT(CASE WHEN ${scrapedProducts.discountOrOffer} IS NOT NULL AND ${scrapedProducts.discountOrOffer} != '' THEN 1 END)`.mapWith(Number),
        favoritesCount: sql<number>`COUNT(CASE WHEN ${scrapedProducts.isFavorite} = true THEN 1 END)`.mapWith(Number),
        newInWindow: sql<number>`COUNT(CASE WHEN ${scrapedProducts.createdAt} >= ${windowStartIso} THEN 1 END)`.mapWith(Number),
        hasMetaPixel: sql<number>`COUNT(CASE WHEN ${scrapedProducts.metaPixelIds} IS NOT NULL AND array_length(${scrapedProducts.metaPixelIds}, 1) > 0 THEN 1 END)`.mapWith(Number),
        hasWhatsApp: sql<number>`COUNT(CASE WHEN ${scrapedProducts.whatsappNumbers} IS NOT NULL AND array_length(${scrapedProducts.whatsappNumbers}, 1) > 0 THEN 1 END)`.mapWith(Number),
        hasFreeDelivery: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.deliveryCost}) LIKE '%gratuit%' OR LOWER(${scrapedProducts.deliveryCost}) LIKE '%free%' OR ${scrapedProducts.deliveryCost} = '0' THEN 1 END)`.mapWith(Number),
      })
      .from(scrapedProducts)
      .where(productWindow);

    const totalProd = Number(summaryRes?.totalProducts || 0);
    const classifiedCount = Number(summaryRes?.classifiedCount || 0);
    const parsedPriceCount = Number(summaryRes?.parsedPriceCount || 0);

    const dataQuality = {
      totalProducts: totalProd,
      classifiedCount,
      classifiedRate: totalProd > 0 ? Math.round((classifiedCount / totalProd) * 100) : 100,
      parsedPriceCount,
      priceParsedRate: totalProd > 0 ? Math.round((parsedPriceCount / totalProd) * 100) : 100,
    };

    // 3. Category & Winner Niches Matrix
    const categoryRows = await db
      .select({
        category: sql<string>`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`,
        productCount: count(),
        distinctStoresCount: sql<number>`COUNT(DISTINCT ${scrapedProducts.domain})`.mapWith(Number),
        avgPrice: sql<number>`ROUND(AVG(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END), 1)`.mapWith(Number),
        minPrice: sql<number>`MIN(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
        maxPrice: sql<number>`MAX(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
        withOffersCount: sql<number>`COUNT(CASE WHEN ${scrapedProducts.discountOrOffer} IS NOT NULL AND ${scrapedProducts.discountOrOffer} != '' THEN 1 END)`.mapWith(Number),
        shopifyCount: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%shopify%' THEN 1 END)`.mapWith(Number),
        youcanCount: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%youcan%' THEN 1 END)`.mapWith(Number),
        woocommerceCount: sql<number>`COUNT(CASE WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%woocommerce%' THEN 1 END)`.mapWith(Number),
      })
      .from(scrapedProducts)
      .where(productWindow)
      .groupBy(sql`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`)
      .orderBy(desc(count()));

    // 4. Sub-category drilldown (Top 15 sub-categories)
    const subCategoryRows = await db
      .select({
        category: sql<string>`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`,
        subCategory: sql<string>`COALESCE(NULLIF(${scrapedProducts.subCategory}, ''), 'General')`,
        productCount: count(),
        avgPrice: sql<number>`ROUND(AVG(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END), 1)`.mapWith(Number),
      })
      .from(scrapedProducts)
      .where(and(productWindow, sql`${scrapedProducts.subCategory} IS NOT NULL AND ${scrapedProducts.subCategory} != ''`))
      .groupBy(
        sql`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`,
        sql`COALESCE(NULLIF(${scrapedProducts.subCategory}, ''), 'General')`
      )
      .orderBy(desc(count()))
      .limit(15);

    // 5. Price Band / Tier Distribution
    const priceTierRows = await db
      .select({
        tier: sql<string>`
          CASE 
            WHEN ${priceExpr} <= 0 THEN 'Unknown / Unpriced'
            WHEN ${priceExpr} < 30 THEN 'Under 30 TND (Micro/Impulse)'
            WHEN ${priceExpr} >= 30 AND ${priceExpr} < 60 THEN '30 - 60 TND (Sweet Spot)'
            WHEN ${priceExpr} >= 60 AND ${priceExpr} < 100 THEN '60 - 100 TND (Mid-Ticket)'
            WHEN ${priceExpr} >= 100 AND ${priceExpr} < 200 THEN '100 - 200 TND (High-Ticket)'
            ELSE '200+ TND (Premium / Luxury)'
          END
        `,
        tierKey: sql<string>`
          CASE 
            WHEN ${priceExpr} <= 0 THEN 'unknown'
            WHEN ${priceExpr} < 30 THEN 'tier_under_30'
            WHEN ${priceExpr} >= 30 AND ${priceExpr} < 60 THEN 'tier_30_60'
            WHEN ${priceExpr} >= 60 AND ${priceExpr} < 100 THEN 'tier_60_100'
            WHEN ${priceExpr} >= 100 AND ${priceExpr} < 200 THEN 'tier_100_200'
            ELSE 'tier_200_plus'
          END
        `,
        productCount: count(),
        avgPrice: sql<number>`ROUND(AVG(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END), 1)`.mapWith(Number),
      })
      .from(scrapedProducts)
      .where(productWindow)
      .groupBy(sql`1`, sql`2`);

    // 6. Platform Share breakdown
    const platformRows = await db
      .select({
        platform: sql<string>`
          CASE 
            WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%shopify%' THEN 'Shopify'
            WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%youcan%' THEN 'YouCan'
            WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%woocommerce%' THEN 'WooCommerce'
            WHEN LOWER(${scrapedProducts.storePlatform}) LIKE '%lightfunnels%' THEN 'LightFunnels'
            WHEN ${scrapedProducts.storePlatform} IS NOT NULL AND ${scrapedProducts.storePlatform} != '' THEN 'Custom / Other'
            ELSE 'Unknown'
          END
        `,
        count: count(),
      })
      .from(scrapedProducts)
      .where(productWindow)
      .groupBy(sql`1`)
      .orderBy(desc(count()));

    // 7. Top Winner Products (Top products ranked by active ads, days running, and max duplication)
    const topProductsWithAds = await db
      .select({
        id: scrapedProducts.id,
        title: scrapedProducts.title,
        url: scrapedProducts.url,
        domain: scrapedProducts.domain,
        currentPrice: scrapedProducts.currentPrice,
        originalPrice: scrapedProducts.originalPrice,
        discountOrOffer: scrapedProducts.discountOrOffer,
        mainImageUrl: scrapedProducts.mainImageUrl,
        category: scrapedProducts.category,
        subCategory: scrapedProducts.subCategory,
        storePlatform: scrapedProducts.storePlatform,
        deliveryCost: scrapedProducts.deliveryCost,
        isFavorite: scrapedProducts.isFavorite,
        createdAt: scrapedProducts.createdAt,
        linkedAdsCount: sql<number>`COUNT(${ads.id})`.mapWith(Number),
        activeAdsCount: sql<number>`COUNT(CASE WHEN ${ads.isArchived} = false OR ${ads.isArchived} IS NULL THEN ${ads.id} END)`.mapWith(Number),
        earliestAdDate: sql<string>`MIN(COALESCE(${ads.startedRunningOn}, ${ads.firstSeenAt}, ${ads.createdAt}))`,
        latestAdDate: sql<string>`MAX(${ads.lastSeenAt})`,
        brandName: sql<string>`MAX(${ads.pageName})`,
        brandPageId: sql<string>`MAX(${ads.pageId})`,
      })
      .from(scrapedProducts)
      .leftJoin(ads, eq(scrapedProducts.id, ads.productId))
      .where(productWindow)
      .groupBy(scrapedProducts.id)
      .orderBy(
        desc(sql`COUNT(${ads.id})`),
        desc(sql`COUNT(CASE WHEN ${ads.isArchived} = false OR ${ads.isArchived} IS NULL THEN ${ads.id} END)`),
        desc(scrapedProducts.createdAt)
      )
      .limit(15);

    const now = Date.now();
    const enrichedTopProducts = topProductsWithAds.map((p) => {
      const earliest = p.earliestAdDate || p.createdAt;
      const daysRunning = earliest
        ? Math.max(1, Math.round((now - new Date(earliest).getTime()) / 86400000))
        : 1;

      // Winner momentum score (0-100)
      const adVolumePts = Math.min(50, (p.linkedAdsCount || 0) * 10);
      const activePts = Math.min(30, (p.activeAdsCount || 0) * 10);
      const longevityPts = Math.min(20, Math.floor(daysRunning / 2));
      const winnerScore = Math.min(100, adVolumePts + activePts + longevityPts);

      return {
        ...p,
        daysRunning,
        winnerScore,
      };
    });

    // 8. Cross-Store Saturation / Products with duplicate titles across multiple domains (Clone Detection)
    const crossStoreClones = await db
      .select({
        title: scrapedProducts.title,
        storeCount: sql<number>`COUNT(DISTINCT ${scrapedProducts.domain})`.mapWith(Number),
        productCount: count(),
        domains: sql<string[]>`array_agg(DISTINCT ${scrapedProducts.domain})`,
        sampleImage: sql<string>`MAX(${scrapedProducts.mainImageUrl})`,
        category: sql<string>`MAX(${scrapedProducts.category})`,
        minPrice: sql<number>`MIN(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
        maxPrice: sql<number>`MAX(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
      })
      .from(scrapedProducts)
      .where(and(productWindow, sql`${scrapedProducts.title} IS NOT NULL AND length(${scrapedProducts.title}) > 5`))
      .groupBy(scrapedProducts.title)
      .having(sql`COUNT(DISTINCT ${scrapedProducts.domain}) > 1`)
      .orderBy(desc(sql`COUNT(DISTINCT ${scrapedProducts.domain})`))
      .limit(10);

    return NextResponse.json(
      {
        dataQuality,
        summary: {
          totalProducts: totalProd,
          successfulScrapes: Number(summaryRes?.successfulScrapes || 0),
          withOffersCount: Number(summaryRes?.withOffersCount || 0),
          favoritesCount: Number(summaryRes?.favoritesCount || 0),
          newInWindow: Number(summaryRes?.newInWindow || 0),
          hasMetaPixel: Number(summaryRes?.hasMetaPixel || 0),
          hasWhatsApp: Number(summaryRes?.hasWhatsApp || 0),
          hasFreeDelivery: Number(summaryRes?.hasFreeDelivery || 0),
        },
        categories: categoryRows.map((r) => {
          const storeCount = Math.max(1, Number(r.distinctStoresCount || 1));
          const prodCount = Number(r.productCount || 0);
          const opportunityScore = Math.round((prodCount / storeCount) * 10) / 10;

          return {
            name: r.category,
            count: prodCount,
            storesCount: storeCount,
            opportunityScore,
            avgPrice: Number(r.avgPrice || 0),
            minPrice: Number(r.minPrice || 0),
            maxPrice: Number(r.maxPrice || 0),
            withOffersCount: Number(r.withOffersCount || 0),
            offerRate: prodCount > 0 ? Math.round((Number(r.withOffersCount || 0) / prodCount) * 100) : 0,
            platforms: {
              shopify: Number(r.shopifyCount || 0),
              youcan: Number(r.youcanCount || 0),
              woocommerce: Number(r.woocommerceCount || 0),
            },
          };
        }),
        subCategories: subCategoryRows.map((s) => ({
          category: s.category,
          name: s.subCategory,
          count: Number(s.productCount || 0),
          avgPrice: Number(s.avgPrice || 0),
        })),
        priceTiers: priceTierRows.map((t) => ({
          tier: t.tier,
          tierKey: t.tierKey,
          count: Number(t.productCount || 0),
          avgPrice: Number(t.avgPrice || 0),
        })),
        platforms: platformRows.map((p) => ({
          name: p.platform,
          count: Number(p.count || 0),
        })),
        topProducts: enrichedTopProducts,
        crossStoreClones: crossStoreClones.map((c) => ({
          title: c.title,
          storeCount: Number(c.storeCount || 0),
          productCount: Number(c.productCount || 0),
          domains: c.domains || [],
          sampleImage: c.sampleImage,
          category: c.category,
          minPrice: Number(c.minPrice || 0),
          maxPrice: Number(c.maxPrice || 0),
        })),
      },
      {
        headers: {
          "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
          Vary: PRIVATE_AUTH_VARY,
        },
      }
    );
  } catch (err: any) {
    console.error("[Products Analytics API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch products analytics" },
      { status: 500 }
    );
  }
}
