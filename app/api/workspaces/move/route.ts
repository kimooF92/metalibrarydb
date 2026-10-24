import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  workspaces,
  brandDomains,
  trackedPages,
  scrapedProducts,
  queue,
  activityNotifications,
} from "@/db/schema";
import { eq, inArray, or, and, sql, notInArray, desc } from "drizzle-orm";
import { validateAdminRole } from "@/lib/api-guard";
import { deleteByPrefix, deleteCached } from "@/lib/cache-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = await validateAdminRole(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const {
      targetWorkspaceId,
      brandDomainId,
      pageIds,
      moveEntireBrand = true,
    } = body;

    if (!targetWorkspaceId || typeof targetWorkspaceId !== "string") {
      return NextResponse.json(
        { error: "Target workspace ID is required." },
        { status: 400 }
      );
    }

    // 1. Validate target workspace exists
    const [targetWorkspace] = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        countryCode: workspaces.countryCode,
        flag: workspaces.flag,
      })
      .from(workspaces)
      .where(eq(workspaces.id, targetWorkspaceId))
      .limit(1);

    if (!targetWorkspace) {
      return NextResponse.json(
        { error: "Target workspace not found." },
        { status: 404 }
      );
    }

    const isBrandMode = Boolean(brandDomainId);
    const sourceWorkspaceIds = new Set<string>();
    const brandDomainIdsToMove = new Set<string>();
    const trackedPageIdsToMove = new Set<string>();
    const metaPageIdsToMove = new Set<string>();
    const sourceBrandDomainsToCheckPrimary = new Set<string>();

    const now = new Date();

    // 2. Resolve items to move based on brandDomainId or pageIds
    if (isBrandMode) {
      const [bDomain] = await db
        .select({
          id: brandDomains.id,
          domain: brandDomains.domain,
          displayName: brandDomains.displayName,
          workspaceId: brandDomains.workspaceId,
        })
        .from(brandDomains)
        .where(eq(brandDomains.id, brandDomainId))
        .limit(1);

      if (!bDomain) {
        return NextResponse.json(
          { error: "Brand domain not found." },
          { status: 404 }
        );
      }

      if (bDomain.workspaceId === targetWorkspace.id) {
        return NextResponse.json(
          { error: `Brand "${bDomain.displayName || bDomain.domain}" is already in ${targetWorkspace.name}.` },
          { status: 400 }
        );
      }

      if (bDomain.workspaceId) sourceWorkspaceIds.add(bDomain.workspaceId);
      brandDomainIdsToMove.add(bDomain.id);

      // In brand mode, we explicitly move the brand portfolio and all its linked pages together
      const linkedPages = await db
        .select({
          id: trackedPages.id,
          pageId: trackedPages.pageId,
          workspaceId: trackedPages.workspaceId,
        })
        .from(trackedPages)
        .where(eq(trackedPages.brandDomainId, bDomain.id));

      for (const p of linkedPages) {
        trackedPageIdsToMove.add(p.id);
        if (p.pageId) metaPageIdsToMove.add(p.pageId);
        if (p.workspaceId) sourceWorkspaceIds.add(p.workspaceId);
      }
    } else if (Array.isArray(pageIds) && pageIds.length > 0) {
      const uniqueRequestedIds = Array.from(new Set(pageIds.filter(Boolean) as string[]));
      if (uniqueRequestedIds.length === 0) {
        return NextResponse.json(
          { error: "pageIds array cannot be empty." },
          { status: 400 }
        );
      }

      const selectedPages = await db
        .select({
          id: trackedPages.id,
          pageId: trackedPages.pageId,
          displayName: trackedPages.displayName,
          brandDomainId: trackedPages.brandDomainId,
          pageRole: trackedPages.pageRole,
          workspaceId: trackedPages.workspaceId,
        })
        .from(trackedPages)
        .where(inArray(trackedPages.id, uniqueRequestedIds));

      // Finding [P2]: Reject if any requested page ID cannot be resolved
      if (selectedPages.length !== uniqueRequestedIds.length) {
        const foundIds = new Set(selectedPages.map((p) => p.id));
        const missingIds = uniqueRequestedIds.filter((id) => !foundIds.has(id));
        return NextResponse.json(
          {
            error: `Could not find all requested pages. ${missingIds.length} page ID(s) do not exist.`,
            missingIds,
          },
          { status: 404 }
        );
      }

      for (const p of selectedPages) {
        if (p.workspaceId) sourceWorkspaceIds.add(p.workspaceId);
        trackedPageIdsToMove.add(p.id);
        if (p.pageId) metaPageIdsToMove.add(p.pageId);

        if (p.brandDomainId) {
          if (moveEntireBrand) {
            brandDomainIdsToMove.add(p.brandDomainId);
          } else {
            // Track source brand domain for primary re-election if page was primary
            sourceBrandDomainsToCheckPrimary.add(p.brandDomainId);
          }
        }
      }

      // If moveEntireBrand is requested, also pull all sister pages of those domains
      if (moveEntireBrand && brandDomainIdsToMove.size > 0) {
        const sisterPages = await db
          .select({
            id: trackedPages.id,
            pageId: trackedPages.pageId,
            workspaceId: trackedPages.workspaceId,
            brandDomainId: trackedPages.brandDomainId,
          })
          .from(trackedPages)
          .where(inArray(trackedPages.brandDomainId, Array.from(brandDomainIdsToMove)));

        for (const sp of sisterPages) {
          trackedPageIdsToMove.add(sp.id);
          if (sp.pageId) metaPageIdsToMove.add(sp.pageId);
          if (sp.workspaceId) sourceWorkspaceIds.add(sp.workspaceId);
        }
      }
    } else {
      return NextResponse.json(
        { error: "Either brandDomainId or pageIds must be provided." },
        { status: 400 }
      );
    }

    const trackedPageIdsArray = Array.from(trackedPageIdsToMove);
    const brandDomainIdsArray = Array.from(brandDomainIdsToMove);
    const metaPageIdsArray = Array.from(metaPageIdsToMove);

    if (trackedPageIdsArray.length === 0 && brandDomainIdsArray.length === 0) {
      return NextResponse.json(
        { error: "No pages or domains to move." },
        { status: 400 }
      );
    }

    // 3. Execute atomic move inside transaction
    let movedProductsCount = 0;

    await db.transaction(async (tx) => {
      // 3a. If moving brand domains, update workspaceId on brand_domains
      if (brandDomainIdsArray.length > 0) {
        await tx
          .update(brandDomains)
          .set({
            workspaceId: targetWorkspace.id,
            updatedAt: now,
          })
          .where(inArray(brandDomains.id, brandDomainIdsArray));
      }

      // 3b. Update tracked_pages
      if (trackedPageIdsArray.length > 0) {
        if (isBrandMode || moveEntireBrand) {
          // Finding [P1]: In brand mode or full brand move, KEEP brandDomainId and sister page relations intact!
          await tx
            .update(trackedPages)
            .set({
              workspaceId: targetWorkspace.id,
              country: targetWorkspace.countryCode,
              updatedAt: now,
            })
            .where(inArray(trackedPages.id, trackedPageIdsArray));
        } else {
          // Page-only move: page is detached from the source brand domain
          await tx
            .update(trackedPages)
            .set({
              workspaceId: targetWorkspace.id,
              country: targetWorkspace.countryCode,
              brandDomainId: null,
              canonicalDomain: null,
              pageRole: "primary",
              updatedAt: now,
            })
            .where(inArray(trackedPages.id, trackedPageIdsArray));

          // Re-elect primary page on remaining sister pages in the source domain if needed
          for (const bDomainId of sourceBrandDomainsToCheckPrimary) {
            const remainingPages = await tx
              .select({
                id: trackedPages.id,
                pageRole: trackedPages.pageRole,
              })
              .from(trackedPages)
              .where(
                and(
                  eq(trackedPages.brandDomainId, bDomainId),
                  notInArray(trackedPages.id, trackedPageIdsArray)
                )
              )
              .orderBy(
                sql`CASE WHEN ${trackedPages.pageRole} = 'primary' THEN 0 ELSE 1 END`,
                desc(trackedPages.currentResults)
              );

            if (remainingPages.length > 0) {
              const hasPrimary = remainingPages.some((p) => p.pageRole === "primary");
              if (!hasPrimary) {
                // Elect the first remaining page as new primary
                await tx
                  .update(trackedPages)
                  .set({ pageRole: "primary", updatedAt: now })
                  .where(eq(trackedPages.id, remainingPages[0].id));
              }
            }
          }
        }
      }

      // 3c. Update scraped_products (Finding [P1] Fix: No cross-workspace references)
      if (!isBrandMode && !moveEntireBrand) {
        // Page-only move: Disconnect products from source brand domain
        if (metaPageIdsArray.length > 0) {
          const [prodCountResult] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(scrapedProducts)
            .where(inArray(scrapedProducts.pageId, metaPageIdsArray));

          movedProductsCount = prodCountResult?.count || 0;

          await tx
            .update(scrapedProducts)
            .set({
              workspaceId: targetWorkspace.id,
              brandDomainId: null,
              updatedAt: now,
            })
            .where(inArray(scrapedProducts.pageId, metaPageIdsArray));
        }
      } else {
        // Full brand or brand-mode move: Both domain and pages are moving together
        const productConditions = [];
        if (brandDomainIdsArray.length > 0) {
          productConditions.push(inArray(scrapedProducts.brandDomainId, brandDomainIdsArray));
        }
        if (metaPageIdsArray.length > 0) {
          productConditions.push(inArray(scrapedProducts.pageId, metaPageIdsArray));
        }

        if (productConditions.length > 0) {
          const [prodCountResult] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(scrapedProducts)
            .where(or(...productConditions));

          movedProductsCount = prodCountResult?.count || 0;

          await tx
            .update(scrapedProducts)
            .set({
              workspaceId: targetWorkspace.id,
              updatedAt: now,
            })
            .where(or(...productConditions));
        }
      }

      // 3d. Update queue
      if (trackedPageIdsArray.length > 0) {
        await tx
          .update(queue)
          .set({ workspaceId: targetWorkspace.id })
          .where(inArray(queue.trackedPageId, trackedPageIdsArray));
      }

      // 3e. Update activity_notifications
      if (trackedPageIdsArray.length > 0) {
        await tx
          .update(activityNotifications)
          .set({ workspaceId: targetWorkspace.id })
          .where(inArray(activityNotifications.trackedPageId, trackedPageIdsArray));
      }
    });

    // 4. Invalidate all actual caches (Finding [P2] Fix)
    const workspacesToInvalidate = Array.from(
      new Set([...sourceWorkspaceIds, targetWorkspace.id])
    );

    const cacheInvalidationPromises: Promise<any>[] = [
      deleteByPrefix("cache:workspaces:"),
    ];

    for (const wsId of workspacesToInvalidate) {
      cacheInvalidationPromises.push(
        deleteByPrefix(`cache:pages:${wsId}:`),
        deleteCached(`cache:stats:${wsId}`),
        deleteByPrefix(`cache:products:${wsId}:`),
        deleteByPrefix(`cache:spy_ads:${wsId}:`),
        deleteByPrefix(`cache:fresh_winners:${wsId}:`),
        deleteByPrefix(`cache:fresh_winners_stats:${wsId}`),
        deleteByPrefix(`cache:brand:${wsId}:`),
        deleteCached(`cache:spy_brands:${wsId}`),
        deleteCached(`cache:notifications:summary:${wsId}`)
      );
    }

    await Promise.allSettled(cacheInvalidationPromises);

    return NextResponse.json({
      success: true,
      message: `Successfully moved to ${targetWorkspace.flag || ""} ${targetWorkspace.name}.`,
      details: {
        targetWorkspace: {
          id: targetWorkspace.id,
          name: targetWorkspace.name,
          flag: targetWorkspace.flag,
          countryCode: targetWorkspace.countryCode,
        },
        movedBrandCount: brandDomainIdsArray.length,
        movedPagesCount: trackedPageIdsArray.length,
        movedProductsCount,
      },
    });
  } catch (error: any) {
    // Finding [P2] Fix: Sanitize client error responses while preserving full server logs with correlation ID
    const correlationId = `ERR_MOVE_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    console.error(`[POST /api/workspaces/move][${correlationId}] Error:`, error);
    return NextResponse.json(
      {
        error: "Failed to move resource to target workspace. Please try again or contact administrator.",
        correlationId,
      },
      { status: 500 }
    );
  }
}
