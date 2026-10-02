import { db } from "@/db";
import {
  trackedPages,
  scanHistory,
  adObservations,
  creativeScans,
  queue,
  discoveredPages,
  activityNotifications,
  scrapedProducts,
} from "@/db/schema";
import { eq, or, sql, and, isNull } from "drizzle-orm";
import { isValidPageId } from "@/lib/utils";
import { getOrCreateBrandDomain, linkPageToDomain, setPrimaryPage } from "@/lib/domain-portfolio";

export interface MergeResult {
  success: boolean;
  message: string;
  mergedPageId?: string;
  isDuplicateMerged?: boolean;
}

/**
 * Links an exact match domain tracked page with a specific Facebook Page ID
 * in a brand domain portfolio without destructively deleting historical tracking.
 */
export async function mergeExactMatchWithPageId(
  exactMatchTrackedPageId: string,
  resolvedPageId: string,
  resolvedDisplayName?: string | null
): Promise<MergeResult> {
  try {
    const cleanPageId = resolvedPageId?.trim() || "";
    if (!isValidPageId(cleanPageId)) {
      return {
        success: false,
        message: `Invalid Page ID format: "${resolvedPageId}". Page ID must be purely numeric (5-25 digits).`,
      };
    }

    // 1. Fetch exact match tracked page
    const exactMatchPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, exactMatchTrackedPageId),
    });

    if (!exactMatchPage) {
      return { success: false, message: "Exact match tracked page not found." };
    }

    const pageCountry = exactMatchPage.country || "TN";
    const newPageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${pageCountry}&view_all_page_id=${cleanPageId}&search_type=page&media_type=all`;
    const preservedDomain =
      exactMatchPage.landingPage ||
      exactMatchPage.displayName ||
      exactMatchPage.url;

    // Resolve or create brand domain record
    let brandDomain = null;
    if (preservedDomain && preservedDomain.includes(".")) {
      try {
        brandDomain = await getOrCreateBrandDomain(
          preservedDomain,
          resolvedDisplayName || exactMatchPage.displayName
        );
      } catch (e) {
        console.warn("[Merge] Could not resolve brand domain for:", preservedDomain, e);
      }
    }

    // 2. Check if a separate target page already exists for this pageId or new URL
    const existingTargetPage = await db.query.trackedPages.findFirst({
      where: or(
        eq(trackedPages.pageId, cleanPageId),
        eq(trackedPages.url, newPageUrl),
        sql`${trackedPages.url} LIKE ${`%view_all_page_id=${cleanPageId}%`}`
      ),
    });

    const now = new Date();

    if (!existingTargetPage || existingTargetPage.id === exactMatchTrackedPageId) {
      // Single record: upgrade exactMatchPage in-place and link to domain portfolio
      const [updatedPage] = await db
        .update(trackedPages)
        .set({
          pageId: cleanPageId,
          searchType: "page",
          url: newPageUrl,
          landingPage: preservedDomain,
          displayName: resolvedDisplayName || exactMatchPage.displayName || preservedDomain,
          status: exactMatchPage.status || "success",
          discoveredPagesCount: 0,
          brandDomainId: brandDomain?.id || exactMatchPage.brandDomainId || null,
          pageRole: "primary",
          canonicalDomain: brandDomain?.domain || exactMatchPage.canonicalDomain || null,
          updatedAt: now,
        })
        .where(eq(trackedPages.id, exactMatchTrackedPageId))
        .returning();

      // Backfill products for this domain
      if (brandDomain) {
        try {
          await db
            .update(scrapedProducts)
            .set({ brandDomainId: brandDomain.id, pageId: cleanPageId, updatedAt: now })
            .where(
              and(
                eq(scrapedProducts.domain, brandDomain.domain),
                isNull(scrapedProducts.brandDomainId)
              )
            );
        } catch (prodErr) {
          console.warn("[Merge] Non-fatal error backfilling scraped_products:", prodErr);
        }
      }

      // Backfill any ads in ad_observations for this tracked page that had page_id = '0' or NULL
      try {
        await db.execute(sql`
          UPDATE ads
          SET page_id = ${cleanPageId},
              page_name = COALESCE(NULLIF(${resolvedDisplayName || null}, ''), page_name),
              updated_at = NOW()
          WHERE (page_id = '0' OR page_id IS NULL OR page_id = '')
            AND id IN (
              SELECT ad_id FROM ad_observations WHERE tracked_page_id = ${exactMatchTrackedPageId}
            )
        `);
      } catch (adErr) {
        console.warn("[Merge] Non-fatal error backfilling ads:", adErr);
      }

      return {
        success: true,
        message: `Successfully linked page to Page ID "${cleanPageId}" under domain portfolio.`,
        mergedPageId: updatedPage.id,
        isDuplicateMerged: false,
      };
    } else {
      // Both records exist: Link BOTH to the same domain portfolio rather than deleting exactMatchPage!
      if (brandDomain) {
        // Link existing target page as primary
        await linkPageToDomain(existingTargetPage.id, brandDomain.id, "primary", {
          forceReassign: true,
        });

        // Link exact match page as satellite or backup domain search
        await linkPageToDomain(exactMatchTrackedPageId, brandDomain.id, "satellite", {
          forceReassign: true,
        });
      }

      // Clear candidate alerts on the exact match page
      await db
        .update(trackedPages)
        .set({
          discoveredPagesCount: 0,
          updatedAt: now,
        })
        .where(eq(trackedPages.id, exactMatchTrackedPageId));

      return {
        success: true,
        message: `Successfully grouped Page "${cleanPageId}" and domain tracking under "${brandDomain?.domain || preservedDomain}".`,
        mergedPageId: existingTargetPage.id,
        isDuplicateMerged: true,
      };
    }
  } catch (error: any) {
    console.error("[Merge] Error in mergeExactMatchWithPageId:", error);
    return {
      success: false,
      message: error.message || "Failed to link pages into domain portfolio.",
    };
  }
}
