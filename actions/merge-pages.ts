import { db } from "@/db";
import {
  trackedPages,
  scanHistory,
  adObservations,
  creativeScans,
  queue,
  discoveredPages,
} from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";

export interface MergeResult {
  success: boolean;
  message: string;
  mergedPageId?: string;
  isDuplicateMerged?: boolean;
}

/**
 * Merges an exact match domain tracked page with a specific Facebook Page ID.
 */
export async function mergeExactMatchWithPageId(
  exactMatchTrackedPageId: string,
  resolvedPageId: string,
  resolvedDisplayName?: string | null
): Promise<MergeResult> {
  try {
    const cleanPageId = resolvedPageId.trim();
    if (!cleanPageId) {
      return { success: false, message: "A valid resolved Page ID is required." };
    }

    // 1. Fetch exact match tracked page
    const exactMatchPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, exactMatchTrackedPageId),
    });

    if (!exactMatchPage) {
      return { success: false, message: "Exact match tracked page not found." };
    }

    // Check if exact match page already has this pageId
    if (exactMatchPage.pageId === cleanPageId && exactMatchPage.searchType === "page") {
      return {
        success: true,
        message: "Page is already merged with this Page ID.",
        mergedPageId: exactMatchPage.id,
      };
    }

    const newPageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${cleanPageId}&search_type=page&media_type=all`;
    const preservedDomain =
      exactMatchPage.landingPage ||
      exactMatchPage.displayName ||
      exactMatchPage.url;

    // 2. Check if a separate target page already exists for this pageId or new URL
    const existingTargetPage = await db.query.trackedPages.findFirst({
      where: or(
        eq(trackedPages.pageId, cleanPageId),
        eq(trackedPages.url, newPageUrl)
      ),
    });

    const now = new Date();

    if (!existingTargetPage || existingTargetPage.id === exactMatchTrackedPageId) {
      // Single record upgrade: update exactMatchPage in-place
      const [updatedPage] = await db
        .update(trackedPages)
        .set({
          pageId: cleanPageId,
          searchType: "page",
          url: newPageUrl,
          landingPage: preservedDomain,
          displayName: resolvedDisplayName || exactMatchPage.displayName || preservedDomain,
          status: "pending",
          updatedAt: now,
        })
        .where(eq(trackedPages.id, exactMatchTrackedPageId))
        .returning();

      return {
        success: true,
        message: `Successfully upgraded exact match page to Page ID "${cleanPageId}".`,
        mergedPageId: updatedPage.id,
        isDuplicateMerged: false,
      };
    } else {
      // Duplicate record merge: re-link all child relations to existingTargetPage
      await db
        .update(scanHistory)
        .set({ trackedPageId: existingTargetPage.id })
        .where(eq(scanHistory.trackedPageId, exactMatchTrackedPageId));

      await db
        .update(adObservations)
        .set({ trackedPageId: existingTargetPage.id })
        .where(eq(adObservations.trackedPageId, exactMatchTrackedPageId));

      await db
        .update(creativeScans)
        .set({ trackedPageId: existingTargetPage.id })
        .where(eq(creativeScans.trackedPageId, exactMatchTrackedPageId));

      await db
        .update(queue)
        .set({ trackedPageId: existingTargetPage.id })
        .where(eq(queue.trackedPageId, exactMatchTrackedPageId));

      await db
        .update(discoveredPages)
        .set({ trackedPageId: existingTargetPage.id })
        .where(eq(discoveredPages.trackedPageId, exactMatchTrackedPageId));

      // Update existingTargetPage metadata
      await db
        .update(trackedPages)
        .set({
          landingPage: existingTargetPage.landingPage || preservedDomain,
          displayName:
            resolvedDisplayName || existingTargetPage.displayName || exactMatchPage.displayName,
          updatedAt: now,
        })
        .where(eq(trackedPages.id, existingTargetPage.id));

      // Remove redundant exact match page
      await db
        .delete(trackedPages)
        .where(eq(trackedPages.id, exactMatchTrackedPageId));

      return {
        success: true,
        message: `Successfully merged exact match page into existing Page ID record (${existingTargetPage.displayName || cleanPageId}).`,
        mergedPageId: existingTargetPage.id,
        isDuplicateMerged: true,
      };
    }
  } catch (error: any) {
    console.error("Error in mergeExactMatchWithPageId:", error);
    return {
      success: false,
      message: error.message || "Failed to merge exact match page with Page ID.",
    };
  }
}
