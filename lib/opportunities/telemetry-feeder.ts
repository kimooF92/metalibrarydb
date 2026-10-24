/**
 * Telemetry Feeder for Opportunity Seeker (TASK-16)
 * Executes window-bounded queries with Supabase egress protection to generate a TelemetrySnapshot.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  TelemetrySnapshot,
  TelemetryCategoryRow,
  TelemetryBrandRow,
  TelemetryProductRow,
  TelemetryCreativeRow,
} from "./prompt-types";

/**
 * Fetches an empirical market telemetry snapshot for a given workspace and time window.
 */
export async function getOpportunityTelemetrySnapshot(
  workspaceId: string,
  rangeDays = 7
): Promise<TelemetrySnapshot> {
  const windowDays = Math.max(1, Math.min(30, rangeDays));
  const effectiveWindow = `${windowDays}d`;

  // 1. Categories Aggregation with Active Ads & Price Dispersion
  // Note: Catalog products are scoped by workspace without dropping evergreen products.
  // The time window strictly bounds new-ad discovery and observation history.
  const categoriesQuery = sql`
    WITH category_products AS (
      SELECT 
        COALESCE(NULLIF(sp.category, ''), 'General & Other') AS cat_name,
        sp.id AS product_id,
        sp.domain,
        NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric AS price
      FROM scraped_products sp
      WHERE sp.workspace_id = ${workspaceId}::uuid
    ),
    latest_active_obs AS (
      SELECT DISTINCT ON (ao.ad_id)
        ao.ad_id,
        ao.is_active
      FROM ad_observations ao
      INNER JOIN tracked_pages tp ON tp.id = ao.tracked_page_id
      WHERE tp.workspace_id = ${workspaceId}::uuid
        AND ao.observed_at >= NOW() - (${windowDays} || ' days')::interval
      ORDER BY ao.ad_id, ao.observed_at DESC
    ),
    category_ads AS (
      SELECT 
        cp.cat_name,
        COUNT(DISTINCT a.id) AS active_ads_count,
        COUNT(DISTINCT CASE WHEN a.first_seen_at >= NOW() - (${windowDays} || ' days')::interval THEN a.id END) AS new_ads_window_count
      FROM category_products cp
      INNER JOIN ads a ON a.product_id = cp.product_id
      INNER JOIN latest_active_obs lab ON lab.ad_id = a.id
      WHERE (a.is_archived = false OR a.is_archived IS NULL)
        AND lab.is_active = true
      GROUP BY cp.cat_name
    )
    SELECT 
      cp.cat_name AS category,
      COUNT(DISTINCT cp.product_id) AS product_count,
      COUNT(DISTINCT cp.domain) AS store_count,
      ROUND(AVG(CASE WHEN cp.price > 0 THEN cp.price END), 1) AS avg_price,
      MIN(CASE WHEN cp.price > 0 THEN cp.price END) AS min_price,
      MAX(CASE WHEN cp.price > 0 THEN cp.price END) AS max_price,
      COALESCE(ca.active_ads_count, 0) AS active_ads_count,
      COALESCE(ca.new_ads_window_count, 0) AS new_ads_window_count
    FROM category_products cp
    LEFT JOIN category_ads ca ON ca.cat_name = cp.cat_name
    GROUP BY cp.cat_name, ca.active_ads_count, ca.new_ads_window_count
    ORDER BY product_count DESC
    LIMIT 20;
  `;

  // 2. Tracked Brands with Accurate Window Deltas & Targeted Signal Stratification
  // Solves Finding 2: Guarantees top breakout scaling brands and crashing descaling brands are preserved.
  const brandsQuery = sql`
    WITH brand_deltas AS (
      SELECT 
        COALESCE(tp.display_name, 'Unknown') AS brand_name,
        COALESCE(tp.page_id, '') AS page_id,
        COALESCE(tp.current_results, 0) AS current_ads,
        COALESCE(window_delta.delta, 0) AS net_delta,
        COALESCE(NULLIF(bd.category, ''), 'General & Other') AS category,
        CASE 
          WHEN COALESCE(tp.current_results, 0) = 0 THEN 'zero_ads'
          WHEN COALESCE(window_delta.delta, 0) > 0 THEN 'scaling'
          WHEN COALESCE(window_delta.delta, 0) < 0 THEN 'descaling'
          ELSE 'stable'
        END AS status
      FROM tracked_pages tp
      LEFT JOIN brand_domains bd ON bd.id = tp.brand_domain_id
      LEFT JOIN LATERAL (
        SELECT 
          (
            (SELECT sh1.results FROM scan_history sh1 WHERE sh1.tracked_page_id = tp.id AND sh1.checked_at >= NOW() - (${windowDays} || ' days')::interval AND sh1.results IS NOT NULL ORDER BY sh1.checked_at DESC LIMIT 1)
            -
            (SELECT sh2.results FROM scan_history sh2 WHERE sh2.tracked_page_id = tp.id AND sh2.checked_at >= NOW() - (${windowDays} || ' days')::interval AND sh2.results IS NOT NULL ORDER BY sh2.checked_at ASC LIMIT 1)
          ) AS delta
      ) window_delta ON true
      WHERE tp.workspace_id = ${workspaceId}::uuid
    ),
    top_scaling AS (
      SELECT * FROM brand_deltas
      WHERE net_delta > 0
      ORDER BY net_delta DESC, current_ads DESC
      LIMIT 50
    ),
    top_descaling AS (
      SELECT * FROM brand_deltas
      WHERE net_delta < 0
      ORDER BY net_delta ASC, current_ads DESC
      LIMIT 30
    ),
    top_volume AS (
      SELECT * FROM brand_deltas
      ORDER BY current_ads DESC
      LIMIT 20
    )
    SELECT * FROM top_scaling
    UNION ALL
    SELECT * FROM top_descaling
    UNION ALL
    SELECT * FROM top_volume;
  `;

  // 3. Products Stratified Across Categories & Clone Traps
  // Solves Finding 4: Partitions by category so recent catalog imports do not crowd out diverse signals.
  const productsQuery = sql`
    WITH product_store_counts AS (
      SELECT 
        LOWER(TRIM(title)) AS norm_title,
        COUNT(DISTINCT domain) AS store_count
      FROM scraped_products
      WHERE workspace_id = ${workspaceId}::uuid
        AND title IS NOT NULL
        AND length(TRIM(title)) > 0
      GROUP BY LOWER(TRIM(title))
    ),
    ranked_products AS (
      SELECT 
        COALESCE(sp.title, 'Untitled') AS product_title,
        COALESCE(sp.domain, '') AS domain,
        COALESCE(NULLIF(sp.category, ''), 'General & Other') AS category,
        NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric AS current_price_num,
        COALESCE(psc.store_count, 1) AS store_count,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(NULLIF(sp.category, ''), 'General & Other')
          ORDER BY COALESCE(psc.store_count, 1) DESC, sp.updated_at DESC
        ) AS cat_rank
      FROM scraped_products sp
      LEFT JOIN product_store_counts psc ON LOWER(TRIM(sp.title)) = psc.norm_title
      WHERE sp.workspace_id = ${workspaceId}::uuid
    )
    SELECT 
      product_title,
      domain,
      category,
      current_price_num,
      store_count
    FROM ranked_products
    WHERE cat_rank <= 8
    ORDER BY store_count DESC, cat_rank ASC
    LIMIT 100;
  `;

  // 4. Creative Signals with Window-Bounded CTE and Unicode-Escaped Patterns
  const creativesQuery = sql`
    WITH latest_obs AS (
      SELECT DISTINCT ON (ao.ad_id)
        ao.ad_id,
        ao.tracked_page_id,
        ao.is_active,
        ao.observed_at
      FROM ad_observations ao
      INNER JOIN tracked_pages tp ON tp.id = ao.tracked_page_id
      WHERE tp.workspace_id = ${workspaceId}::uuid
        AND ao.observed_at >= NOW() - (${windowDays} || ' days')::interval
      ORDER BY ao.ad_id, ao.observed_at DESC
    )
    SELECT
      a.ad_archive_id AS ad_id,
      COALESCE(a.page_name, tp.display_name, 'Unknown') AS brand_name,
      COALESCE(a.media_type, 'image') AS media_type,
      COALESCE(NULLIF(sp.category, ''), 'General & Other') AS category,
      GREATEST(1, ROUND(EXTRACT(EPOCH FROM (lo.observed_at - COALESCE(a.started_running_on, a.first_seen_at, a.created_at))) / 86400)) AS days_active,
      (LEFT(COALESCE(a.caption, ''), 200) ~ '[\u0600-\u06FF]') AS has_arabic,
      (LOWER(LEFT(COALESCE(a.caption, ''), 200)) ~ '(livraison|gratuit|promo|commander|prix|solde|offre)') AS has_french,
      (LOWER(LEFT(COALESCE(a.caption, ''), 200)) ~ '(livraison gratuite|\u062A\u0648\u0635\u064A\u0644 \u0645\u062C\u0627\u0646\u064A|\u062A\u0648\u0635\u064A\u0644 \u0628\u0644\u0627\u0634|free delivery|livraison 0)') AS has_free_delivery,
      (LOWER(LEFT(COALESCE(a.caption, ''), 200)) ~ '(remise|\u062A\u062E\u0641\u064A\u0636|\u062E\u0635\u0645|promo|solde|%|\u0639\u0631\u0636)') AS has_discount
    FROM latest_obs lo
    INNER JOIN ads a ON a.id = lo.ad_id
    INNER JOIN tracked_pages tp ON tp.id = lo.tracked_page_id
    LEFT JOIN scraped_products sp ON sp.id = a.product_id
    WHERE lo.is_active = true
      AND (a.is_archived = false OR a.is_archived IS NULL)
    ORDER BY lo.observed_at DESC
    LIMIT 50;
  `;

  // Execute queries in parallel
  const [categoriesResult, brandsResult, productsResult, creativesResult] = await Promise.all([
    db.execute(categoriesQuery),
    db.execute(brandsQuery),
    db.execute(productsQuery),
    db.execute(creativesQuery),
  ]);

  // Process Categories
  const categories: TelemetryCategoryRow[] = (categoriesResult as any[]).map((r) => ({
    category: String(r.category || "General & Other"),
    productCount: Number(r.product_count) || 0,
    storeCount: Number(r.store_count) || 0,
    activeAdsCount: Number(r.active_ads_count) || 0,
    newAdsWindowCount: Number(r.new_ads_window_count) || 0,
    avgPriceTnd: r.avg_price !== null ? Number(r.avg_price) : "",
    minPriceTnd: r.min_price !== null ? Number(r.min_price) : "",
    maxPriceTnd: r.max_price !== null ? Number(r.max_price) : "",
  }));

  // Process Brands into Scaling and Descaling lists with deduplication across union branches
  const seenPages = new Set<string>();
  const allBrands: (TelemetryBrandRow & { category?: string })[] = [];
  for (const r of brandsResult as any[]) {
    const pageId = String(r.page_id || "");
    const key = pageId || String(r.brand_name || "");
    if (!seenPages.has(key)) {
      seenPages.add(key);
      allBrands.push({
        brandName: String(r.brand_name || "Unknown"),
        pageId,
        currentAds: Number(r.current_ads) || 0,
        netDelta: Number(r.net_delta) || 0,
        status: String(r.status || "stable"),
        category: r.category ? String(r.category) : undefined,
      });
    }
  }

  const scalingBrands: TelemetryBrandRow[] = allBrands
    .filter((b) => b.netDelta > 0)
    .sort((a, b) => b.netDelta - a.netDelta)
    .slice(0, 50);

  const descalingBrands: TelemetryBrandRow[] = allBrands
    .filter((b) => b.netDelta < 0)
    .sort((a, b) => a.netDelta - b.netDelta)
    .slice(0, 25);

  // Process Products
  const products: TelemetryProductRow[] = (productsResult as any[]).map((r) => {
    const currPrice = r.current_price_num !== null ? Number(r.current_price_num) : null;
    const storeCount = Number(r.store_count) || 1;
    let codTier = "";
    if (currPrice !== null) {
      if (currPrice < 30) codTier = "< 30 TND";
      else if (currPrice < 60) codTier = "30 - 59.99 TND";
      else if (currPrice < 100) codTier = "60 - 99.99 TND";
      else codTier = "100+ TND";
    }
    const isClonedTrap = storeCount > 1 && currPrice !== null && currPrice < 30;

    return {
      productTitle: String(r.product_title || "Untitled"),
      domain: String(r.domain || ""),
      category: String(r.category || "General & Other"),
      currentPriceTnd: currPrice !== null ? currPrice : "",
      storeCount,
      codPriceTier: codTier,
      isClonedTrap,
    };
  });

  // Process Creatives
  const creatives: TelemetryCreativeRow[] = (creativesResult as any[]).map((r) => ({
    adId: String(r.ad_id || ""),
    brandName: String(r.brand_name || "Unknown"),
    mediaType: String(r.media_type || "image"),
    daysActive: Number(r.days_active) || 1,
    hasArabic: Boolean(r.has_arabic),
    hasFrench: Boolean(r.has_french),
    hasFreeDelivery: Boolean(r.has_free_delivery),
    hasDiscount: Boolean(r.has_discount),
    category: r.category ? String(r.category) : undefined,
  }));

  // Aggregate high-level metrics
  const totalActiveAds = categories.reduce((acc, c) => acc + c.activeAdsCount, 0);
  const newAdsWindow = categories.reduce((acc, c) => acc + c.newAdsWindowCount, 0);
  const saturatedClonesCount = products.filter((p) => p.isClonedTrap).length;

  return {
    workspaceId,
    rangeDays: windowDays,
    effectiveWindow,
    generatedAt: new Date().toISOString(),
    metrics: {
      totalActiveAds,
      newAdsWindow,
      scalingBrandsCount: scalingBrands.length,
      descalingBrandsCount: descalingBrands.length,
      totalProductsCount: products.length,
      saturatedClonesCount,
    },
    categories,
    scalingBrands,
    descalingBrands,
    products,
    creatives,
  };
}
