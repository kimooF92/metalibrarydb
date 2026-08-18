import { db } from "@/db";
import { ads, adObservations, trackedPages } from "@/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";

export interface ReconciliationOptions {
  isVerifiedZeroState?: boolean;
  isFullScan?: boolean;
}

/**
 * Reconciles missing ads after a FULL PAGE scan.
 * If an ad was previously observed for this tracked page, but is MISSING from the current full scan,
 * it means the advertiser has turned it off.
 * This function marks the ad as archived (`isArchived = true`, `archivedAt = now`) and sets `isActive = false`.
 * NOTE: This function MUST ONLY be called for Full Page Scans on official Meta Page ID targets.
 */
export async function reconcileArchivedAds(
  trackedPageId: string,
  creativeScanId: string,
  currentlyObservedAdArchiveIds: Set<string>,
  now: Date = new Date(),
  options: ReconciliationOptions = {}
): Promise<{ archivedCount: number }> {
  let archivedCount = 0;

  try {
    // 0. Safeguard: Only run auto-archival for official Meta Page targets
    const trackedPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, trackedPageId),
      columns: { id: true, searchType: true, pageId: true, displayName: true, currentResults: true },
    });

    const isPageTarget = Boolean(
      trackedPage && (
        trackedPage.searchType === "page" ||
        (trackedPage.pageId && trackedPage.pageId !== "0" && !trackedPage.pageId.includes(" "))
      )
    );

    if (!isPageTarget) {
      console.log(
        `[Ad Reconciliation] ⚠️ Skipped archival: Tracked page ${trackedPageId} ("${trackedPage?.displayName || "unknown"}") is not an official Page target (searchType="${trackedPage?.searchType || "none"}", pageId="${trackedPage?.pageId || "none"}").`
      );
      return { archivedCount: 0 };
    }

    // 1. Fetch distinct ad IDs observed for this tracked page
    const previousObservations = await db.query.adObservations.findMany({
      where: eq(adObservations.trackedPageId, trackedPageId),
      columns: { adId: true },
    });

    const obsAdIds = Array.from(new Set(previousObservations.map((o) => o.adId)));

    // 2. Efficiently fetch canonical ads associated with this page that are currently ACTIVE (isArchived = false)
    const adConditions = [eq(ads.isArchived, false)];
    const targetMatchers = [];
    if (obsAdIds.length > 0) {
      targetMatchers.push(inArray(ads.id, obsAdIds));
    }
    if (trackedPage?.pageId && trackedPage.pageId !== "0") {
      targetMatchers.push(eq(ads.pageId, trackedPage.pageId));
    }

    if (targetMatchers.length === 0) {
      return { archivedCount: 0 };
    }

    if (targetMatchers.length === 1) {
      adConditions.push(targetMatchers[0]);
    } else {
      adConditions.push(or(...targetMatchers)!);
    }

    const activeAds = await db.query.ads.findMany({
      where: and(...adConditions),
      columns: { id: true, adArchiveId: true },
    });

    const previousActiveCount = activeAds.length;
    if (previousActiveCount === 0) {
      return { archivedCount: 0 };
    }

    // 3. Drop-rate & Zero-State Safeguards
    const observedCount = currentlyObservedAdArchiveIds.size;

    if (observedCount === 0) {
      if (!options.isVerifiedZeroState) {
        console.warn(
          `[Ad Reconciliation] ⚠️ Skipped 0-ad archival: 0 ads observed for ${trackedPage?.displayName || trackedPageId}, but isVerifiedZeroState flag is false.`
        );
        return { archivedCount: 0 };
      }
    } else if (!options.isFullScan) {
      // For automated background scans that are not verified full scans, check drop-rate
      const expectedCount = trackedPage?.currentResults || previousActiveCount;
      const threshold = Math.min(previousActiveCount, expectedCount) * 0.7;
      if (observedCount < threshold && observedCount < 5) {
        console.warn(
          `[Ad Reconciliation] ⚠️ Skipped archival: Scan captured ${observedCount} ads, which is below the threshold (${threshold}). Scan appears incomplete.`
        );
        return { archivedCount: 0 };
      }
    }

    // 4. Filter down to active ads missing from the current full scan
    const adsToArchive = activeAds.filter(
      (ad) => !currentlyObservedAdArchiveIds.has(ad.adArchiveId)
    );

    if (adsToArchive.length === 0) {
      return { archivedCount: 0 };
    }

    const adIdsToArchive = adsToArchive.map((a) => a.id);

    // 5. Batch update canonical ads to archived status in a single query
    await db
      .update(ads)
      .set({ isArchived: true, archivedAt: now, updatedAt: now })
      .where(inArray(ads.id, adIdsToArchive));

    // 6. Update or insert observations for this scan and mark previous observations as inactive
    for (const adId of adIdsToArchive) {
      // Ensure all observations for this archived ad are marked inactive
      await db
        .update(adObservations)
        .set({ isActive: false, duplicationCount: 0 })
        .where(eq(adObservations.adId, adId));

      const existingObs = await db.query.adObservations.findFirst({
        where: and(
          eq(adObservations.creativeScanId, creativeScanId),
          eq(adObservations.adId, adId)
        ),
      });

      if (!existingObs) {
        await db.insert(adObservations).values({
          creativeScanId,
          adId,
          trackedPageId,
          isActive: false,
          duplicationCount: 0,
          observedAt: now,
        });
      }
    }

    archivedCount = adIdsToArchive.length;

    if (archivedCount > 0) {
      console.log(
        `[Ad Reconciliation] 📦 Archived ${archivedCount} turned-off ad(s) for tracked page ${trackedPage?.displayName || trackedPageId}.`
      );
    }
  } catch (error) {
    console.error("[Ad Reconciliation] Error reconciling archived ads:", error);
  }

  return { archivedCount };
}

