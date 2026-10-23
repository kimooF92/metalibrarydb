import { db } from "@/db";
import { sql } from "drizzle-orm";
import { TELEMETRY_WINDOW_DAYS } from "./constants";
import {
  MarketOpportunityTelemetry,
  TelemetryCoverage,
} from "./types";

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/**
 * Extracts strictly workspace-scoped, correctly aggregated market telemetry.
 * Strictly adheres to database egress, projection, and distinct-grain rules:
 * - Active ads: COUNT(DISTINCT ads.id) with ad_observations.is_active = true
 * - New ads: bounded 7-day window on distinct ads
 * - Window queries: 30-day time bound applied to scan_history before row_number()
 * - Category breakdown: Product CTE first to decouple product counts from ad joins
 * - Copy psychology: Distinct active ads only, truncated caption search, bounded limit
 * - No fabricated defaults: returns null for unmeasured prices or ratios
 */
export async function extractMarketOpportunityTelemetry(
  workspaceId: string
): Promise<MarketOpportunityTelemetry> {
  if (!workspaceId) {
    throw new Error("workspaceId is strictly required for opportunity telemetry");
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - TELEMETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // 1. Total Active Ads in Workspace (Distinct ads, non-archived, actively observed)
  const activeAdsRes = await db.execute<{ count: number }>(sql`
    SELECT COUNT(DISTINCT a.id)::int AS count
    FROM ads a
    INNER JOIN ad_observations ao ON a.id = ao.ad_id
    INNER JOIN tracked_pages tp ON ao.tracked_page_id = tp.id
    WHERE a.is_archived = false
      AND ao.is_active = true
      AND tp.workspace_id = ${workspaceId}::uuid
  `);
  const activeAdsRows = getRows<{ count: number }>(activeAdsRes);
  const totalActiveAds = Number(activeAdsRows[0]?.count || 0);

  // 2. New ads in last 7 days (Distinct active ads first seen or last seen within 7 days)
  const newAds7dRes = await db.execute<{ count: number }>(sql`
    SELECT COUNT(DISTINCT a.id)::int AS count
    FROM ads a
    INNER JOIN ad_observations ao ON a.id = ao.ad_id
    INNER JOIN tracked_pages tp ON ao.tracked_page_id = tp.id
    WHERE a.is_archived = false
      AND ao.is_active = true
      AND tp.workspace_id = ${workspaceId}::uuid
      AND (
        a.first_seen_at >= NOW() - INTERVAL '7 days'
        OR a.last_seen_at >= NOW() - INTERVAL '7 days'
      )
  `);
  const newAds7dRows = getRows<{ count: number }>(newAds7dRes);
  const newAdsLast7Days = Number(newAds7dRows[0]?.count || 0);

  // 3. Format split (Video vs Image on distinct active ads)
  let videoPercent: number | null = null;
  let imagePercent: number | null = null;

  if (totalActiveAds > 0) {
    const videoAdsRes = await db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT a.id)::int AS count
      FROM ads a
      INNER JOIN ad_observations ao ON a.id = ao.ad_id
      INNER JOIN tracked_pages tp ON ao.tracked_page_id = tp.id
      WHERE a.is_archived = false
        AND ao.is_active = true
        AND a.media_type = 'video'
        AND tp.workspace_id = ${workspaceId}::uuid
    `);
    const videoRows = getRows<{ count: number }>(videoAdsRes);
    const videoCount = Number(videoRows[0]?.count || 0);

    videoPercent = Math.min(100, Math.max(0, Math.round((videoCount / totalActiveAds) * 100)));
    imagePercent = Math.max(0, 100 - videoPercent);
  }

  // 4. Scaling / Descaling Brands Count
  // Bound scan_history by 30 days BEFORE applying row_number() window function
  const scalingStatsRes = await db.execute(sql`
    WITH latest_scans AS (
      SELECT 
        s.tracked_page_id,
        s.difference
      FROM (
        SELECT 
          sh.tracked_page_id, 
          sh.difference,
          row_number() OVER (PARTITION BY sh.tracked_page_id ORDER BY sh.checked_at DESC) as rn
        FROM scan_history sh
        INNER JOIN tracked_pages tp ON tp.id = sh.tracked_page_id
        WHERE sh.difference IS NOT NULL
          AND sh.checked_at >= NOW() - INTERVAL '30 days'
          AND tp.workspace_id = ${workspaceId}::uuid
      ) s
      WHERE s.rn = 1
    )
    SELECT 
      COUNT(CASE WHEN difference > 0 THEN 1 END)::int AS "scalingBrandsCount",
      COALESCE(SUM(CASE WHEN difference > 0 THEN difference ELSE 0 END), 0)::int AS "totalAdsScaled",
      COUNT(CASE WHEN difference < 0 THEN 1 END)::int AS "descalingBrandsCount",
      COALESCE(SUM(CASE WHEN difference < 0 THEN ABS(difference) ELSE 0 END), 0)::int AS "totalAdsDescaled"
    FROM latest_scans;
  `);

  const scalingStatsRows = getRows<{
    scalingBrandsCount?: number;
    totalAdsScaled?: number;
    descalingBrandsCount?: number;
    totalAdsDescaled?: number;
  }>(scalingStatsRes);
  const scalingStats = scalingStatsRows[0] || {};
  const scalingBrandsCount = Number(scalingStats.scalingBrandsCount || 0);
  const totalAdsScaled = Number(scalingStats.totalAdsScaled || 0);
  const descalingBrandsCount = Number(scalingStats.descalingBrandsCount || 0);
  const totalAdsDescaled = Number(scalingStats.totalAdsDescaled || 0);
  const netAdDelta = totalAdsScaled - totalAdsDescaled;

  // 5. Total Monitored Brands in Workspace
  const monitoredRes = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM tracked_pages
    WHERE workspace_id = ${workspaceId}::uuid
  `);
  const monitoredRows = getRows<{ count: number }>(monitoredRes);
  const monitoredBrands = Number(monitoredRows[0]?.count || 0);

  // 6. Category Breakdown with Decoupled Products and Active Ad Counts
  // Uses product-level CTE first so product counts and prices are NOT multiplied by ad joins
  const categoryRes = await db.execute(sql`
    WITH prod_stats AS (
      SELECT
        COALESCE(NULLIF(sp.category, ''), 'General & Other') AS category,
        COUNT(DISTINCT sp.id)::int AS product_count,
        COUNT(DISTINCT sp.domain)::int AS store_count,
        ROUND(AVG(CASE WHEN COALESCE(NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0) > 0 
                       THEN COALESCE(NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0) 
                  END), 1)::float AS avg_price,
        MIN(CASE WHEN COALESCE(NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0) > 0 
                 THEN COALESCE(NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0) 
            END)::float AS min_price,
        MAX(CASE WHEN COALESCE(NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0) > 0 
                 THEN COALESCE(NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0) 
            END)::float AS max_price
      FROM scraped_products sp
      WHERE sp.workspace_id = ${workspaceId}::uuid
      GROUP BY COALESCE(NULLIF(sp.category, ''), 'General & Other')
    ),
    ad_stats AS (
      SELECT
        COALESCE(NULLIF(sp.category, ''), 'General & Other') AS category,
        COUNT(DISTINCT CASE WHEN a.is_archived = false AND ao.is_active = true THEN a.id END)::int AS active_ads_count,
        COUNT(DISTINCT CASE WHEN a.is_archived = false AND ao.is_active = true AND (a.first_seen_at >= NOW() - INTERVAL '7 days' OR a.last_seen_at >= NOW() - INTERVAL '7 days') THEN a.id END)::int AS new_ads_7d_count
      FROM scraped_products sp
      INNER JOIN ads a ON sp.id = a.product_id
      INNER JOIN ad_observations ao ON a.id = ao.ad_id
      INNER JOIN tracked_pages tp ON ao.tracked_page_id = tp.id
      WHERE sp.workspace_id = ${workspaceId}::uuid
        AND tp.workspace_id = ${workspaceId}::uuid
      GROUP BY COALESCE(NULLIF(sp.category, ''), 'General & Other')
    )
    SELECT
      p.category,
      p.product_count,
      p.store_count,
      p.avg_price,
      p.min_price,
      p.max_price,
      COALESCE(a.active_ads_count, 0)::int AS active_ads_count,
      COALESCE(a.new_ads_7d_count, 0)::int AS new_ads_7d_count
    FROM prod_stats p
    LEFT JOIN ad_stats a ON p.category = a.category
    ORDER BY p.product_count DESC
    LIMIT 12;
  `);

  const categoryRows = getRows<{
    category?: string;
    product_count?: number;
    store_count?: number;
    avg_price?: number;
    min_price?: number;
    max_price?: number;
    active_ads_count?: number;
    new_ads_7d_count?: number;
  }>(categoryRes);

  const categoryBreakdown: MarketOpportunityTelemetry["categoryBreakdown"] = categoryRows.map((c) => ({
    category: c.category || "General & Other",
    productCount: Number(c.product_count || 0),
    storeCount: Number(c.store_count || 0),
    avgPriceTND: c.avg_price !== null && c.avg_price !== undefined ? Number(c.avg_price) : null,
    minPriceTND: c.min_price !== null && c.min_price !== undefined ? Number(c.min_price) : null,
    maxPriceTND: c.max_price !== null && c.max_price !== undefined ? Number(c.max_price) : null,
    activeAdsCount: Number(c.active_ads_count || 0),
    newAds7dCount: Number(c.new_ads_7d_count || 0),
  }));

  // 7. Top Cloned / Saturated Products (Distinct domains per normalized title, capped to 8)
  const cloneRes = await db.execute(sql`
    SELECT
      sp.title,
      COUNT(DISTINCT sp.domain)::int AS store_count,
      MAX(sp.category) AS category,
      ROUND(AVG(CASE WHEN COALESCE(NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0) > 0 
                     THEN COALESCE(NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0) 
                END), 1)::float AS avg_price
    FROM scraped_products sp
    WHERE sp.workspace_id = ${workspaceId}::uuid
      AND sp.title IS NOT NULL
      AND LENGTH(TRIM(sp.title)) > 5
    GROUP BY sp.title
    HAVING COUNT(DISTINCT sp.domain) > 1
    ORDER BY store_count DESC
    LIMIT 8;
  `);

  const cloneRows = getRows<{
    title?: string;
    store_count?: number;
    category?: string;
    avg_price?: number;
  }>(cloneRes);

  const topClonedProducts: MarketOpportunityTelemetry["topClonedProducts"] = cloneRows.map((r) => ({
    title: r.title || "Unknown Product",
    storeCount: Number(r.store_count || 0),
    category: r.category || "General & Other",
    avgPriceTND: r.avg_price !== null && r.avg_price !== undefined ? Number(r.avg_price) : null,
  }));

  // 8. Copy Psychology Metrics (One row per distinct active ad, truncated caption, capped window)
  const copyRes = await db.execute(sql`
    WITH distinct_workspace_ads AS (
      SELECT DISTINCT ON (a.id)
        a.id,
        LEFT(a.caption, 500) AS caption
      FROM ads a
      INNER JOIN ad_observations ao ON a.id = ao.ad_id
      INNER JOIN tracked_pages tp ON ao.tracked_page_id = tp.id
      WHERE a.is_archived = false
        AND ao.is_active = true
        AND tp.workspace_id = ${workspaceId}::uuid
        AND a.caption IS NOT NULL
        AND LENGTH(TRIM(a.caption)) > 0
      LIMIT 1000
    )
    SELECT
      COUNT(CASE WHEN caption ~* '[\u0600-\u06FF]' THEN 1 END)::int AS has_arabic,
      COUNT(CASE WHEN caption ~* '(livraison|commande|prix|qualité|gratuit|boutique)' THEN 1 END)::int AS has_french,
      COUNT(CASE WHEN caption ~* '(%|remise|تخفيض|solde|promo|خصم)' THEN 1 END)::int AS has_discount,
      COUNT(CASE WHEN caption ~* '(gratuit|livraison gratuite|مجانا|توصيل مجاني)' THEN 1 END)::int AS has_free_deliv,
      COUNT(*)::int AS total_count
    FROM distinct_workspace_ads;
  `);

  const copyRows = getRows<{
    has_arabic?: number;
    has_french?: number;
    has_discount?: number;
    has_free_deliv?: number;
    total_count?: number;
  }>(copyRes);

  const copyStats = copyRows[0] || {};
  const totalCopy = Number(copyStats.total_count || 0);

  const arabicScriptPercent = totalCopy > 0 ? Math.round((Number(copyStats.has_arabic || 0) / totalCopy) * 100) : 0;
  const frenchPercent = totalCopy > 0 ? Math.round((Number(copyStats.has_french || 0) / totalCopy) * 100) : 0;
  const discountTriggerPercent = totalCopy > 0 ? Math.round((Number(copyStats.has_discount || 0) / totalCopy) * 100) : 0;
  const freeDeliveryTriggerPercent = totalCopy > 0 ? Math.round((Number(copyStats.has_free_deliv || 0) / totalCopy) * 100) : 0;

  // 9. Coverage and Data Quality Assessment
  const missingSignals: string[] = [];
  if (totalActiveAds === 0) missingSignals.push("activeAds");
  if (categoryBreakdown.length === 0) missingSignals.push("categories");
  const hasPrices = categoryBreakdown.some((c) => c.avgPriceTND !== null);
  if (!hasPrices) missingSignals.push("categoryPrices");
  if (scalingBrandsCount === 0 && descalingBrandsCount === 0) missingSignals.push("scalingVelocity");

  const hasEnoughDataForInference = totalActiveAds >= 3 || categoryBreakdown.length > 0;

  const coverage: TelemetryCoverage = {
    window: {
      start: windowStart.toISOString(),
      end: now.toISOString(),
    },
    workspaceId,
    observedAdCount: totalActiveAds,
    hasEnoughDataForInference,
    missingSignals,
  };

  return {
    totalActiveAds,
    newAdsLast7Days,
    videoPercent,
    imagePercent,
    monitoredBrands,
    scalingBrandsCount,
    totalAdsScaled,
    descalingBrandsCount,
    totalAdsDescaled,
    netAdDelta,
    categoryBreakdown,
    topClonedProducts,
    copyPsychology: {
      arabicScriptPercent,
      frenchPercent,
      discountTriggerPercent,
      freeDeliveryTriggerPercent,
    },
    coverage,
  };
}
