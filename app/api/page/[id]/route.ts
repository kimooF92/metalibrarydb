import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, ads, scrapedProducts, adObservations, brandDomains } from "@/db/schema";
import { eq, or, and, ne, desc, inArray, not, isNotNull, sql, ilike } from "drizzle-orm";
import { validateAdminRole } from "@/lib/api-guard";
import { deleteByPrefix, deleteCached } from "@/lib/cache-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateAdminRole(request);
  if (authError) return authError;

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 });
    }

    // 1. Fetch tracked page first to get all identifiers
    const targetPage = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, id),
      columns: {
        id: true,
        pageId: true,
        displayName: true,
        canonicalDomain: true,
        landingPage: true,
        url: true,
        brandDomainId: true,
        pageRole: true,
        workspaceId: true,
      },
    });

    if (!targetPage) {
      return NextResponse.json({ error: "Tracked page not found" }, { status: 404 });
    }

    const pageId = targetPage.pageId;
    const brandDomainId = targetPage.brandDomainId;
    const wasPrimary = targetPage.pageRole === "primary";
    const workspaceId = targetPage.workspaceId;

    // Resolve clean domain
    let domain: string | null = null;
    if (targetPage.canonicalDomain) {
      domain = targetPage.canonicalDomain.trim().toLowerCase();
    } else if (targetPage.landingPage) {
      domain = targetPage.landingPage.trim().toLowerCase();
    } else if (targetPage.displayName && targetPage.displayName.includes(".")) {
      domain = targetPage.displayName.trim().toLowerCase();
    }

    // 2. Check sister pages if linked to a domain or portfolio
    let remainingSisterPages: any[] = [];
    if (brandDomainId) {
      remainingSisterPages = await db.query.trackedPages.findMany({
        where: and(
          eq(trackedPages.brandDomainId, brandDomainId),
          ne(trackedPages.id, id)
        ),
        columns: { id: true, pageId: true, pageRole: true },
        orderBy: [desc(trackedPages.currentResults), desc(trackedPages.createdAt)],
      });
    } else if (domain && workspaceId) {
      remainingSisterPages = await db.query.trackedPages.findMany({
        where: and(
          ne(trackedPages.id, id),
          eq(trackedPages.workspaceId, workspaceId),
          or(
            sql`lower(${trackedPages.canonicalDomain}) = ${domain}`,
            sql`lower(${trackedPages.landingPage}) = ${domain}`
          )
        ),
        columns: { id: true, pageId: true, pageRole: true },
        orderBy: [desc(trackedPages.currentResults), desc(trackedPages.createdAt)],
      });
    }

    // 3. Collect all candidate ads associated with this brand
    // 3a. Observed ads for this tracked page
    const observations = await db
      .select({ adId: adObservations.adId })
      .from(adObservations)
      .where(eq(adObservations.trackedPageId, id));
    const observedAdIds = observations.map((o) => o.adId).filter(Boolean);

    // 3b. Ads directly referencing pageId or id
    let pageAds: { id: string }[] = [];
    if (pageId && pageId !== "0" && !pageId.startsWith("pending-")) {
      pageAds = await db
        .select({ id: ads.id })
        .from(ads)
        .where(or(eq(ads.pageId, pageId), eq(ads.pageId, id)));
    } else {
      pageAds = await db
        .select({ id: ads.id })
        .from(ads)
        .where(eq(ads.pageId, id));
    }

    // 3c. Ads matching domain in linkUrl (if no sister pages share this domain)
    let domainAds: { id: string }[] = [];
    if (domain && remainingSisterPages.length === 0) {
      domainAds = await db
        .select({ id: ads.id })
        .from(ads)
        .where(ilike(ads.linkUrl, `%${domain}%`));
    }

    const candidateAdIds = Array.from(
      new Set([
        ...observedAdIds,
        ...pageAds.map((a) => a.id),
        ...domainAds.map((a) => a.id),
      ])
    );

    // 3d. Protect shared ads: only delete ads exclusive to this brand
    let adIdsToDelete: string[] = candidateAdIds;
    if (candidateAdIds.length > 0) {
      const sharedObs = await db
        .select({ adId: adObservations.adId })
        .from(adObservations)
        .where(
          and(
            inArray(adObservations.adId, candidateAdIds),
            ne(adObservations.trackedPageId, id)
          )
        );
      const sharedAdIdSet = new Set(sharedObs.map((s) => s.adId));
      adIdsToDelete = candidateAdIds.filter((adId) => !sharedAdIdSet.has(adId));
    }

    // 4. Collect and delete brand products (if no sister pages remain)
    if (remainingSisterPages.length === 0) {
      const productOrClauses: any[] = [];

      if (pageId && pageId !== "0" && !pageId.startsWith("pending-")) {
        productOrClauses.push(eq(scrapedProducts.pageId, pageId));
      }
      productOrClauses.push(eq(scrapedProducts.pageId, id));

      if (brandDomainId) {
        productOrClauses.push(eq(scrapedProducts.brandDomainId, brandDomainId));
      }

      if (domain) {
        productOrClauses.push(sql`lower(${scrapedProducts.domain}) = ${domain}`);
      }

      // Also delete products linked to deleted ads if no other remaining ads reference them
      if (adIdsToDelete.length > 0) {
        const linkedProductRows = await db
          .select({ productId: ads.productId })
          .from(ads)
          .where(and(inArray(ads.id, adIdsToDelete.slice(0, 500)), isNotNull(ads.productId)));
        const linkedProductIds = Array.from(
          new Set(linkedProductRows.map((r) => r.productId).filter(Boolean))
        ) as string[];

        if (linkedProductIds.length > 0) {
          const otherAds = await db
            .select({ productId: ads.productId })
            .from(ads)
            .where(
              and(
                inArray(ads.productId, linkedProductIds),
                not(inArray(ads.id, adIdsToDelete))
              )
            );
          const otherProductIds = new Set(otherAds.map((r) => r.productId));
          const exclusiveProductIds = linkedProductIds.filter((pId) => !otherProductIds.has(pId));
          if (exclusiveProductIds.length > 0) {
            productOrClauses.push(inArray(scrapedProducts.id, exclusiveProductIds));
          }
        }
      }

      if (productOrClauses.length > 0) {
        await db.delete(scrapedProducts).where(
          and(
            or(...productOrClauses),
            workspaceId ? eq(scrapedProducts.workspaceId, workspaceId) : undefined
          )
        );
      }
    }

    // 5. Delete exclusive ads in safe chunks
    if (adIdsToDelete.length > 0) {
      for (let i = 0; i < adIdsToDelete.length; i += 500) {
        const chunk = adIdsToDelete.slice(i, i + 500);
        await db.delete(ads).where(inArray(ads.id, chunk));
      }
    }

    // 6. Delete tracked page record (cascades to scan_history, creative_scans, ad_observations, notifications)
    await db.delete(trackedPages).where(eq(trackedPages.id, id));

    // 7. Post-delete domain cleanup & primary re-election
    if (brandDomainId) {
      if (remainingSisterPages.length > 0 && wasPrimary) {
        await db
          .update(trackedPages)
          .set({ pageRole: "primary", updatedAt: new Date() })
          .where(eq(trackedPages.id, remainingSisterPages[0].id));
      } else if (remainingSisterPages.length === 0) {
        await db.delete(brandDomains).where(eq(brandDomains.id, brandDomainId));
      }
    }

    // 8. Invalidate all Redis caches across workspace nodes
    if (workspaceId) {
      await Promise.allSettled([
        deleteByPrefix(`cache:pages:${workspaceId}:`),
        deleteCached(`cache:stats:${workspaceId}`),
        deleteByPrefix(`cache:products:${workspaceId}:`),
        deleteByPrefix(`cache:spy_ads:${workspaceId}:`),
        deleteByPrefix(`cache:fresh_winners:${workspaceId}:`),
        deleteCached(`cache:spy_brands:${workspaceId}`),
      ]);
    } else {
      await Promise.allSettled([
        deleteByPrefix("cache:pages:"),
        deleteCached("cache:stats:"),
        deleteByPrefix("cache:products:"),
        deleteByPrefix("cache:spy_ads:"),
        deleteByPrefix("cache:fresh_winners:"),
        deleteCached("cache:spy_brands:"),
      ]);
    }

    return NextResponse.json({
      success: true,
      message: remainingSisterPages.length > 0
        ? "Sister page removed; domain portfolio preserved."
        : "Tracked page, ads, and product catalog deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("Error in DELETE /api/page/[id]:", error);
    return NextResponse.json(
      { error: "Failed to delete tracked page" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateAdminRole(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json();
    const { displayName, notes, isWatchlisted, autoCreativeScan } = body;

    if (!id) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };

    if (displayName !== undefined) {
      updatePayload.displayName = displayName?.trim() || null;
    }
    if (notes !== undefined) {
      updatePayload.notes = notes?.trim() || null;
    }
    if (isWatchlisted !== undefined) {
      updatePayload.isWatchlisted = Boolean(isWatchlisted);
    }
    if (autoCreativeScan !== undefined) {
      updatePayload.autoCreativeScan = Boolean(autoCreativeScan);
    }

    const [updated] = await db
      .update(trackedPages)
      .set(updatePayload)
      .where(eq(trackedPages.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Tracked page not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Page updated successfully",
      page: updated,
    });
  } catch (error) {
    console.error("Error in PATCH /api/page/[id]:", error);
    return NextResponse.json(
      { error: "Failed to update page" },
      { status: 500 }
    );
  }
}
