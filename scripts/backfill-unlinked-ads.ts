import { db } from "@/db";
import { sql } from "drizzle-orm";
import { deleteByPrefix } from "@/lib/cache-service";

async function main() {
  console.log("Starting instant set-based auto-link backfill for unlinked ads...");
  const startTime = Date.now();

  // Atomic set-based update using DISTINCT ON to avoid multiple product matches
  const result = await db.execute(sql`
    WITH matched AS (
      SELECT DISTINCT ON (a.id)
        a.id AS ad_id,
        p.id AS product_id
      FROM ads a
      JOIN scraped_products p ON (
        LOWER(TRIM(TRAILING '/' FROM SPLIT_PART(a.link_url, '?', 1))) = LOWER(TRIM(TRAILING '/' FROM p.url))
      )
      WHERE a.product_id IS NULL
        AND a.link_url IS NOT NULL
      ORDER BY a.id, p.created_at DESC
    )
    UPDATE ads
    SET product_id = matched.product_id,
        updated_at = NOW()
    FROM matched
    WHERE ads.id = matched.ad_id
    RETURNING ads.id;
  `);

  const duration = Date.now() - startTime;
  console.log(`✅ Backfill complete in ${duration}ms! Linked ${result.length} ads to their existing products.`);

  // Invalidate ad feed caches across all workspaces
  await deleteByPrefix("cache:spy_ads:").catch(() => {});
  console.log("Invalidated spy_ads cache prefix.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill error:", err);
  process.exit(1);
});

