/**
 * worker/discovery-enricher.ts
 *
 * Decoupled Ephemeral Discovery Product Preview Enricher.
 * Operates completely outside the Playwright browser session.
 * Features:
 * - Atomic lease claiming (`preview_scrape_status = 'processing'`)
 * - Cross-page URL deduplication (multiple candidate pages sharing a domain/link = 1 scrape)
 * - Micro-batching (concurrency = 3, bounded batches of 25)
 * - 3.5s shared monotonic deadline per URL
 * - SSRF-safe direct HTML scraping ($0 cost)
 * - Quality validation filter (rejection of generic placeholders, 0 DT, or imageless results)
 * - Safe conditional writes (protecting against overwriting user-ignored or merged pages)
 * - Heartbeat pulsing to keep worker healthy
 */

import { db } from "../db";
import { discoveredPages } from "../db/schema";
import { eq, and, or, sql, inArray } from "drizzle-orm";
import { selectBestProductCandidateUrl } from "../lib/discovery-product-selector";
import { scrapeProductDirectHtml } from "../lib/html-scraper";
import { validatePreviewQuality } from "../lib/preview-validator";

export async function enrichDiscoveredPagesForRun(
  runId: string,
  pulseHeartbeat?: () => Promise<void>
): Promise<{ enrichedCount: number; failedCount: number; noProductCount: number }> {
  let enrichedCount = 0;
  let failedCount = 0;
  let noProductCount = 0;

  console.log(`[Discovery Enricher] Starting product enrichment for run: ${runId}`);

  while (true) {
    // 1. Atomically claim a bounded batch using a lease mechanism (limit 25)
    // Selects candidate IDs that are pending OR have an expired processing lease (> 5 minutes old)
    const pendingIds = await db
      .select({ id: discoveredPages.id })
      .from(discoveredPages)
      .where(
        and(
          eq(discoveredPages.runId, runId),
          or(
            eq(discoveredPages.previewScrapeStatus, "pending"),
            and(
              eq(discoveredPages.previewScrapeStatus, "processing"),
              sql`${discoveredPages.updatedAt} < NOW() - INTERVAL '5 minutes'`
            )
          ),
          sql`${discoveredPages.status} NOT IN ('imported', 'ignored')`
        )
      )
      .limit(25);

    if (pendingIds.length === 0) break;

    const idsToClaim = pendingIds.map((p) => p.id);

    const claimedRows = await db
      .update(discoveredPages)
      .set({
        previewScrapeStatus: "processing",
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(discoveredPages.id, idsToClaim),
          or(
            eq(discoveredPages.previewScrapeStatus, "pending"),
            and(
              eq(discoveredPages.previewScrapeStatus, "processing"),
              sql`${discoveredPages.updatedAt} < NOW() - INTERVAL '5 minutes'`
            )
          ),
          sql`${discoveredPages.status} NOT IN ('imported', 'ignored')`
        )
      )
      .returning({
        id: discoveredPages.id,
        sampleUrls: discoveredPages.sampleUrls,
        previewScrapeAttempts: discoveredPages.previewScrapeAttempts,
        country: discoveredPages.country,
      });

    if (claimedRows.length === 0) break;

    // 2. Build URL Deduplication Map
    const urlToPageIds = new Map<string, string[]>();
    const pageToSource = new Map<string, "product_page" | "homepage_fallback">();
    const unresolvablePageIds: string[] = [];

    for (const candidate of claimedRows) {
      const selection = selectBestProductCandidateUrl(candidate.sampleUrls || []);
      if (!selection) {
        unresolvablePageIds.push(candidate.id);
        continue;
      }

      pageToSource.set(candidate.id, selection.source);
      const existing = urlToPageIds.get(selection.url) || [];
      existing.push(candidate.id);
      urlToPageIds.set(selection.url, existing);
    }

    if (unresolvablePageIds.length > 0) {
      noProductCount += unresolvablePageIds.length;
      await db
        .update(discoveredPages)
        .set({
          previewScrapeStatus: "no_product",
          previewSource: "none",
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(discoveredPages.id, unresolvablePageIds),
            eq(discoveredPages.previewScrapeStatus, "processing")
          )
        );
    }

    // 3. Process Unique URLs in Micro-Batches of 3 (Concurrency = 3)
    const uniqueUrls = Array.from(urlToPageIds.keys());
    const CHUNK_SIZE = 3;

    for (let i = 0; i < uniqueUrls.length; i += CHUNK_SIZE) {
      const chunk = uniqueUrls.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (targetUrl) => {
          const associatedPageIds = urlToPageIds.get(targetUrl) || [];
          if (associatedPageIds.length === 0) return;

          try {
            // Absolute shared deadline of 3.5s per target URL
            const res = await scrapeProductDirectHtml(targetUrl, 3500);

            if (res.success && res.data) {
              const quality = validatePreviewQuality(res.data);

              if (quality.isValid) {
                enrichedCount += associatedPageIds.length;

                for (const pageId of associatedPageIds) {
                  const source = pageToSource.get(pageId) ?? "product_page";
                  const isHomepage = source === "homepage_fallback";

                  await db
                    .update(discoveredPages)
                    .set({
                      // If homepage fallback, previewProductUrl is null so UI disallows product auto-promotion
                      previewProductUrl: isHomepage ? null : targetUrl,
                      previewProductTitle: quality.cleanTitle,
                      previewProductImage: quality.imageUrl,
                      previewProductPrice: quality.cleanPrice ?? null,
                      previewProductCurrency: res.data.currency || "TND",
                      previewSource: source,
                      previewScrapeStatus: "scraped",
                      previewScrapedAt: new Date(),
                      updatedAt: new Date(),
                    })
                    .where(
                      and(
                        eq(discoveredPages.id, pageId),
                        eq(discoveredPages.previewScrapeStatus, "processing"),
                        sql`${discoveredPages.status} NOT IN ('imported', 'ignored')`
                      )
                    );
                }
                return;
              }
            }

            // Quality filter or scrape failed
            failedCount += associatedPageIds.length;
            await db
              .update(discoveredPages)
              .set({
                previewScrapeStatus: "failed",
                previewScrapeAttempts: sql`${discoveredPages.previewScrapeAttempts} + 1`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  inArray(discoveredPages.id, associatedPageIds),
                  eq(discoveredPages.previewScrapeStatus, "processing"),
                  sql`${discoveredPages.status} NOT IN ('imported', 'ignored')`
                )
              );
          } catch (err) {
            failedCount += associatedPageIds.length;
            await db
              .update(discoveredPages)
              .set({
                previewScrapeStatus: "failed",
                previewScrapeAttempts: sql`${discoveredPages.previewScrapeAttempts} + 1`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  inArray(discoveredPages.id, associatedPageIds),
                  eq(discoveredPages.previewScrapeStatus, "processing"),
                  sql`${discoveredPages.status} NOT IN ('imported', 'ignored')`
                )
              );
          }
        })
      );

      if (pulseHeartbeat) {
        await pulseHeartbeat().catch(() => {});
      }
    }
  }

  console.log(
    `[Discovery Enricher] Finished run ${runId}: Enriched: ${enrichedCount} | No Product: ${noProductCount} | Failed: ${failedCount}`
  );

  return { enrichedCount, failedCount, noProductCount };
}
