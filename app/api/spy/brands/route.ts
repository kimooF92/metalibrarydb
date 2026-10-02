import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, brandDomains } from "@/db/schema";
import { asc, isNotNull, inArray } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: Request) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const pages = await db
      .select({
        id: trackedPages.id,
        pageId: trackedPages.pageId,
        displayName: trackedPages.displayName,
        landingPage: trackedPages.landingPage,
        adCount: trackedPages.currentResults,
        isWatchlisted: trackedPages.isWatchlisted,
        brandDomainId: trackedPages.brandDomainId,
        pageRole: trackedPages.pageRole,
        canonicalDomain: trackedPages.canonicalDomain,
      })
      .from(trackedPages)
      .where(isNotNull(trackedPages.pageId))
      .orderBy(asc(trackedPages.displayName));

    const domainIds = Array.from(new Set(pages.map((p) => p.brandDomainId).filter(Boolean))) as string[];
    let domainRecordMap: Record<string, { domain: string; displayName: string }> = {};

    if (domainIds.length > 0) {
      const doms = await db.query.brandDomains.findMany({
        where: inArray(brandDomains.id, domainIds),
      });
      domainRecordMap = Object.fromEntries(
        doms.map((d) => [d.id, { domain: d.domain, displayName: d.displayName }])
      );
    }

    const isNumericString = (str?: string | null) => Boolean(str && /^\d{6,25}$/.test(str.trim()));

    // Group sister pages by brandDomainId
    const pagesByDomain = new Map<string, typeof pages>();
    for (const p of pages) {
      if (p.brandDomainId) {
        const list = pagesByDomain.get(p.brandDomainId) || [];
        list.push(p);
        pagesByDomain.set(p.brandDomainId, list);
      }
    }

    const seenDomains = new Set<string>();
    const brands: Array<{
      id: string;
      pageId: string;
      displayName: string;
      adCount: number;
      isWatchlisted: boolean;
      isDomainPortfolio?: boolean;
      sisterPageCount?: number;
    }> = [];

    for (const p of pages) {
      if (p.brandDomainId) {
        if (seenDomains.has(p.brandDomainId)) continue;
        seenDomains.add(p.brandDomainId);

        const domainMeta = domainRecordMap[p.brandDomainId];
        const sisterPages = pagesByDomain.get(p.brandDomainId) || [p];
        const combinedAds = sisterPages.reduce((acc, sp) => acc + (sp.adCount || 0), 0);
        const primary = sisterPages.find((sp) => sp.pageRole === "primary") || sisterPages[0];

        brands.push({
          id: p.brandDomainId,
          pageId: domainMeta?.domain || primary.pageId || p.id,
          displayName: domainMeta?.displayName || primary.displayName || domainMeta?.domain || "Brand Portfolio",
          adCount: combinedAds,
          isWatchlisted: sisterPages.some((sp) => sp.isWatchlisted),
          isDomainPortfolio: true,
          sisterPageCount: sisterPages.length,
        });
      } else {
        const validPageId = isNumericString(p.pageId) ? p.pageId! : "";
        const validDisplayName =
          p.displayName && !p.displayName.startsWith("http")
            ? p.displayName
            : validPageId
            ? `Page ${validPageId}`
            : "Unnamed Brand";

        brands.push({
          id: p.id,
          pageId: validPageId || p.landingPage || p.displayName || validDisplayName,
          displayName: validDisplayName,
          adCount: p.adCount || 0,
          isWatchlisted: Boolean(p.isWatchlisted),
        });
      }
    }

    return NextResponse.json({ brands });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch brands" },
      { status: 500 }
    );
  }
}
