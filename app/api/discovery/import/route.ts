import { NextResponse } from "next/server";
import { db } from "@/db";
import { discoveredPages, trackedPages, queue, scrapedProducts } from "@/db/schema";
import { inArray, eq, and, ne } from "drizzle-orm";
import { getActiveWorkspace } from "@/lib/workspace-server";

export async function POST(req: Request) {
  try {
    const activeWorkspace = await getActiveWorkspace(req);
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
      await db.transaction(async (tx) => {
        // 1. Atomically lock & mark page as imported, clearing ephemeral preview columns immediately
        const [claimed] = await tx
          .update(discoveredPages)
          .set({
            status: "imported",
            previewProductUrl: null,
            previewProductTitle: null,
            previewProductImage: null,
            previewProductPrice: null,
            previewProductCurrency: null,
            previewSource: "none",
            previewScrapeStatus: "promoted",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(discoveredPages.id, discPage.id),
              ne(discoveredPages.status, "imported")
            )
          )
          .returning({ id: discoveredPages.id });

        if (!claimed) {
          // Already imported concurrently by another request
          return;
        }

        let tpId: string | undefined = undefined;

        // 2. If this discovered page has a parent tracked page that is an exact-match / keyword target, merge it cleanly
        if (discPage.trackedPageId) {
          const parentTrackedPage = await tx.query.trackedPages.findFirst({
            where: eq(trackedPages.id, discPage.trackedPageId),
            columns: { id: true, searchType: true },
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

        // 3. If not merged via exact match parent, insert or update canonical tracked page
        if (!tpId) {
          const pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${discPage.pageId}&search_type=page&media_type=all`;

          const existingByPageId = await tx.query.trackedPages.findFirst({
            where: and(
              eq(trackedPages.pageId, discPage.pageId),
              activeWorkspace?.id ? eq(trackedPages.workspaceId, activeWorkspace.id) : undefined
            ),
            columns: { id: true, displayName: true, brandDomainId: true, canonicalDomain: true },
          });

          let candidateDomain = "";
          if (discPage.sampleUrls && discPage.sampleUrls.length > 0) {
            const { resolveTrackableDomain } = await import("@/lib/url-parser");
            const SHORTENERS = new Set(["bit.ly", "shorturl.at", "tinyurl.com", "wa.me", "api.whatsapp.com", "facebook.com", "instagram.com"]);
            for (const u of discPage.sampleUrls) {
              try {
                const parsedHost = new URL(u.startsWith("http") ? u : `https://${u}`).hostname;
                const dom = resolveTrackableDomain(parsedHost);
                if (dom && !SHORTENERS.has(dom) && dom.includes(".")) {
                  candidateDomain = dom;
                  break;
                }
              } catch (e) {}
            }
          }

          let brandDomainId: string | null = null;
          if (candidateDomain) {
            try {
              const { getOrCreateBrandDomain } = await import("@/lib/domain-portfolio");
              const bd = await getOrCreateBrandDomain(candidateDomain, discPage.displayName, activeWorkspace?.id);
              brandDomainId = bd.id;
            } catch (e) {}
          }

          if (existingByPageId) {
            tpId = existingByPageId.id;
            await tx
              .update(trackedPages)
              .set({
                url: pageUrl,
                displayName: discPage.displayName || existingByPageId.displayName,
                searchType: "page",
                brandDomainId: brandDomainId || existingByPageId.brandDomainId || null,
                canonicalDomain: candidateDomain || existingByPageId.canonicalDomain || null,
                updatedAt: new Date(),
              })
              .where(eq(trackedPages.id, existingByPageId.id));
          } else {
            const [tp] = await tx
              .insert(trackedPages)
              .values({
                url: pageUrl,
                displayName: discPage.displayName || `Page ${discPage.pageId}`,
                pageId: discPage.pageId,
                searchType: "page",
                country: discPage.country || activeWorkspace?.countryCode || "TN",
                adCount: discPage.matchingAdCount,
                currentResults: discPage.verifiedAdCount || discPage.matchingAdCount,
                brandDomainId: brandDomainId || null,
                canonicalDomain: candidateDomain || null,
                workspaceId: activeWorkspace?.id,
                status: "pending",
              })
              .onConflictDoUpdate({
                target: trackedPages.url,
                set: {
                  displayName: discPage.displayName || trackedPages.displayName,
                  pageId: discPage.pageId,
                  searchType: "page",
                  brandDomainId: brandDomainId || null,
                  canonicalDomain: candidateDomain || null,
                  updatedAt: new Date(),
                },
              })
              .returning({ id: trackedPages.id });
            tpId = tp.id;
          }
        }

        // Link trackedPageId back to discoveredPage
        await tx
          .update(discoveredPages)
          .set({ trackedPageId: tpId })
          .where(eq(discoveredPages.id, discPage.id));

        // 4. Product Promotion (Seed scraped_products only if valid deep product URL and image exist)
        if (
          discPage.previewProductUrl &&
          discPage.previewProductImage &&
          discPage.previewSource === "product_page"
        ) {
          const existingProduct = await tx.query.scrapedProducts.findFirst({
            where: eq(scrapedProducts.url, discPage.previewProductUrl),
            columns: { id: true },
          });

          if (!existingProduct) {
            let productDomain: string | null = null;
            try {
              productDomain = new URL(discPage.previewProductUrl).hostname.replace(/^www\./, "");
            } catch {}

            await tx.insert(scrapedProducts).values({
              url: discPage.previewProductUrl,
              domain: productDomain,
              title: discPage.previewProductTitle || "Validated Discovered Product",
              mainImageUrl: discPage.previewProductImage,
              currentPrice: discPage.previewProductPrice,
              currency: discPage.previewProductCurrency || "TND",
              pageId: discPage.pageId,
              scrapeStatus: "success",
              workspaceId: activeWorkspace?.id,
              lastScrapedAt: new Date(),
            });
          }
        }

        // 5. Enqueue count job in queue if not already present
        const existingQueueJob = await tx.query.queue.findFirst({
          where: (q, { and, eq, inArray }) =>
            and(
              eq(q.trackedPageId, tpId!),
              eq(q.jobType, "count"),
              inArray(q.status, ["pending", "running"])
            ),
          columns: { id: true },
        });

        if (!existingQueueJob) {
          await tx.insert(queue).values({
            trackedPageId: tpId!,
            workspaceId: activeWorkspace?.id,
            jobType: "count",
            status: "pending",
          });
          newJobsCount++;
        }

        importedCount++;
      });
    }

    for (const directPage of directPages) {
      const cleanPageId = directPage.pageId?.trim();
      if (!cleanPageId) continue;

      const pageCountry = directPage.country || activeWorkspace?.countryCode || "ALL";
      const pageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${cleanPageId}&search_type=page&media_type=all`;

      await db.transaction(async (tx) => {
        const existingByPageId = await tx.query.trackedPages.findFirst({
          where: and(
            eq(trackedPages.pageId, cleanPageId),
            activeWorkspace?.id ? eq(trackedPages.workspaceId, activeWorkspace.id) : undefined
          ),
          columns: { id: true, displayName: true },
        });

        let tpId: string;
        if (existingByPageId) {
          tpId = existingByPageId.id;
          await tx
            .update(trackedPages)
            .set({
              url: pageUrl,
              displayName: directPage.displayName || existingByPageId.displayName,
              searchType: "page",
              updatedAt: new Date(),
            })
            .where(eq(trackedPages.id, existingByPageId.id));
        } else {
          const [tp] = await tx
            .insert(trackedPages)
            .values({
              url: pageUrl,
              displayName: directPage.displayName || `Page ${cleanPageId}`,
              pageId: cleanPageId,
              searchType: "page",
              country: pageCountry,
              adCount: directPage.matchingAdCount || 0,
              currentResults: directPage.matchingAdCount || 0,
              workspaceId: activeWorkspace?.id,
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
            .returning({ id: trackedPages.id });
          tpId = tp.id;
        }

        // Check if job already pending in queue
        const existingQueueJob = await tx.query.queue.findFirst({
          where: (q, { and, eq, inArray }) =>
            and(
              eq(q.trackedPageId, tpId),
              eq(q.jobType, "count"),
              inArray(q.status, ["pending", "running"])
            ),
          columns: { id: true },
        });

        if (!existingQueueJob) {
          await tx.insert(queue).values({
            trackedPageId: tpId,
            workspaceId: activeWorkspace?.id,
            jobType: "count",
            status: "pending",
          });
          newJobsCount++;
        }

        // Mark any matching discoveredPages as imported and null their preview columns
        await tx
          .update(discoveredPages)
          .set({
            status: "imported",
            trackedPageId: tpId,
            previewProductUrl: null,
            previewProductTitle: null,
            previewProductImage: null,
            previewProductPrice: null,
            previewProductCurrency: null,
            previewSource: "none",
            previewScrapeStatus: "promoted",
            updatedAt: new Date(),
          })
          .where(eq(discoveredPages.pageId, cleanPageId));

        importedCount++;
      });
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
