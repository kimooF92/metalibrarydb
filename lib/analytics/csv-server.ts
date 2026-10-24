import { db } from "@/db";
import { sql } from "drizzle-orm";

export const EXPORT_ROW_LIMIT = 5000;

export interface CsvDataset {
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  isTruncated: boolean;
  totalFetched: number;
}

/**
 * Dataset 1: brands_analytics.csv (Pages / Brands Tab)
 * Grain: 1 row per tracked Facebook page.
 * Compares latest scan and earliest scan in the selected window for accurate net delta.
 * In lean mode, skips lateral history subqueries.
 */
export async function getBrandsCsvData(
  workspaceId: string,
  rangeDays = 7,
  isLean = true
): Promise<CsvDataset> {
  const deltaHeader = rangeDays === 7 ? "net_delta_7d" : `net_delta_${rangeDays}d`;
  const headers = [
    "brand_name",
    "canonical_domain",
    "page_id",
    "search_type",
    "current_ads",
    deltaHeader,
    "status",
    "is_watchlisted",
    "last_checked_at",
  ];

  const windowDays = Math.max(1, Math.min(30, rangeDays));
  const queryLimit = EXPORT_ROW_LIMIT + 1;

  let query;
  if (isLean) {
    // Lean mode: skips scan_history window comparisons entirely to protect DB egress & CPU
    query = sql`
      SELECT 
        COALESCE(tp.display_name, 'Unknown') AS brand_name,
        COALESCE(tp.canonical_domain, '') AS canonical_domain,
        COALESCE(tp.page_id, '') AS page_id,
        COALESCE(tp.search_type, 'page') AS search_type,
        COALESCE(tp.current_results, 0) AS current_ads,
        0 AS net_delta,
        CASE 
          WHEN COALESCE(tp.current_results, 0) = 0 THEN 'zero_ads'
          ELSE 'active'
        END AS status,
        COALESCE(tp.is_watchlisted, false) AS is_watchlisted,
        tp.last_checked AS last_checked_at
      FROM tracked_pages tp
      WHERE tp.workspace_id = ${workspaceId}::uuid
      ORDER BY tp.current_results DESC NULLS LAST
      LIMIT ${queryLimit};
    `;
  } else {
    // Standard mode: accurate window delta (latest scan in window minus earliest scan in window)
    query = sql`
      SELECT 
        COALESCE(tp.display_name, 'Unknown') AS brand_name,
        COALESCE(tp.canonical_domain, '') AS canonical_domain,
        COALESCE(tp.page_id, '') AS page_id,
        COALESCE(tp.search_type, 'page') AS search_type,
        COALESCE(tp.current_results, 0) AS current_ads,
        COALESCE(window_delta.delta, 0) AS net_delta,
        CASE 
          WHEN COALESCE(tp.current_results, 0) = 0 THEN 'zero_ads'
          WHEN COALESCE(window_delta.delta, 0) > 0 THEN 'scaling'
          WHEN COALESCE(window_delta.delta, 0) < 0 THEN 'descaling'
          ELSE 'stable'
        END AS status,
        COALESCE(tp.is_watchlisted, false) AS is_watchlisted,
        tp.last_checked AS last_checked_at
      FROM tracked_pages tp
      LEFT JOIN LATERAL (
        SELECT 
          (
            (SELECT sh1.results FROM scan_history sh1 WHERE sh1.tracked_page_id = tp.id AND sh1.checked_at >= NOW() - (${windowDays} || ' days')::interval AND sh1.results IS NOT NULL ORDER BY sh1.checked_at DESC LIMIT 1)
            -
            (SELECT sh2.results FROM scan_history sh2 WHERE sh2.tracked_page_id = tp.id AND sh2.checked_at >= NOW() - (${windowDays} || ' days')::interval AND sh2.results IS NOT NULL ORDER BY sh2.checked_at ASC LIMIT 1)
          ) AS delta
      ) window_delta ON true
      WHERE tp.workspace_id = ${workspaceId}::uuid
      ORDER BY tp.current_results DESC NULLS LAST
      LIMIT ${queryLimit};
    `;
  }

  const result = await db.execute(query);
  const rowsArray = result as any[];
  const isTruncated = rowsArray.length > EXPORT_ROW_LIMIT;
  const rawRows = isTruncated ? rowsArray.slice(0, EXPORT_ROW_LIMIT) : rowsArray;

  const rows = rawRows.map((r) => [
    r.brand_name,
    r.canonical_domain,
    r.page_id,
    r.search_type,
    Number(r.current_ads) || 0,
    Number(r.net_delta) || 0,
    r.status,
    Boolean(r.is_watchlisted),
    r.last_checked_at ? new Date(r.last_checked_at).toISOString() : "",
  ]);

  return {
    headers,
    rows,
    isTruncated,
    totalFetched: rawRows.length,
  };
}

/**
 * Dataset 2: products_analytics.csv (Products Tab)
 * Grain: 1 row per scraped_products record.
 * In lean mode, skips the cross-store clone aggregation CTE.
 */
export async function getProductsCsvData(
  workspaceId: string,
  rangeDays = 7,
  isLean = true
): Promise<CsvDataset> {
  const headers = [
    "product_title",
    "domain",
    "category",
    "current_price_tnd",
    "original_price_tnd",
    "discount_percent",
    "store_count",
    "cod_price_tier",
    "is_cloned_trap",
    "product_url",
  ];

  const windowDays = Math.max(1, Math.min(60, rangeDays));
  const queryLimit = EXPORT_ROW_LIMIT + 1;

  let query;
  if (isLean) {
    // Lean mode: query directly without cross-store title grouping CTE
    query = sql`
      SELECT 
        COALESCE(sp.title, 'Untitled') AS product_title,
        COALESCE(sp.domain, '') AS domain,
        COALESCE(NULLIF(sp.category, ''), 'General & Other') AS category,
        NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric AS current_price_num,
        NULLIF(SUBSTRING(REPLACE(sp.original_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric AS original_price_num,
        1 AS store_count,
        sp.url AS product_url
      FROM scraped_products sp
      WHERE sp.workspace_id = ${workspaceId}::uuid
        AND sp.created_at >= NOW() - (${windowDays} || ' days')::interval
      ORDER BY sp.created_at DESC
      LIMIT ${queryLimit};
    `;
  } else {
    // Standard mode: full clone detection CTE across all workspace titles
    query = sql`
      WITH product_store_counts AS (
        SELECT 
          LOWER(TRIM(title)) AS norm_title,
          COUNT(DISTINCT domain) AS store_count
        FROM scraped_products
        WHERE workspace_id = ${workspaceId}::uuid
          AND title IS NOT NULL
          AND length(TRIM(title)) > 0
        GROUP BY LOWER(TRIM(title))
      )
      SELECT 
        COALESCE(sp.title, 'Untitled') AS product_title,
        COALESCE(sp.domain, '') AS domain,
        COALESCE(NULLIF(sp.category, ''), 'General & Other') AS category,
        NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric AS current_price_num,
        NULLIF(SUBSTRING(REPLACE(sp.original_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric AS original_price_num,
        COALESCE(psc.store_count, 1) AS store_count,
        sp.url AS product_url
      FROM scraped_products sp
      LEFT JOIN product_store_counts psc ON LOWER(TRIM(sp.title)) = psc.norm_title
      WHERE sp.workspace_id = ${workspaceId}::uuid
      ORDER BY sp.updated_at DESC
      LIMIT ${queryLimit};
    `;
  }

  const result = await db.execute(query);
  const rowsArray = result as any[];
  const isTruncated = rowsArray.length > EXPORT_ROW_LIMIT;
  const rawRows = isTruncated ? rowsArray.slice(0, EXPORT_ROW_LIMIT) : rowsArray;

  const rows = rawRows.map((r) => {
    const currPrice = r.current_price_num !== null ? Number(r.current_price_num) : null;
    const origPrice = r.original_price_num !== null ? Number(r.original_price_num) : null;
    let discountPct: number | "" = "";
    if (origPrice !== null && currPrice !== null && origPrice > 0 && origPrice > currPrice) {
      discountPct = Math.round(((origPrice - currPrice) / origPrice) * 100);
    }
    const storeCount = Number(r.store_count) || 1;

    let codTier = "";
    if (currPrice !== null) {
      if (currPrice < 30) {
        codTier = "< 30 TND";
      } else if (currPrice < 60) {
        codTier = "30 - 59.99 TND";
      } else if (currPrice < 100) {
        codTier = "60 - 99.99 TND";
      } else {
        codTier = "100+ TND";
      }
    }

    const isClonedTrap = storeCount > 1 && currPrice !== null && currPrice < 30;

    return [
      r.product_title,
      r.domain,
      r.category,
      currPrice !== null ? currPrice : "",
      origPrice !== null ? origPrice : "",
      discountPct !== "" ? discountPct : "",
      storeCount,
      codTier,
      isClonedTrap,
      r.product_url || "",
    ];
  });

  return {
    headers,
    rows,
    isTruncated,
    totalFetched: rawRows.length,
  };
}

/**
 * Dataset 3: category_matrix.csv (Category Velocity & Density)
 * Grain: 1 row per category present in workspace.
 * In lean mode, skips cross-table active ads joining.
 */
export async function getCategoryMatrixCsvData(
  workspaceId: string,
  rangeDays = 7,
  isLean = true
): Promise<CsvDataset> {
  const windowDays = Math.max(1, Math.min(60, rangeDays));
  const newAdsHeader = rangeDays === 7 ? "new_ads_7d_count" : `new_ads_${windowDays}d_count`;
  const headers = [
    "category",
    "product_count",
    "store_count",
    "active_ads_count",
    newAdsHeader,
    "avg_price_tnd",
    "min_price_tnd",
    "max_price_tnd",
  ];

  const queryLimit = EXPORT_ROW_LIMIT + 1;

  let query;
  if (isLean) {
    // Lean mode: skips joining ads table
    query = sql`
      SELECT 
        COALESCE(NULLIF(sp.category, ''), 'General & Other') AS category,
        COUNT(sp.id) AS product_count,
        COUNT(DISTINCT sp.domain) AS store_count,
        ROUND(AVG(CASE WHEN NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric > 0 THEN NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric END), 1) AS avg_price,
        MIN(CASE WHEN NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric > 0 THEN NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric END) AS min_price,
        MAX(CASE WHEN NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric > 0 THEN NULLIF(SUBSTRING(REPLACE(sp.current_price, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric END) AS max_price,
        0 AS active_ads_count,
        0 AS new_ads_window_count
      FROM scraped_products sp
      WHERE sp.workspace_id = ${workspaceId}::uuid
      GROUP BY COALESCE(NULLIF(sp.category, ''), 'General & Other')
      ORDER BY product_count DESC
      LIMIT ${queryLimit};
    `;
  } else {
    // Standard mode: joins ads filtered strictly by active observations
    query = sql`
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
      LIMIT ${queryLimit};
    `;
  }

  const result = await db.execute(query);
  const rowsArray = result as any[];
  const isTruncated = rowsArray.length > EXPORT_ROW_LIMIT;
  const rawRows = isTruncated ? rowsArray.slice(0, EXPORT_ROW_LIMIT) : rowsArray;

  const rows = rawRows.map((r) => [
    r.category,
    Number(r.product_count) || 0,
    Number(r.store_count) || 0,
    Number(r.active_ads_count) || 0,
    Number(r.new_ads_window_count ?? r.new_ads_7d_count) || 0,
    r.avg_price !== null ? Number(r.avg_price) : "",
    r.min_price !== null ? Number(r.min_price) : "",
    r.max_price !== null ? Number(r.max_price) : "",
  ]);

  return {
    headers,
    rows,
    isTruncated,
    totalFetched: rawRows.length,
  };
}

/**
 * Dataset 4: creative_ads_analytics.csv (Ads Tab)
 * Grain: 1 row per active ad.
 * Scoped via latest observation of each ad -> tracked_pages.workspace_id.
 * Excludes ads whose latest observation was inactive (is_active = false).
 * Caption regex checks evaluated directly in PostgreSQL; caption blob is NEVER transferred over the wire.
 */
export async function getAdsCsvData(
  workspaceId: string,
  rangeDays = 7,
  isLean = false
): Promise<CsvDataset> {
  const headers = [
    "ad_id",
    "brand_name",
    "media_type",
    "first_seen_at",
    "days_active",
    "has_arabic",
    "has_french",
    "has_free_delivery",
    "has_discount",
  ];

  const windowDays = Math.max(1, Math.min(60, rangeDays));
  const queryLimit = EXPORT_ROW_LIMIT + 1;

  // Ultra-fast 2-stage CTE:
  // 1. latest_obs deduplicates latest state per ad_id for the workspace window
  // 2. active_ads immediately filters is_active=true and applies LIMIT 5001 BEFORE joining heavy ad caption TOAST tables
  const query = sql`
    WITH latest_obs AS (
      SELECT DISTINCT ON (ao.ad_id)
        ao.ad_id,
        ao.is_active,
        ao.observed_at,
        COALESCE(tp.display_name, 'Unknown') AS brand_name
      FROM ad_observations ao
      INNER JOIN tracked_pages tp ON tp.id = ao.tracked_page_id
      WHERE tp.workspace_id = ${workspaceId}::uuid
        AND ao.observed_at >= NOW() - (${windowDays} || ' days')::interval
      ORDER BY ao.ad_id, ao.observed_at DESC
    ),
    active_ads AS (
      SELECT lo.*
      FROM latest_obs lo
      WHERE lo.is_active = true
      ORDER BY lo.observed_at DESC
      LIMIT ${queryLimit}
    )
    SELECT
      a.ad_archive_id AS ad_id,
      COALESCE(a.page_name, aa.brand_name) AS brand_name,
      COALESCE(a.media_type, 'image') AS media_type,
      a.first_seen_at,
      GREATEST(1, ROUND(EXTRACT(EPOCH FROM (aa.observed_at - COALESCE(a.started_running_on, a.first_seen_at, a.created_at))) / 86400)) AS days_active,
      ${isLean ? sql`''` : sql`LEFT(COALESCE(a.caption, ''), 200)`} AS snippet
    FROM active_ads aa
    INNER JOIN ads a ON a.id = aa.ad_id
    WHERE (a.is_archived = false OR a.is_archived IS NULL)
    ORDER BY aa.observed_at DESC;
  `;

  const result = await db.execute(query);
  const rowsArray = result as any[];
  const isTruncated = rowsArray.length > EXPORT_ROW_LIMIT;
  const rawRows = isTruncated ? rowsArray.slice(0, EXPORT_ROW_LIMIT) : rowsArray;

  // Regex patterns evaluated in high-performance V8 native memory (under 25ms for 5,000 items)
  const ARABIC_REGEX = /[\u0600-\u06FF]/;
  const FRENCH_REGEX = /(livraison|gratuit|promo|commander|prix|solde|offre)/i;
  const FREE_DELIVERY_REGEX = /(livraison gratuite|\u062A\u0648\u0635\u064A\u0644 \u0645\u062C\u0627\u0646\u064A|\u062A\u0648\u0635\u064A\u0644 \u0628\u0644\u0627\u0634|free delivery|livraison 0)/i;
  const DISCOUNT_REGEX = /(remise|\u062A\u062E\u0641\u064A\u0636|\u062E\u0635\u0645|promo|solde|%|\u0639\u0631\u0636)/i;

  const rows = rawRows.map((r) => {
    const s = r.snippet || "";
    return [
      r.ad_id,
      r.brand_name,
      r.media_type,
      r.first_seen_at ? new Date(r.first_seen_at).toISOString() : "",
      Number(r.days_active) || 1,
      isLean ? false : ARABIC_REGEX.test(s),
      isLean ? false : FRENCH_REGEX.test(s),
      isLean ? false : FREE_DELIVERY_REGEX.test(s),
      isLean ? false : DISCOUNT_REGEX.test(s),
    ];
  });

  return {
    headers,
    rows,
    isTruncated,
    totalFetched: rawRows.length,
  };
}
