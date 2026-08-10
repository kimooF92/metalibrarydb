import { db } from "@/db";
import { ads, adObservations, trackedPages } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export interface ReconciliationOptions {
  isVerifiedZeroState?: boolean;
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
    // 0. Safeguard: Only run auto-archival for official Meta Page ID targets (searchType === 'page')
    const trackedPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, trackedPageId),
      columns: { id: true, searchType: true, pageId: true, displayName: true },
    });

    if (!trackedPage || trackedPage.searchType !== "page") {
      console.log(
        `[Ad Reconciliation] ⚠️ Skipped archival: Tracked page ${trackedPageId} ("${trackedPage?.displayName || "unknown"}") is not an official Page ID target (searchType="${trackedPage?.searchType || "none"}").`
      );
      return { archivedCount: 0 };
    }

    // 1. Fetch distinct ad IDs observed for this tracked page
    const previousObservations = await db.query.adObservations.findMany({
      where: eq(adObservations.trackedPageId, trackedPageId),
      columns: { adId: true },
    });

    if (previousObservations.length === 0) {
      return { archivedCount: 0 };
    }

    const previousAdIds = Array.from(new Set(previousObservations.map((o) => o.adId)));

    // 2. Efficiently fetch ONLY canonical ads that are currently ACTIVE (isArchived = false)
    const activeAds = await db.query.ads.findMany({
      where: and(
        inArray(ads.id, previousAdIds),
        eq(ads.isArchived, false)
      ),
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
          `[Ad Reconciliation] ⚠️ Skipped 0-ad archival: 0 ads observed for ${trackedPage.displayName}, but isVerifiedZeroState flag is false.`
        );
        return { archivedCount: 0 };
      }
    } else {
      // If current scan captured < 70% of previously active ads, treat as incomplete/truncated scan and skip archival
      const threshold = previousActiveCount * 0.7;
      if (observedCount < threshold) {
        console.warn(
          `[Ad Reconciliation] ⚠️ Skipped archival: Scan captured ${observedCount} ads, which is below the 70% threshold of previously active count (${previousActiveCount}). Scan appears incomplete.`
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

    // 6. Update or insert observations for this scan
    for (const adId of adIdsToArchive) {
      const existingObs = await db.query.adObservations.findFirst({
        where: and(
          eq(adObservations.creativeScanId, creativeScanId),
          eq(adObservations.adId, adId)
        ),
      });

      if (existingObs) {
        await db
          .update(adObservations)
          .set({ isActive: false, duplicationCount: 0 })
          .where(eq(adObservations.id, existingObs.id));
      } else {
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
        `[Ad Reconciliation] 📦 Archived ${archivedCount} turned-off ad(s) for tracked page ${trackedPage.displayName || trackedPageId}.`
      );
    }
  } catch (error) {
    console.error("[Ad Reconciliation] Error reconciling archived ads:", error);
  }

  return { archivedCount };
}

