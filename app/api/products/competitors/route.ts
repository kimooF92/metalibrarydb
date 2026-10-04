import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scrapedProducts, ads } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { findCompetitorMatches } from "@/lib/product-matcher";
import { PRODUCT_MATCH_PROJECTION } from "@/lib/product-projections";
import { ScrapedProduct } from "@/types";
import { getActiveWorkspace } from "@/lib/workspace-server";

interface CachedBenchmark {
  data: any;
  timestamp: number;
}

const competitorCache = new Map<string, CachedBenchmark>();
const COMPETITOR_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const forceRefresh = searchParams.get("refresh") === "true";

    if (!productId) {
      return NextResponse.json(
        { success: false, error: "productId query parameter is required." },
        { status: 400 }
      );
    }

    const now = Date.now();
    const cached = competitorCache.get(productId);
    if (!forceRefresh && cached && now - cached.timestamp < COMPETITOR_CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    // 1. Fetch target product (lean projection)
    const [targetProduct] = await db
      .select(PRODUCT_MATCH_PROJECTION)
      .from(scrapedProducts)
      .where(eq(scrapedProducts.id, productId));

    if (!targetProduct) {
      return NextResponse.json(
        { success: false, error: "Target product not found." },
        { status: 404 }
      );
    }

    const activeWorkspace = await getActiveWorkspace(req);
    const targetWsId = targetProduct.workspaceId || activeWorkspace.id;

    // 2. Fetch candidate products in the EXACT same workspace (strictly isolated)
    // Filter by matching category when available to eliminate scanning thousands of unrelated products
    const candidateConditions: any[] = [
      eq(scrapedProducts.workspaceId, targetWsId),
      sql`${scrapedProducts.id} != ${targetProduct.id}`,
      sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`,
    ];

    if (targetProduct.category && targetProduct.category !== "General & Other" && targetProduct.category !== "other") {
      candidateConditions.push(
        sql`(${scrapedProducts.category} = ${targetProduct.category} OR ${scrapedProducts.category} IS NULL OR ${scrapedProducts.category} = 'General & Other')`
      );
    }

    const candidateProducts = await db
      .select(PRODUCT_MATCH_PROJECTION)
      .from(scrapedProducts)
      .where(and(...candidateConditions))
      .limit(400);

    // 3. Find algorithmic competitor matches in memory
    const benchmark = findCompetitorMatches(
      targetProduct as unknown as ScrapedProduct,
      candidateProducts as unknown as (ScrapedProduct & { linkedAdsCount?: number })[],
      0.40
    );

    // 4. On-demand ad count lookup for actual matching products only (typically 1-5 products, avoiding 24,000 ad group-by)
    const matchedIds = benchmark.matches.map((m) => m.product.id).filter(Boolean);
    if (matchedIds.length > 0) {
      try {
        const adCountRows = await db
          .select({
            productId: ads.productId,
            count: sql<number>`count(distinct ${ads.id})`.mapWith(Number),
          })
          .from(ads)
          .where(
            and(
              sql`${ads.productId} IN (${sql.join(matchedIds.map((id) => sql`${id}`), sql`, `)})`,
              sql`(${ads.isArchived} = false OR ${ads.isArchived} IS NULL)`
            )
          )
          .groupBy(ads.productId);

        const countMap = new Map(adCountRows.map((r) => [r.productId, r.count]));
        benchmark.matches.forEach((m) => {
          (m.product as any).linkedAdsCount = countMap.get(m.product.id) || 0;
        });
      } catch (countErr) {
        console.warn("[Competitors API] Warning fetching ad counts for matches:", countErr);
      }
    }

    const responsePayload = {
      success: true,
      targetProduct,
      benchmark,
    };

    competitorCache.set(productId, {
      data: responsePayload,
      timestamp: Date.now(),
    });

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("[Competitors API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
