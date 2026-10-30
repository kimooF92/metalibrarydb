import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scrapedProducts } from "@/db/schema";
import { sql, and, eq, gte } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { PRIVATE_AUTH_VARY } from "@/lib/http-cache";
import { getActiveWorkspace } from "@/lib/workspace-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

// In-memory cache for product badge counts (15s TTL) keyed by workspaceId:since
interface CachedBadge {
  count: number;
  timestamp: number;
}

const badgeCacheMap = new Map<string, CachedBadge>();
const CACHE_TTL_MS = 15 * 1000; // 15 seconds

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const { searchParams } = new URL(req.url);
    const sinceParam = searchParams.get("since");

    let sinceDate: Date;
    if (sinceParam) {
      const parsed = new Date(sinceParam);
      // Validate date; if invalid or in the future by >5m, fallback to 24 hours ago
      if (isNaN(parsed.getTime()) || parsed.getTime() > Date.now() + 5 * 60 * 1000) {
        sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      } else {
        sinceDate = parsed;
      }
    } else {
      // Default to 24 hours ago if no since parameter is provided
      sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    const cacheKey = `${activeWorkspace.id}:${sinceDate.toISOString()}`;
    const now = Date.now();
    const cached = badgeCacheMap.get(cacheKey);

    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(
        {
          success: true,
          count: cached.count,
          cached: true,
        },
        {
          headers: {
            "Cache-Control": "private, max-age=10",
            Vary: PRIVATE_AUTH_VARY,
          },
        }
      );
    }

    // Lean, indexed count query: zero row fetches, strictly projections
    const [result] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(scrapedProducts)
      .where(
        and(
          eq(scrapedProducts.workspaceId, activeWorkspace.id),
          sql`${scrapedProducts.scrapeStatus} NOT IN ('deleted', 'ignored')`,
          gte(scrapedProducts.createdAt, sinceDate)
        )
      );

    const count = result?.count || 0;

    badgeCacheMap.set(cacheKey, {
      count,
      timestamp: now,
    });

    // Prune cache if it grows large
    if (badgeCacheMap.size > 200) {
      const cutoff = now - CACHE_TTL_MS * 2;
      for (const [k, v] of badgeCacheMap.entries()) {
        if (v.timestamp < cutoff) {
          badgeCacheMap.delete(k);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        count,
        since: sinceDate.toISOString(),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=10",
          Vary: PRIVATE_AUTH_VARY,
        },
      }
    );
  } catch (error) {
    console.error("[api/products/badge] Error calculating badge count:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch product badge count",
        count: 0,
      },
      { status: 500 }
    );
  }
}
