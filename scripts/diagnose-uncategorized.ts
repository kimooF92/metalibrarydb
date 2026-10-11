import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db, client } from "../db";
import { scrapedProducts, ads } from "../db/schema";
import { sql } from "drizzle-orm";

async function run() {
  try {
    // 1. Total products
    const totalRes = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN scrape_status = 'failed' THEN 1 END) as failed_scrapes,
        COUNT(CASE WHEN scrape_status = 'success' THEN 1 END) as success_scrapes,
        COUNT(CASE WHEN scrape_status = 'pending' THEN 1 END) as pending_scrapes
      FROM scraped_products
    `);
    console.log("Product totals:", totalRes[0]);

    const subCatCheck = await db.execute(sql`
      SELECT 
        COUNT(CASE WHEN sub_category IS NOT NULL AND sub_category != '' THEN 1 END) as has_sub_cat,
        COUNT(CASE WHEN sub_category IS NULL OR sub_category = '' THEN 1 END) as no_sub_cat
      FROM scraped_products
      WHERE category = 'General & Other'
    `);
    console.log("\nGeneral & Other sub_category status:");
    console.table(subCatCheck);

    const activeScrapeStatusRes = await db.execute(sql`
      SELECT p.scrape_status, COUNT(DISTINCT p.id) as count
      FROM scraped_products p
      INNER JOIN ads a ON a.product_id = p.id AND (a.is_archived = false OR a.is_archived IS NULL)
      WHERE p.title IS NOT NULL AND p.title != ''
        AND (
          p.category IS NULL 
          OR p.category = '' 
          OR LOWER(p.category) = 'uncategorized'
          OR p.category = 'General & Other'
          OR LOWER(p.category) LIKE '%general%'
        )
      GROUP BY p.scrape_status
    `);
    console.log("\nActive Uncategorized by scrape_status:");
    console.table(activeScrapeStatusRes);

    // 2. Categories breakdown
    const catRes = await db.execute(sql`
      SELECT 
        COALESCE(category, '(null)') as category,
        scrape_status,
        COUNT(*) as count
      FROM scraped_products
      GROUP BY category, scrape_status
      ORDER BY count DESC
    `);
    console.log("\nCategory breakdown:");
    console.table(catRes);

    // 3. Products matching criteria:
    // - Uncategorized or General
    // - Not failed scrape (scrape_status != 'failed')
    // - Has valid title
    // - Active (has active ad: ads.is_archived = false OR ads.is_archived IS NULL)
    const activeGeneralItems = await db.execute(sql`
      SELECT 
        p.id,
        p.title,
        p.category,
        p.sub_category,
        p.scrape_status
      FROM scraped_products p
      INNER JOIN ads a ON a.product_id = p.id AND (a.is_archived = false OR a.is_archived IS NULL)
      WHERE p.scrape_status != 'failed'
        AND p.title IS NOT NULL 
        AND p.title != ''
        AND (
          p.category = 'General & Other'
          OR p.sub_category = 'General Merchandise'
          OR p.category IS NULL
        )
      GROUP BY p.id, p.title, p.category, p.sub_category, p.scrape_status
    `);
    console.table(activeGeneralItems);

    // Also check how many non-active products match this just in case
    const inactiveRes = await db.execute(sql`
      SELECT COUNT(DISTINCT p.id) as count
      FROM scraped_products p
      LEFT JOIN ads a ON a.product_id = p.id AND (a.is_archived = false OR a.is_archived IS NULL)
      WHERE p.scrape_status != 'failed'
        AND p.title IS NOT NULL 
        AND p.title != ''
        AND (
          p.category IS NULL 
          OR p.category = '' 
          OR LOWER(p.category) = 'uncategorized'
          OR p.category = 'General & Other'
          OR LOWER(p.category) LIKE '%general%'
        )
        AND a.id IS NULL
    `);
    console.log("\nMatching products that are INACTIVE (no active ads):", inactiveRes[0]?.count);

  } catch (err) {
    console.error("Diagnostic error:", err);
  } finally {
    await client.end();
  }
}

run();
