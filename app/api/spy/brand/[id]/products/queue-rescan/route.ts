import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adObservations, trackedPages, scrapedProducts, queue } from "@/db/schema";
import { eq, or, inArray, sql, and } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { normalizeProductUrl } from "@/lib/firecrawl";
import { getCleanDomain } from "@/lib/utils";
import { getActiveWorkspace } from "@/lib/workspace-server";

export const dynamic = "force-dynamic";

const isUuid = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Brand ID or Page ID is required" },
        { status: 400 }
      );
    }

    const decodedId = decodeURIComponent(id).trim();
    const activeWorkspace = await getActiveWorkspace(req).catch(() => null);
    const resolvedWorkspaceId = activeWorkspace?.id || null;

    // 1. Identify Brand & Page ID
    let trackedPage: any = null;
    let pageId: string | null = null;
    let trackedPageUuid: string | null = null;

    if (isUuid(decodedId)) {
      trackedPage = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.id, decodedId),
        columns: { id: true, pageId: true, displayName: true, workspaceId: true },
      });
      if (trackedPage) {
        pageId = trackedPage.pageId;
        trackedPageUuid = trackedPage.id;
      }
    }

    if (!trackedPage) {
      trackedPage = await db.query.trackedPages.findFirst({
        where: or(
          eq(trackedPages.pageId, decodedId),
          eq(trackedPages.displayName, decodedId)
        ),
        columns: { id: true, pageId: true, displayName: true, workspaceId: true },
      });
      if (trackedPage) {
        pageId = trackedPage.pageId;
        trackedPageUuid = trackedPage.id;
      }
    }

    if (!pageId) {
      const sampleAd = await db.query.ads.findFirst({
        where: or(eq(ads.pageId, decodedId), eq(ads.pageName, decodedId)),
        columns: { pageId: true, pageName: true },
      });
      if (sampleAd) pageId = sampleAd.pageId;
      else pageId = decodedId;
    }

    // 2. Fetch all ads for this brand to discover landing page URLs
    const adConditions = [];
    if (trackedPageUuid) {
      adConditions.push(
        or(
          eq(ads.pageId, pageId),
          eq(adObservations.trackedPageId, trackedPageUuid)
        )
      );
    } else {
      adConditions.push(eq(ads.pageId, pageId));
    }

    const brandAds = await db
      .selectDistinctOn([ads.id], {
        id: ads.id,
        linkUrl: ads.linkUrl,
        productId: ads.productId,
      })
      .from(ads)
      .leftJoin(adObservations, eq(ads.id, adObservations.adId))
      .where(or(...adConditions));

    const uniqueProductUrls = new Set<string>();
    const knownProductIds = new Set<string>();

    for (const ad of brandAds) {
      if (ad.productId) knownProductIds.add(ad.productId);
      if (ad.linkUrl) {
        const norm = normalizeProductUrl(ad.linkUrl);
        if (norm) uniqueProductUrls.add(norm);
      }
    }

    // 3. Find all products directly linked via pageId or known IDs or URLs
    const productQueryOrs = [];
    if (pageId) {
      productQueryOrs.push(eq(scrapedProducts.pageId, pageId));
    }
    if (knownProductIds.size > 0) {
      productQueryOrs.push(inArray(scrapedProducts.id, Array.from(knownProductIds)));
    }
    if (uniqueProductUrls.size > 0) {
      productQueryOrs.push(inArray(scrapedProducts.url, Array.from(uniqueProductUrls)));
    }

    let existingProducts: Array<{ id: string; url: string; workspaceId: string | null }> = [];
    if (productQueryOrs.length > 0) {
      existingProducts = await db
        .select({
          id: scrapedProducts.id,
          url: scrapedProducts.url,
          workspaceId: scrapedProducts.workspaceId,
        })
        .from(scrapedProducts)
        .where(
          and(
            or(...productQueryOrs),
            sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`
          )
        );
    }

    const existingUrlMap = new Map(existingProducts.map((p) => [p.url, p]));
    const targetProductIds: string[] = existingProducts.map((p) => p.id);

    // 4. Ingest un-inserted ad landing page URLs as pending products
    const now = new Date();
    for (const url of uniqueProductUrls) {
      if (!existingUrlMap.has(url)) {
        try {
          const [inserted] = await db
            .insert(scrapedProducts)
            .values({
              url,
              domain: getCleanDomain(url),
              pageId: pageId || null,
              scrapeStatus: "pending",
              failureReason: "Queued for local worker rescan",
              workspaceId: resolvedWorkspaceId || trackedPage?.workspaceId || null,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: scrapedProducts.url,
              set: {
                pageId: pageId || null,
                scrapeStatus: "pending",
                failureReason: "Queued for local worker rescan",
                updatedAt: now,
              },
            })
            .returning({ id: scrapedProducts.id });

          if (inserted?.id && !targetProductIds.includes(inserted.id)) {
            targetProductIds.push(inserted.id);
          }
        } catch (insertErr) {
          console.warn("[Queue Rescan] Non-fatal product insertion notice:", insertErr);
        }
      }
    }

    if (targetProductIds.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        brandName: trackedPage?.displayName || decodedId,
        message: "No product landing page URLs found for this brand.",
      });
    }

    // 5. Update all target products to pending scrapeStatus
    await db
      .update(scrapedProducts)
      .set({
        scrapeStatus: "pending",
        failureReason: "Queued for local worker rescan",
        updatedAt: now,
      })
      .where(inArray(scrapedProducts.id, targetProductIds));

    // 6. Enqueue products into durable PostgreSQL queue for local worker
    const queueRows = targetProductIds.map((pId) => ({
      trackedPageId: trackedPageUuid || null,
      jobType: "product_scrape",
      status: "pending",
      priority: 10, // High priority user request
      failureReason: `product:${pId}`,
      workspaceId: resolvedWorkspaceId || trackedPage?.workspaceId || null,
    }));

    if (queueRows.length > 0) {
      await db.insert(queue).values(queueRows).onConflictDoNothing();
    }

    return NextResponse.json({
      success: true,
      count: targetProductIds.length,
      brandName: trackedPage?.displayName || decodedId,
      pageId: pageId,
      message: `Successfully set and queued ${targetProductIds.length} product(s) for local URL rescan.`,
    });
  } catch (err: any) {
    console.error("[Queue Rescan API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to set brand products for local rescan" },
      { status: 500 }
    );
  }
}
