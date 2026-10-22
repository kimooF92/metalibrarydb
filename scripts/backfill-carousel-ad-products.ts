import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { client } from "../db";

async function main() {
  console.log("Linking unlinked products to active carousel ads of the same page...");

  const linked = await client`
    WITH unlinked_prods AS (
      SELECT p.id as product_id, p.page_id
      FROM scraped_products p
      LEFT JOIN ad_products ap ON ap.product_id = p.id
      LEFT JOIN ads a ON a.product_id = p.id
      WHERE ap.id IS NULL AND a.id IS NULL
        AND p.page_id IS NOT NULL
        AND p.scrape_status NOT IN ('deleted', 'ignored')
    ),
    page_carousel_ads AS (
      SELECT DISTINCT ON (page_id)
        id as ad_id,
        page_id
      FROM ads
      WHERE media_type = 'carousel'
        AND (is_archived = false OR is_archived IS NULL)
      ORDER BY page_id, started_running_on DESC NULLS LAST, created_at DESC
    )
    INSERT INTO ad_products (ad_id, product_id, is_primary, card_index)
    SELECT pca.ad_id, up.product_id, false, 1
    FROM unlinked_prods up
    JOIN page_carousel_ads pca ON pca.page_id = up.page_id
    ON CONFLICT ("ad_id", "product_id") DO NOTHING;
  `;

  console.log("Linked products:", linked.count || 0);

  // Re-check recent products breakdown
  const stats = await client`
    WITH prod_ads AS (
      SELECT 
        p.id,
        COUNT(DISTINCT ap.ad_id) as ad_products_count,
        COUNT(DISTINCT CASE WHEN a.is_archived = false OR a.is_archived IS NULL THEN ap.ad_id END) as active_ads
      FROM scraped_products p
      LEFT JOIN ad_products ap ON ap.product_id = p.id
      LEFT JOIN ads a ON a.id = ap.ad_id
      WHERE p.created_at >= '2026-10-22 16:50:00+00'
        AND p.scrape_status NOT IN ('deleted', 'ignored')
      GROUP BY p.id
    )
    SELECT 
      COUNT(*) as valid_recent_products,
      COUNT(CASE WHEN active_ads > 0 THEN 1 END) as has_active_ads,
      COUNT(CASE WHEN active_ads = 0 THEN 1 END) as zero_active_ads
    FROM prod_ads;
  `;
  console.log("Recent products breakdown after complete link:", stats);

  process.exit(0);
}

main();
