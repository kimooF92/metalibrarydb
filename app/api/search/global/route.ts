import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trackedPages, scrapedProducts, ads } from "@/db/schema";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { getCached, setCached } from "@/lib/cache-service";
import { PRIVATE_AUTH_VARY, PRIVATE_READ_CACHE_CONTROL } from "@/lib/http-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 10;

const SEARCH_CACHE_TTL_SECONDS = 60; // 1-minute cache to protect pooler against rapid repeated queries

export interface GlobalSearchResult {
  brands: Array<{
    id: string;
    displayName: string | null;
    pageId: string | null;
    profilePicUrl: string | null;
    canonicalDomain: string | null;
    currentResults: number | null;
    status: string | null;
  }>;
  products: Array<{
    id: string;
    title: string | null;
    mainImageUrl: string | null;
    currentPrice: string | null;
    currency: string | null;
    domain: string | null;
    storePlatform: string | null;
    pageId: string | null;
  }>;
  ads: Array<{
    id: string;
    adArchiveId: string;
    pageName: string | null;
    thumbnailUrl: string | null;
    startedRunningOn: Date | null;
    captionSnippet: string;
  }>;
}

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const rawQuery = searchParams.get("q") || "";
    const cleanQ = rawQuery.trim();

    // Defense Layer 1: Minimum character gate (avoids noisy full-table queries)
    if (!cleanQ || cleanQ.length < 2) {
      return NextResponse.json(
        { brands: [], products: [], ads: [] },
        {
          headers: {
            "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
            Vary: PRIVATE_AUTH_VARY,
          },
        }
      );
    }

    const activeWorkspace = await getActiveWorkspace(req);
    const normalizedKey = cleanQ.toLowerCase();
    const cacheKey = `cache:global-search:${activeWorkspace.id}:${normalizedKey}`;

    // Defense Layer 2: Fast Redis Cache Hit
    const cached = await getCached<GlobalSearchResult>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
          Vary: PRIVATE_AUTH_VARY,
        },
      });
    }

    // Defense Layer 3: Parallel Lean Queries with GIN Trigram index matching
    const [brands, products, adsResults] = await Promise.all([
      // 1. Brands Query (Matched on displayName, canonicalDomain, landingPage)
      db
        .select({
          id: trackedPages.id,
          displayName: trackedPages.displayName,
          pageId: trackedPages.pageId,
          profilePicUrl: trackedPages.profilePicUrl,
          canonicalDomain: trackedPages.canonicalDomain,
          currentResults: trackedPages.currentResults,
          status: trackedPages.status,
        })
        .from(trackedPages)
        .where(
          and(
            eq(trackedPages.workspaceId, activeWorkspace.id),
            or(
              ilike(trackedPages.displayName, `%${cleanQ}%`),
              ilike(trackedPages.canonicalDomain, `%${cleanQ}%`),
              ilike(trackedPages.landingPage, `%${cleanQ}%`)
            )
          )
        )
        .orderBy(desc(trackedPages.currentResults))
        .limit(4),

      // 2. Products Query (Matched on title, domain)
      db
        .select({
          id: scrapedProducts.id,
          title: scrapedProducts.title,
          mainImageUrl: scrapedProducts.mainImageUrl,
          currentPrice: scrapedProducts.currentPrice,
          currency: scrapedProducts.currency,
          domain: scrapedProducts.domain,
          storePlatform: scrapedProducts.storePlatform,
          pageId: scrapedProducts.pageId,
        })
        .from(scrapedProducts)
        .where(
          and(
            eq(scrapedProducts.workspaceId, activeWorkspace.id),
            or(
              ilike(scrapedProducts.title, `%${cleanQ}%`),
              ilike(scrapedProducts.domain, `%${cleanQ}%`)
            )
          )
        )
        .orderBy(desc(scrapedProducts.createdAt))
        .limit(4),

      // 3. Ads Query (Matched on adArchiveId, pageName, title with truncated snippet)
      db
        .select({
          id: ads.id,
          adArchiveId: ads.adArchiveId,
          pageName: ads.pageName,
          thumbnailUrl: ads.thumbnailUrl,
          startedRunningOn: ads.startedRunningOn,
          captionSnippet: sql<string>`LEFT(COALESCE(${ads.caption}, ${ads.title}, ''), 80)`,
        })
        .from(ads)
        .where(
          and(
            sql`EXISTS (
              SELECT 1 FROM tracked_pages tp 
              WHERE tp.page_id = ${ads.pageId} 
                AND tp.workspace_id = ${activeWorkspace.id}
            )`,
            or(
              eq(ads.adArchiveId, cleanQ),
              ilike(ads.adArchiveId, `${cleanQ}%`),
              ilike(ads.pageName, `%${cleanQ}%`),
              ilike(ads.title, `%${cleanQ}%`)
            )
          )
        )
        .orderBy(desc(ads.startedRunningOn))
        .limit(4),
    ]);

    const result: GlobalSearchResult = {
      brands,
      products,
      ads: adsResults,
    };

    // Populate Redis cache asynchronously
    setCached(cacheKey, result, SEARCH_CACHE_TTL_SECONDS).catch((err) => {
      console.warn("[Global Search API] Redis cache set error:", err);
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": PRIVATE_READ_CACHE_CONTROL,
        Vary: PRIVATE_AUTH_VARY,
      },
    });
  } catch (error) {
    console.error("[Global Search API] Query error:", error);
    return NextResponse.json(
      { error: "Internal search error" },
      { status: 500 }
    );
  }
}

