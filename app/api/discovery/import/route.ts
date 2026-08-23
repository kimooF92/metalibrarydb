import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredPages, trackedPages, queue } from "@/db/schema";
import { inArray, eq, and, isNull, ne } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawIds: string[] = body.discoveredPageIds || body.ids || [];
    const directPages: Array<{
      pageId: string;
      displayName?: string | null;
      country?: string;
      matchingAdCount?: number;
    }> = Array.isArray(body.pages) ? body.pages : [];
    const runId: string | undefined = body.runId;
    const importAll: boolean = !!body.importAll;

    // Filter UUIDs vs raw pageIds / candidate IDs
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidIds = rawIds.filter((id) => uuidPattern.test(id));
    const nonUuidIds = rawIds.filter((id) => !uuidPattern.test(id));

    for (const nonUuid of nonUuidIds) {
      const pid = nonUuid.replace(/^cand_/, "").trim();
      if (pid && !directPages.some((p) => p.pageId === pid)) {
        directPages.push({ pageId: pid });
      }
    }

    let pagesToImport: (typeof discoveredPages.$inferSelect)[] = [];

    if (uuidIds.length > 0) {
      pagesToImport = await db.query.discoveredPages.findMany({
        where: inArray(discoveredPages.id, uuidIds),
      });
    } else if (runId) {
      pagesToImport = await db.query.discoveredPages.findMany({
        where: and(
          eq(discoveredPages.runId, runId),
          ne(discoveredPages.status, "imported")
        ),
      });
    } else if (importAll) {
      pagesToImport = await db.query.discoveredPages.findMany({
        where: ne(discoveredPages.status, "imported"),
      });
    }

    if (pagesToImport.length === 0 && directPages.length === 0) {
      if (rawIds.length === 0 && !runId && !importAll) {
        return NextResponse.json(
          { success: false, error: "No discovered page IDs, runId, or importAll flag provided" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        importedCount: 0,
        enqueuedQueueJobs: 0,
        message: "No un-imported pages found to merge",
      });
    }

    let importedCount = 0;
    let newJobsCount = 0;

    for (const discPage of pagesToImport) {
      let tpId: string | undefined = undefined;

      // 1. If this discovered page has a parent tracked page that is an exact-match / keyword target, merge it cleanly
      if (discPage.trackedPageId) {
        const parentTrackedPage = await db.query.trackedPages.findFirst({
          where: eq(trackedPages.id, discPage.trackedPageId),
        });

        if (parentTrackedPage && parentTrackedPage.searchType !== "page") {
          const { mergeExactMatchWithPageId } = await import("@/actions/merge-pages");
          const mergeResult = await mergeExactMatchWithPageId(
            discPage.trackedPageId,
            discPage.pageId,
            discPage.displayName
          );

          if (mergeResult.success && mergeResult.mergedPageId) {
            tpId = mergeResult.mergedPageId;
          }
        }
      }

      // 2. If not merged via exact match parent, insert or update canonical page
      if (!tpId) {
        const pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${discPage.country || "TN"}&view_all_page_id=${discPage.pageId}&search_type=page&media_type=all`;

        // Check if page with this pageId already exists
        const existingByPageId = await db.query.trackedPages.findFirst({
          where: eq(trackedPages.pageId, discPage.pageId),
        });

        if (existingByPageId) {
          tpId = existingByPageId.id;
          await db
            .update(trackedPages)
            .set({
              url: pageUrl,
              displayName: discPage.displayName || existingByPageId.displayName,
              searchType: "page",
              updatedAt: new Date(),
            })
            .where(eq(trackedPages.id, existingByPageId.id));
        } else {
          const [tp] = await db
            .insert(trackedPages)
            .values({
              url: pageUrl,
              displayName: discPage.displayName || `Page ${discPage.pageId}`,
              pageId: discPage.pageId,
              searchType: "page",
              country: discPage.country || "TN",
              adCount: discPage.matchingAdCount,
              currentResults: discPage.verifiedAdCount || discPage.matchingAdCount,
              status: "pending",
            })
            .onConflictDoUpdate({
              target: trackedPages.url,
              set: {
                displayName: discPage.displayName || trackedPages.displayName,
                pageId: discPage.pageId,
                searchType: "page",
                updatedAt: new Date(),
              },
            })
            .returning();
          tpId = tp.id;
        }
      }

      // Check if job already pending in queue
      const existingQueueJob = await db.query.queue.findFirst({
        where: (q, { and, eq, inArray }) =>
          and(
            eq(q.trackedPageId, tpId!),
            eq(q.jobType, "count"),
            inArray(q.status, ["pending", "running"])
          ),
      });

      if (!existingQueueJob) {
        await db.insert(queue).values({
          trackedPageId: tpId!,
          jobType: "count",
          status: "pending",
        });
        newJobsCount++;
      }

      await db
        .update(discoveredPages)
        .set({
          status: "imported",
          trackedPageId: tpId!,
          updatedAt: new Date(),
        })
        .where(eq(discoveredPages.id, discPage.id));

      importedCount++;
    }

    for (const directPage of directPages) {
      const cleanPageId = directPage.pageId?.trim();
      if (!cleanPageId) continue;

      const pageCountry = directPage.country || "TN";
      const pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${pageCountry}&view_all_page_id=${cleanPageId}&search_type=page&media_type=all`;

      const existingByPageId = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.pageId, cleanPageId),
      });

      let tpId: string;
      if (existingByPageId) {
        tpId = existingByPageId.id;
        await db
          .update(trackedPages)
          .set({
            url: pageUrl,
            displayName: directPage.displayName || existingByPageId.displayName,
            searchType: "page",
            updatedAt: new Date(),
          })
          .where(eq(trackedPages.id, existingByPageId.id));
      } else {
        const [tp] = await db
          .insert(trackedPages)
          .values({
            url: pageUrl,
            displayName: directPage.displayName || `Page ${cleanPageId}`,
            pageId: cleanPageId,
            searchType: "page",
            country: pageCountry,
            adCount: directPage.matchingAdCount || 0,
            currentResults: directPage.matchingAdCount || 0,
            status: "pending",
          })
          .onConflictDoUpdate({
            target: trackedPages.url,
            set: {
              displayName: directPage.displayName || trackedPages.displayName,
              pageId: cleanPageId,
              searchType: "page",
              updatedAt: new Date(),
            },
          })
          .returning();
        tpId = tp.id;
      }

      // Check if job already pending in queue
      const existingQueueJob = await db.query.queue.findFirst({
        where: (q, { and, eq, inArray }) =>
          and(
            eq(q.trackedPageId, tpId),
            eq(q.jobType, "count"),
            inArray(q.status, ["pending", "running"])
          ),
      });

      if (!existingQueueJob) {
        await db.insert(queue).values({
          trackedPageId: tpId,
          jobType: "count",
          status: "pending",
        });
        newJobsCount++;
      }

      // Mark any matching discoveredPages as imported
      await db
        .update(discoveredPages)
        .set({
          status: "imported",
          trackedPageId: tpId,
          updatedAt: new Date(),
        })
        .where(eq(discoveredPages.pageId, cleanPageId));

      importedCount++;
    }

    return NextResponse.json({
      success: true,
      importedCount,
      enqueuedQueueJobs: newJobsCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to merge pages into main dashboard" },
      { status: 500 }
    );
  }
}

