import { db } from "@/db";
import { ads, adObservations } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Reconciles missing ads after a FULL PAGE scan.
 * If an ad was previously observed for this tracked page, but is MISSING from the current full scan,
 * it means the advertiser has turned it off.
 * This function marks the ad as archived (`isArchived = true`, `archivedAt = now`) and sets `isActive = false`.
 * NOTE: This function MUST ONLY be called for Full Page Scans, NEVER for Delta Scans.
 */
export async function reconcileArchivedAds(
  trackedPageId: string,
  creativeScanId: string,
  currentlyObservedAdArchiveIds: Set<string>,
  now: Date = new Date()
): Promise<{ archivedCount: number }> {
  let archivedCount = 0;

  try {
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

    if (activeAds.length === 0) {
      return { archivedCount: 0 };
    }

    // 3. Filter down to active ads missing from the current full scan
    const adsToArchive = activeAds.filter(
      (ad) => !currentlyObservedAdArchiveIds.has(ad.adArchiveId)
    );

    if (adsToArchive.length === 0) {
      return { archivedCount: 0 };
    }

    const adIdsToArchive = adsToArchive.map((a) => a.id);

    // 4. Batch update canonical ads to archived status in a single query
    await db
      .update(ads)
      .set({ isArchived: true, archivedAt: now, updatedAt: now })
      .where(inArray(ads.id, adIdsToArchive));

    // 5. Update or insert observations for this scan
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
        `[Ad Reconciliation] 📦 Archived ${archivedCount} turned-off ad(s) for tracked page ${trackedPageId}.`
      );
    }
  } catch (error) {
    console.error("[Ad Reconciliation] Error reconciling archived ads:", error);
  }

  return { archivedCount };
}

