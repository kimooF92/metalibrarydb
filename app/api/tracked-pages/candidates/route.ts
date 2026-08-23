import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  discoveredPages,
  trackedPages,
  adObservations,
  ads,
  activityNotifications,
} from "@/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { isValidPageId } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const trackedPageId = searchParams.get("trackedPageId");

    if (!trackedPageId) {
      return NextResponse.json(
        { error: "trackedPageId is required" },
        { status: 400 }
      );
    }

    const trackedPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, trackedPageId),
    });

    if (!trackedPage) {
      return NextResponse.json(
        { error: "Tracked page not found" },
        { status: 404 }
      );
    }

    // Map to aggregate candidate pages by numeric pageId
    const candidateMap = new Map<
      string,
      {
        id: string;
        pageId: string;
        displayName: string | null;
        matchingAdCount: number;
        sampleCtas: Set<string>;
        sampleUrls: Set<string>;
        sampleAdArchiveIds: Set<string>;
        createdAt: Date;
        status: string;
      }
    >();

    // 1. Source A: Extract candidates from observed ads for this tracked page
    const adRows = await db
      .select({
        pageId: ads.pageId,
        pageName: ads.pageName,
        ctaText: ads.ctaText,
        linkUrl: ads.linkUrl,
        adArchiveId: ads.adArchiveId,
        firstSeenAt: ads.firstSeenAt,
      })
      .from(adObservations)
      .innerJoin(ads, eq(adObservations.adId, ads.id))
      .where(eq(adObservations.trackedPageId, trackedPageId));

    for (const row of adRows) {
      if (!isValidPageId(row.pageId)) continue;
      const pid = row.pageId.trim();
      let cand = candidateMap.get(pid);
      if (!cand) {
        cand = {
          id: `cand_${pid}`,
          pageId: pid,
          displayName: row.pageName?.trim() || null,
          matchingAdCount: 0,
          sampleCtas: new Set<string>(),
          sampleUrls: new Set<string>(),
          sampleAdArchiveIds: new Set<string>(),
          createdAt: row.firstSeenAt || new Date(),
          status: "discovered",
        };
        candidateMap.set(pid, cand);
      }
      cand.matchingAdCount++;
      if (row.pageName && (!cand.displayName || cand.displayName.startsWith("Page "))) {
        cand.displayName = row.pageName.trim();
      }
      if (row.ctaText?.trim()) cand.sampleCtas.add(row.ctaText.trim());
      if (row.linkUrl?.trim()) cand.sampleUrls.add(row.linkUrl.trim());
      if (row.adArchiveId?.trim()) cand.sampleAdArchiveIds.add(row.adArchiveId.trim());
    }

    // 2. Source B: Extract candidates from activity notifications (multi_page_detected)
    const notifs = await db.query.activityNotifications.findMany({
      where: and(
        eq(activityNotifications.trackedPageId, trackedPageId),
        eq(activityNotifications.type, "multi_page_detected")
      ),
      orderBy: [desc(activityNotifications.createdAt)],
    });

    for (const notif of notifs) {
      const meta = notif.metadata as {
        candidates?: Array<{ pageId: string; pageName?: string | null; adCount?: number }>;
      } | null;
      if (meta?.candidates && Array.isArray(meta.candidates)) {
        for (const item of meta.candidates) {
          if (!isValidPageId(item.pageId)) continue;
          const pid = item.pageId.trim();
          let cand = candidateMap.get(pid);
          if (!cand) {
            cand = {
              id: `cand_${pid}`,
              pageId: pid,
              displayName: item.pageName?.trim() || null,
              matchingAdCount: item.adCount || 0,
              sampleCtas: new Set<string>(),
              sampleUrls: new Set<string>(),
              sampleAdArchiveIds: new Set<string>(),
              createdAt: notif.createdAt || new Date(),
              status: "discovered",
            };
            candidateMap.set(pid, cand);
          } else {
            if (item.pageName && (!cand.displayName || cand.displayName.startsWith("Page "))) {
              cand.displayName = item.pageName.trim();
            }
            if (item.adCount && item.adCount > cand.matchingAdCount) {
              cand.matchingAdCount = item.adCount;
            }
          }
        }
      }
    }

    // 3. Source C: Discovered Pages table (if any explicitly linked to this trackedPageId)
    const dpRows = await db.query.discoveredPages.findMany({
      where: eq(discoveredPages.trackedPageId, trackedPageId),
      orderBy: [desc(discoveredPages.matchingAdCount), desc(discoveredPages.createdAt)],
    });

    for (const dp of dpRows) {
      if (!isValidPageId(dp.pageId)) continue;
      const pid = dp.pageId.trim();
      let cand = candidateMap.get(pid);
      if (!cand) {
        cand = {
          id: dp.id,
          pageId: pid,
          displayName: dp.displayName?.trim() || null,
          matchingAdCount: dp.matchingAdCount || 0,
          sampleCtas: new Set<string>(dp.sampleCtas || []),
          sampleUrls: new Set<string>(dp.sampleUrls || []),
          sampleAdArchiveIds: new Set<string>(dp.sampleAdArchiveIds || []),
          createdAt: dp.createdAt || new Date(),
          status: dp.status || "discovered",
        };
        candidateMap.set(pid, cand);
      } else {
        cand.id = dp.id;
        if (dp.displayName && !cand.displayName) {
          cand.displayName = dp.displayName.trim();
        }
        if (dp.matchingAdCount && dp.matchingAdCount > cand.matchingAdCount) {
          cand.matchingAdCount = dp.matchingAdCount;
        }
        if (dp.status === "imported") {
          cand.status = "imported";
        }
      }
    }

    // 4. Check if candidates are already tracked in trackedPages
    const candidatePageIds = Array.from(candidateMap.keys());
    if (candidatePageIds.length > 0) {
      const alreadyTrackedPages = await db.query.trackedPages.findMany({
        where: inArray(trackedPages.pageId, candidatePageIds),
      });

      for (const atp of alreadyTrackedPages) {
        if (atp.pageId && atp.searchType === "page") {
          const cand = candidateMap.get(atp.pageId);
          if (cand) {
            cand.status = "imported";
          }
        }
      }
    }

    // Convert map to sorted candidate list
    const candidates = Array.from(candidateMap.values())
      .map((c) => ({
        id: c.id,
        pageId: c.pageId,
        displayName: c.displayName || `Page ${c.pageId}`,
        matchingAdCount: c.matchingAdCount,
        status: c.status,
        sampleCtas: Array.from(c.sampleCtas).slice(0, 5),
        sampleUrls: Array.from(c.sampleUrls).slice(0, 5),
        sampleAdArchiveIds: Array.from(c.sampleAdArchiveIds).slice(0, 5),
        createdAt: c.createdAt.toISOString(),
      }))
      .sort((a, b) => b.matchingAdCount - a.matchingAdCount);

    // Sync trackedPages.discoveredPagesCount if changed
    if (candidates.length > 0 && trackedPage.discoveredPagesCount !== candidates.length) {
      await db
        .update(trackedPages)
        .set({ discoveredPagesCount: candidates.length })
        .where(eq(trackedPages.id, trackedPageId));
    }

    return NextResponse.json({
      success: true,
      trackedPage: {
        id: trackedPage.id,
        displayName: trackedPage.displayName,
        url: trackedPage.url,
        pageId: trackedPage.pageId,
        country: trackedPage.country,
        searchType: trackedPage.searchType,
        discoveredPagesCount: candidates.length || trackedPage.discoveredPagesCount || 0,
      },
      candidates,
    });
  } catch (error: any) {
    console.error("Error in /api/tracked-pages/candidates:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch candidate pages" },
      { status: 500 }
    );
  }
}
