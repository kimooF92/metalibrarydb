import { db } from "@/db";
import {
  brandDomains,
  trackedPages,
  scrapedProducts,
  ads,
  adObservations,
  queue,
} from "@/db/schema";
import { resolveTrackableDomain, isSocialDomain, extractStoreDomain } from "@/lib/url-parser";
import { eq, and, sql, desc, or, inArray, isNull } from "drizzle-orm";
import type { BrandDomain, TrackedPage } from "@/types";

export interface LinkPageResult {
  success: boolean;
  message?: string;
  error?: string;
  conflict?: boolean;
  brandDomainId?: string;
  trackedPageId?: string;
}

/**
 * Resolves or creates a brand_domains record for a store domain.
 */
export async function getOrCreateBrandDomain(
  rawDomain: string,
  displayName?: string | null,
  workspaceId?: string | null
): Promise<{ id: string; domain: string; displayName: string; workspaceId?: string | null }> {
  // Extract clean store domain if candidate contains URL/Meta Ad Library wrappers
  const extracted = extractStoreDomain(rawDomain);
  const cleanDomain = (extracted || resolveTrackableDomain(rawDomain)).toLowerCase().trim();
  if (!cleanDomain || isSocialDomain(cleanDomain)) {
    throw new Error(`Invalid brand store domain: "${rawDomain}". Social platform domains and ad search URLs cannot be registered as brand store portfolios.`);
  }

  // Check if domain already exists
  const existing = await db.query.brandDomains.findFirst({
    where: eq(brandDomains.domain, cleanDomain),
  });

  if (existing) {
    // Optionally update display name or workspaceId if missing
    const updates: Record<string, any> = {};
    if (displayName && (existing.displayName === existing.domain || existing.displayName.startsWith("http"))) {
      updates.displayName = displayName.trim();
    }
    if (!existing.workspaceId && workspaceId) {
      updates.workspaceId = workspaceId;
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db
        .update(brandDomains)
        .set(updates)
        .where(eq(brandDomains.id, existing.id));
      Object.assign(existing, updates);
    }
    return existing;
  }

  const cleanDisplayName =
    displayName && !displayName.startsWith("http") && !displayName.includes("/")
      ? displayName.trim()
      : cleanDomain;

  const [created] = await db
    .insert(brandDomains)
    .values({
      domain: cleanDomain,
      displayName: cleanDisplayName,
      ...(workspaceId ? { workspaceId } : {}),
    })
    .onConflictDoUpdate({
      target: [brandDomains.domain],
      set: { updatedAt: new Date() },
    })
    .returning();

  return created;
}

/**
 * Links a tracked page to a brand domain portfolio.
 * Safely handles primary role assignment via transaction to satisfy the unique partial index.
 */
export async function linkPageToDomain(
  trackedPageId: string,
  brandDomainId: string,
  role: "primary" | "satellite" | "backup" = "satellite",
  options?: { forceReassign?: boolean }
): Promise<LinkPageResult> {
  try {
    const page = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, trackedPageId),
    });

    if (!page) {
      return { success: false, error: `Tracked page not found: ${trackedPageId}` };
    }

    const domainRecord = await db.query.brandDomains.findFirst({
      where: eq(brandDomains.id, brandDomainId),
    });

    if (!domainRecord) {
      return { success: false, error: `Brand domain not found: ${brandDomainId}` };
    }

    // Check conflict: already linked to a different domain?
    if (page.brandDomainId && page.brandDomainId !== brandDomainId && !options?.forceReassign) {
      const currentDomain = await db.query.brandDomains.findFirst({
        where: eq(brandDomains.id, page.brandDomainId),
      });
      return {
        success: false,
        conflict: true,
        error: `Page "${page.displayName || page.pageId}" is already linked to "${currentDomain?.domain || "another domain"}". Provide forceReassign=true to move it.`,
      };
    }

    const now = new Date();

    // Check if this domain currently has any primary page
    const existingPrimary = await db.query.trackedPages.findFirst({
      where: and(
        eq(trackedPages.brandDomainId, brandDomainId),
        eq(trackedPages.pageRole, "primary")
      ),
    });

    // If no primary exists yet, this page automatically becomes primary
    const effectiveRole = !existingPrimary ? "primary" : role;

    await db.transaction(async (tx) => {
      // If we are setting this page as primary and another primary exists, downgrade the existing one first
      if (effectiveRole === "primary" && existingPrimary && existingPrimary.id !== trackedPageId) {
        await tx
          .update(trackedPages)
          .set({ pageRole: "satellite", updatedAt: now })
          .where(eq(trackedPages.id, existingPrimary.id));
      }

      // Link target page
      await tx
        .update(trackedPages)
        .set({
          brandDomainId,
          pageRole: effectiveRole,
          canonicalDomain: domainRecord.domain,
          updatedAt: now,
        })
        .where(eq(trackedPages.id, trackedPageId));

      // Backfill products matching this domain to link to the brandDomainId
      await tx
        .update(scrapedProducts)
        .set({ brandDomainId, updatedAt: now })
        .where(
          and(
            eq(scrapedProducts.domain, domainRecord.domain),
            isNull(scrapedProducts.brandDomainId)
          )
        );
    });

    return {
      success: true,
      message: `Linked page to "${domainRecord.domain}" as ${effectiveRole}.`,
      brandDomainId,
      trackedPageId,
    };
  } catch (err: any) {
    console.error("[DomainPortfolio] Error linking page to domain:", err);
    return { success: false, error: err.message || "Failed to link page to domain" };
  }
}

/**
 * Unlinks a tracked page from its domain portfolio.
 * Automatically elects a new primary page if the unlinked page was primary.
 */
export async function unlinkPageFromDomain(
  trackedPageId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const page = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, trackedPageId),
    });

    if (!page || !page.brandDomainId) {
      return { success: false, error: "Page is not linked to any domain portfolio." };
    }

    const previousDomainId = page.brandDomainId;
    const wasPrimary = page.pageRole === "primary";
    const now = new Date();

    await db.transaction(async (tx) => {
      // 1. Unlink page
      await tx
        .update(trackedPages)
        .set({
          brandDomainId: null,
          pageRole: "primary",
          canonicalDomain: null,
          updatedAt: now,
        })
        .where(eq(trackedPages.id, trackedPageId));

      // 2. If it was primary, find highest-volume sister page and promote it
      if (wasPrimary) {
        const nextCandidate = await tx.query.trackedPages.findFirst({
          where: eq(trackedPages.brandDomainId, previousDomainId),
          orderBy: [desc(trackedPages.currentResults), desc(trackedPages.createdAt)],
        });

        if (nextCandidate) {
          await tx
            .update(trackedPages)
            .set({ pageRole: "primary", updatedAt: now })
            .where(eq(trackedPages.id, nextCandidate.id));
        }
      }
    });

    return { success: true, message: "Page unlinked successfully." };
  } catch (err: any) {
    console.error("[DomainPortfolio] Error unlinking page:", err);
    return { success: false, error: err.message || "Failed to unlink page" };
  }
}

/**
 * Atomically promotes a specific page to primary in a domain portfolio.
 */
export async function setPrimaryPage(
  brandDomainId: string,
  trackedPageId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const page = await db.query.trackedPages.findFirst({
      where: and(
        eq(trackedPages.id, trackedPageId),
        eq(trackedPages.brandDomainId, brandDomainId)
      ),
    });

    if (!page) {
      return { success: false, error: "Page is not a member of this domain portfolio." };
    }

    if (page.pageRole === "primary") {
      return { success: true, message: "Page is already the primary brand page." };
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      // Demote current primary
      await tx
        .update(trackedPages)
        .set({ pageRole: "satellite", updatedAt: now })
        .where(
          and(
            eq(trackedPages.brandDomainId, brandDomainId),
            eq(trackedPages.pageRole, "primary")
          )
        );

      // Promote target page
      await tx
        .update(trackedPages)
        .set({ pageRole: "primary", updatedAt: now })
        .where(eq(trackedPages.id, trackedPageId));
    });

    return { success: true, message: "Successfully designated as primary brand page." };
  } catch (err: any) {
    console.error("[DomainPortfolio] Error setting primary page:", err);
    return { success: false, error: err.message || "Failed to set primary page" };
  }
}

/**
 * Returns full domain portfolio details with sister pages and aggregated metrics.
 */
export async function getDomainPortfolio(domainOrId: string) {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainOrId);
  const cleanDomain = !isId ? resolveTrackableDomain(domainOrId).toLowerCase().trim() : "";

  const domainRecord = await db.query.brandDomains.findFirst({
    where: isId
      ? eq(brandDomains.id, domainOrId)
      : eq(brandDomains.domain, cleanDomain),
  });

  if (!domainRecord) return null;

  // Fetch all linked pages
  const linkedPages = await db.query.trackedPages.findMany({
    where: eq(trackedPages.brandDomainId, domainRecord.id),
    orderBy: [
      sql`CASE WHEN ${trackedPages.pageRole} = 'primary' THEN 0 ELSE 1 END`,
      desc(trackedPages.currentResults),
    ],
  });

  // Calculate combined metrics
  const totalCombinedAds = linkedPages.reduce((acc, p) => acc + (p.currentResults || 0), 0);
  const primaryPage = linkedPages.find((p) => p.pageRole === "primary") || linkedPages[0] || null;

  // Count products for this domain
  const productConditions = [
    or(
      eq(scrapedProducts.brandDomainId, domainRecord.id),
      eq(scrapedProducts.domain, domainRecord.domain)
    ),
  ];
  if (domainRecord.workspaceId) {
    productConditions.push(eq(scrapedProducts.workspaceId, domainRecord.workspaceId));
  }
  const productRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(scrapedProducts)
    .where(and(...productConditions));
  const totalProducts = Number(productRows[0]?.count || 0);

  return {
    ...domainRecord,
    totalCombinedAds,
    totalProducts,
    linkedPagesCount: linkedPages.length,
    primaryPageId: primaryPage?.pageId || null,
    primaryDisplayName: primaryPage?.displayName || null,
    sisterPages: linkedPages,
  };
}

/**
 * Returns list of all domain portfolios with page counts and combined ads.
 */
export async function listDomainPortfolios(workspaceId?: string | null) {
  const domains = await db.query.brandDomains.findMany({
    where: workspaceId ? eq(brandDomains.workspaceId, workspaceId) : undefined,
    orderBy: [desc(brandDomains.updatedAt)],
  });

  const allLinkedPages = await db.query.trackedPages.findMany({
    where: workspaceId
      ? and(sql`${trackedPages.brandDomainId} IS NOT NULL`, eq(trackedPages.workspaceId, workspaceId))
      : sql`${trackedPages.brandDomainId} IS NOT NULL`,
  });

  const pagesByDomain = new Map<string, typeof allLinkedPages>();
  for (const p of allLinkedPages) {
    if (p.brandDomainId) {
      const list = pagesByDomain.get(p.brandDomainId) || [];
      list.push(p);
      pagesByDomain.set(p.brandDomainId, list);
    }
  }

  return domains.map((d) => {
    const pages = pagesByDomain.get(d.id) || [];
    const primary = pages.find((p) => p.pageRole === "primary") || pages[0] || null;
    const totalCombinedAds = pages.reduce((sum, p) => sum + (p.currentResults || 0), 0);

    return {
      ...d,
      linkedPagesCount: pages.length,
      totalCombinedAds,
      primaryPageId: primary?.pageId || null,
      primaryDisplayName: primary?.displayName || null,
      sisterPages: pages,
    };
  });
}
