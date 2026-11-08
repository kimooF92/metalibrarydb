import { db } from "../../db";
import { scrapedProducts } from "../../db/schema";
import { and, isNotNull, sql } from "drizzle-orm";

/**
 * Ephemeral Payload Purge Routine
 * Prunes rawExtract JSON payloads older than 48 hours to preserve database storage limits.
 */
export async function purgeOldRawExtracts(): Promise<number> {
  try {
    // 1. Immediately purge any rawExtract on failed, ignored, or deleted products
    await db
      .update(scrapedProducts)
      .set({ rawExtract: null })
      .where(
        and(
          isNotNull(scrapedProducts.rawExtract),
          sql`${scrapedProducts.scrapeStatus} IN ('failed', 'ignored', 'deleted')`
        )
      );

    // 2. Purge successful rawExtract payloads older than 48 hours based on extraction time
    const res = await db
      .update(scrapedProducts)
      .set({ rawExtract: null })
      .where(
        and(
          isNotNull(scrapedProducts.rawExtract),
          sql`COALESCE(${scrapedProducts.lastScrapedAt}, ${scrapedProducts.createdAt}) < NOW() - INTERVAL '48 hours'`
        )
      );
    return (res as any)?.count ?? (Array.isArray(res) ? res.length : 0);
  } catch (err: any) {
    console.warn("[DB Maintenance] Failed to purge old rawExtracts:", err?.message || err);
    return 0;
  }
}
