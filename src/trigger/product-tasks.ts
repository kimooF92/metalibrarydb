import { task, logger } from "@trigger.dev/sdk";
import { db } from "../../db";
import { scrapedProducts, trackedPages, brandDomains, ads, queue } from "../../db/schema";
import { eq, or, sql } from "drizzle-orm";
import { normalizeProductUrl, isCategoryUrl } from "../../lib/firecrawl";
import { getCleanDomain, isValidPageId } from "../../lib/utils";
import { processProductExtraction } from "../../lib/product-ingest";
import { isGeoBlockedOrForbiddenError } from "../../lib/product-validator";

export interface ExtractProductPayload {
  url: string;
  productId?: string | null;
  pageId?: string | null;
  adId?: string | null;
  adCopy?: string | null;
  workspaceId?: string | null;
}

/**
 * Task: extractProductTask
 * Asynchronously extracts e-commerce product landing pages:
 * HTML scraping, DOM parsing, price/pixel/phone extraction, and JEV classification.
 * Runs on medium-1x (1 vCPU, 2 GB RAM) in Trigger.dev Cloud.
 */
export const extractProductTask = task({
  id: "extract-product",
  machine: "medium-1x",
  queue: {
    concurrencyLimit: 5,
  },
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 3000,
  },
  maxDuration: 120, // 2 minutes ceiling for slow landing pages
  onFailure: async ({ payload, error }: any) => {
    const errMessage = (error as any)?.message || String(error) || "trigger_task_failed";
    const isGeo403 = isGeoBlockedOrForbiddenError(errMessage);
    logger.error(`[extract-product] onFailure hook triggered: ${errMessage}`, { payload, isGeo403 });
    try {
      const url = payload?.url;
      const productId = payload?.productId;
      const effectiveStatus = isGeo403 ? "pending" : "failed";
      const effectiveReason = isGeo403
        ? `[Geo 403 Forbidden] Trigger.dev task blocked (${errMessage}) - Queued for local worker residential fallback`
        : errMessage;

      if (productId) {
        await db
          .update(scrapedProducts)
          .set({
            scrapeStatus: effectiveStatus,
            failureReason: effectiveReason,
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, productId));

        if (isGeo403) {
          await db
            .insert(queue)
            .values({
              jobType: "product_scrape",
              status: "pending",
              priority: 9,
              failureReason: `product:${productId}`,
              workspaceId: payload?.workspaceId || null,
            })
            .onConflictDoNothing();
        }
      } else if (url) {
        const normalized = normalizeProductUrl(url);
        if (normalized) {
          const [updated] = await db
            .update(scrapedProducts)
            .set({
              scrapeStatus: effectiveStatus,
              failureReason: effectiveReason,
              updatedAt: new Date(),
            })
            .where(eq(scrapedProducts.url, normalized))
            .returning({ id: scrapedProducts.id, workspaceId: scrapedProducts.workspaceId });

          if (isGeo403 && updated?.id) {
            await db
              .insert(queue)
              .values({
                jobType: "product_scrape",
                status: "pending",
                priority: 9,
                failureReason: `product:${updated.id}`,
                workspaceId: updated.workspaceId || payload?.workspaceId || null,
              })
              .onConflictDoNothing();
          }
        }
      }
    } catch (dbErr: any) {
      logger.error(`[extract-product] Failed to write failure state to DB: ${dbErr?.message}`);
    }
  },
  run: async (payload: ExtractProductPayload) => {
    const { url, productId: incomingProductId, pageId: incomingPageId, workspaceId, adCopy, adId } = payload;

    if (!url || typeof url !== "string") {
      logger.warn("[extract-product] Missing or invalid URL in payload", { payload });
      return { success: false, error: "Missing required 'url' in payload" };
    }

    const normalizedUrl = normalizeProductUrl(url);
    if (!normalizedUrl) {
      logger.warn(`[extract-product] Invalid product URL format: ${url}`);
      return { success: false, error: "Invalid product URL format" };
    }

    // Never scrape category or collection listing URLs
    if (isCategoryUrl(url) || isCategoryUrl(normalizedUrl)) {
      logger.info(`[extract-product] Category URL ignored: ${normalizedUrl}`);
      if (incomingProductId) {
        await db
          .update(scrapedProducts)
          .set({
            scrapeStatus: "ignored",
            failureReason: "Category URL ignored - not a product page",
            lastScrapedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scrapedProducts.id, incomingProductId));
      }
      return { success: true, status: "ignored" };
    }

    const cleanDomain = getCleanDomain(normalizedUrl);

    // 0. Resolve canonical pageId, workspaceId, and brandDomainId
    let resolvedPageId = isValidPageId(incomingPageId) ? incomingPageId! : null;
    let resolvedWorkspaceId = workspaceId || null;
    let resolvedBrandDomainId: string | null = null;

    if (resolvedPageId) {
      const pageRec = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.pageId, resolvedPageId),
        columns: { workspaceId: true, brandDomainId: true },
      });
      if (pageRec?.workspaceId && !resolvedWorkspaceId) {
        resolvedWorkspaceId = pageRec.workspaceId;
      }
      if (pageRec?.brandDomainId) {
        resolvedBrandDomainId = pageRec.brandDomainId;
      }
    }

    // If pageId was not explicitly passed, inspect ads with matching linkUrl
    if (!resolvedPageId) {
      const matchingAd = await db.query.ads.findFirst({
        where: or(
          eq(ads.linkUrl, normalizedUrl),
          sql`LOWER(TRIM(TRAILING '/' FROM SPLIT_PART(${ads.linkUrl}, '?', 1))) = LOWER(${normalizedUrl.replace(/\/+$/, "")})`
        ),
        columns: { pageId: true },
      });
      if (matchingAd?.pageId && isValidPageId(matchingAd.pageId)) {
        resolvedPageId = matchingAd.pageId;
        const pageRec = await db.query.trackedPages.findFirst({
          where: eq(trackedPages.pageId, resolvedPageId),
          columns: { workspaceId: true, brandDomainId: true },
        });
        if (pageRec?.workspaceId && !resolvedWorkspaceId) {
          resolvedWorkspaceId = pageRec.workspaceId;
        }
        if (pageRec?.brandDomainId && !resolvedBrandDomainId) {
          resolvedBrandDomainId = pageRec.brandDomainId;
        }
      }
    }

    // Check brandDomains by cleanDomain
    if (cleanDomain) {
      const bd = await db.query.brandDomains.findFirst({
        where: sql`lower(${brandDomains.domain}) = ${cleanDomain.toLowerCase()}`,
        columns: { id: true, workspaceId: true },
      });
      if (bd) {
        if (!resolvedBrandDomainId) resolvedBrandDomainId = bd.id;
        if (!resolvedWorkspaceId && bd.workspaceId) resolvedWorkspaceId = bd.workspaceId;
      }
    }

    // 1. Resolve or verify product record
    let targetProductId = incomingProductId;

    if (!targetProductId) {
      const [existing] = await db
        .select({
          id: scrapedProducts.id,
          scrapeStatus: scrapedProducts.scrapeStatus,
          pageId: scrapedProducts.pageId,
          brandDomainId: scrapedProducts.brandDomainId,
          domain: scrapedProducts.domain,
        })
        .from(scrapedProducts)
        .where(eq(scrapedProducts.url, normalizedUrl))
        .limit(1);

      if (existing) {
        if (existing.scrapeStatus === "success" || existing.scrapeStatus === "ignored") {
          logger.info(`[extract-product] Product ${existing.id} already completed or ignored.`);
          return {
            success: true,
            status: existing.scrapeStatus,
            productId: existing.id,
          };
        }
        targetProductId = existing.id;
      }
    }

    if (!targetProductId) {
      // Create pending record
      const [created] = await db
        .insert(scrapedProducts)
        .values({
          url: normalizedUrl,
          domain: cleanDomain,
          pageId: resolvedPageId,
          workspaceId: resolvedWorkspaceId,
          brandDomainId: resolvedBrandDomainId,
          scrapeStatus: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: scrapedProducts.id });

      if (created) {
        targetProductId = created.id;
      } else {
        const [refetched] = await db
          .select({ id: scrapedProducts.id })
          .from(scrapedProducts)
          .where(eq(scrapedProducts.url, normalizedUrl))
          .limit(1);
        targetProductId = refetched?.id || null;
      }
    }

    if (!targetProductId) {
      logger.error(`[extract-product] Failed to resolve or insert product record for ${normalizedUrl}`);
      return { success: false, error: "Failed to resolve product record" };
    }

    // 2. Execute product extraction
    logger.info(`[extract-product] Starting extraction for product: ${targetProductId} (${normalizedUrl})`);
    const result = await processProductExtraction(targetProductId, normalizedUrl, {
      workspaceId: resolvedWorkspaceId,
      adCopy,
      pageId: resolvedPageId,
    });

    logger.info(`[extract-product] Finished extraction for ${targetProductId}: ${result.status}`, { result });

    if (result.status === "pending" && result.error?.includes("[Geo 403 Forbidden]")) {
      logger.warn(`[extract-product] Product ${targetProductId} encountered Geo 403. Handed off to local worker fallback.`, {
        productId: targetProductId,
        url: normalizedUrl,
        error: result.error,
      });
      return {
        success: true,
        status: "handed_off_to_local_worker",
        productId: targetProductId,
        error: result.error,
      };
    }

    return {
      success: result.success,
      status: result.status,
      productId: targetProductId,
      error: result.error,
    };
  },
});
