import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { db } from "@/db";
import { scrapedProducts, ads, trackedPages, brandDomains } from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { processProductExtraction } from "@/lib/product-ingest";
import { normalizeProductUrl } from "@/lib/firecrawl";
import { timingSafeEqual } from "@/lib/auth";
import { getCleanDomain, isValidPageId } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Up to 60s for serverless extraction

interface QStashExtractPayload {
  url: string;
  productId?: string | null;
  pageId?: string | null;
  adId?: string | null;
  adCopy?: string | null;
  workspaceId?: string | null;
}

async function handleProductExtraction(req: Request | NextRequest) {
  try {
    const body = (await req.json()) as QStashExtractPayload;
    const { url, productId: incomingProductId, pageId: incomingPageId, workspaceId, adCopy } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing required 'url' in payload" }, { status: 400 });
    }

    const normalizedUrl = normalizeProductUrl(url);
    if (!normalizedUrl) {
      return NextResponse.json({ error: "Invalid product URL format" }, { status: 400 });
    }

    const cleanDomain = getCleanDomain(normalizedUrl);

    // 0. Resolve canonical pageId, workspaceId, and brandDomainId
    let resolvedPageId = isValidPageId(incomingPageId) ? incomingPageId! : null;
    let resolvedWorkspaceId = workspaceId || null;
    let resolvedBrandDomainId: string | null = null;

    if (resolvedPageId) {
      const pageRec = await db.query.trackedPages.findFirst({
        where: eq(trackedPages.pageId, resolvedPageId),
        columns: { workspaceId: true, brandDomainId: true },
      });
      if (pageRec?.workspaceId && !resolvedWorkspaceId) {
        resolvedWorkspaceId = pageRec.workspaceId;
      }
      if (pageRec?.brandDomainId) {
        resolvedBrandDomainId = pageRec.brandDomainId;
      }
    }

    // If pageId was not explicitly passed, inspect ads with matching linkUrl
    if (!resolvedPageId) {
      const matchingAd = await db.query.ads.findFirst({
        where: or(
          eq(ads.linkUrl, normalizedUrl),
          sql`LOWER(TRIM(TRAILING '/' FROM SPLIT_PART(${ads.linkUrl}, '?', 1))) = LOWER(${normalizedUrl.replace(/\/+$/, "")})`
        ),
        columns: { pageId: true },
      });
      if (matchingAd?.pageId && isValidPageId(matchingAd.pageId)) {
        resolvedPageId = matchingAd.pageId;
        const pageRec = await db.query.trackedPages.findFirst({
          where: eq(trackedPages.pageId, resolvedPageId),
          columns: { workspaceId: true, brandDomainId: true },
        });
        if (pageRec?.workspaceId && !resolvedWorkspaceId) {
          resolvedWorkspaceId = pageRec.workspaceId;
        }
        if (pageRec?.brandDomainId && !resolvedBrandDomainId) {
          resolvedBrandDomainId = pageRec.brandDomainId;
        }
      }
    }

    // Check brandDomains by cleanDomain
    if (cleanDomain) {
      const bd = await db.query.brandDomains.findFirst({
        where: sql`lower(${brandDomains.domain}) = ${cleanDomain.toLowerCase()}`,
        columns: { id: true, workspaceId: true },
      });
      if (bd) {
        if (!resolvedBrandDomainId) resolvedBrandDomainId = bd.id;
        if (!resolvedWorkspaceId && bd.workspaceId) resolvedWorkspaceId = bd.workspaceId;
      }

      // If still no pageId, check trackedPages by canonicalDomain or landingPage
      if (!resolvedPageId) {
        const trackedByDomain = await db.query.trackedPages.findFirst({
          where: or(
            sql`lower(${trackedPages.canonicalDomain}) = ${cleanDomain.toLowerCase()}`,
            sql`lower(${trackedPages.landingPage}) = ${cleanDomain.toLowerCase()}`
          ),
          columns: { pageId: true, workspaceId: true, brandDomainId: true },
        });
        if (trackedByDomain?.pageId && isValidPageId(trackedByDomain.pageId)) {
          resolvedPageId = trackedByDomain.pageId;
          if (trackedByDomain.workspaceId && !resolvedWorkspaceId) resolvedWorkspaceId = trackedByDomain.workspaceId;
          if (trackedByDomain.brandDomainId && !resolvedBrandDomainId) resolvedBrandDomainId = trackedByDomain.brandDomainId;
        }
      }
    }

    // 1. Resolve or verify product record
    let targetProductId = incomingProductId;

    if (!targetProductId) {
      const [existing] = await db
        .select({
          id: scrapedProducts.id,
          scrapeStatus: scrapedProducts.scrapeStatus,
          pageId: scrapedProducts.pageId,
          brandDomainId: scrapedProducts.brandDomainId,
          domain: scrapedProducts.domain,
        })
        .from(scrapedProducts)
        .where(eq(scrapedProducts.url, normalizedUrl))
        .limit(1);

      if (existing) {
        // Reconcile missing pageId / brandDomainId on existing product
        const updates: Record<string, any> = {};
        if (!existing.pageId && resolvedPageId) updates.pageId = resolvedPageId;
        if (!existing.brandDomainId && resolvedBrandDomainId) updates.brandDomainId = resolvedBrandDomainId;
        if (!existing.domain && cleanDomain) updates.domain = cleanDomain;
        if (resolvedWorkspaceId && Object.keys(updates).length > 0) updates.workspaceId = resolvedWorkspaceId;

        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date();
          await db.update(scrapedProducts).set(updates).where(eq(scrapedProducts.id, existing.id));
        }

        if (existing.scrapeStatus === "success" || existing.scrapeStatus === "ignored") {
          return NextResponse.json({
            success: true,
            status: existing.scrapeStatus,
            message: "Product already extracted or ignored",
            productId: existing.id,
          });
        }
        targetProductId = existing.id;
      }
    }

    if (!targetProductId) {
      // Create pending record with all resolved brand relationships
      const now = new Date();
      const [created] = await db
        .insert(scrapedProducts)
        .values({
          url: normalizedUrl,
          domain: cleanDomain || null,
          pageId: resolvedPageId,
          brandDomainId: resolvedBrandDomainId,
          title: cleanDomain || "Product",
          scrapeStatus: "pending",
          workspaceId: resolvedWorkspaceId || null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: scrapedProducts.id });

      targetProductId = created?.id;
    }

    if (!targetProductId) {
      const [recheck] = await db
        .select({ id: scrapedProducts.id })
        .from(scrapedProducts)
        .where(eq(scrapedProducts.url, normalizedUrl))
        .limit(1);
      targetProductId = recheck?.id;
    }

    if (!targetProductId) {
      return NextResponse.json({ error: "Could not locate or initialize product record" }, { status: 422 });
    }

    // 2. Execute full extraction pipeline (with Firecrawl/Cheerio, Jev AI, price referee, and ad linking)
    console.log(`[QStash Worker] Processing product extraction for: ${normalizedUrl} (${targetProductId})`);
    const result = await processProductExtraction(targetProductId, normalizedUrl, {
      workspaceId: resolvedWorkspaceId,
      pageId: resolvedPageId,
      adCopy,
    });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      productId: targetProductId,
      error: result.error,
    });
  } catch (error: any) {
    console.error("[QStash Worker] Extraction failed:", error?.message || error);
    // Return 500 so QStash will trigger automatic retry with exponential backoff
    return NextResponse.json(
      { error: error?.message || "Internal product extraction error" },
      { status: 500 }
    );
  }
}

// Lazy signature verification wrapper with API secret fast-path support
export async function POST(req: Request | NextRequest) {
  // 1. Fast-path: If caller provides valid internal API secret or APP_PASSWORD
  const apiSecretHeader = req.headers.get("x-api-secret");
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const configuredApiSecret = process.env.API_SECRET || process.env.APP_PASSWORD;

  const isAuthorizedSecret =
    Boolean(configuredApiSecret) &&
    ((apiSecretHeader && timingSafeEqual(apiSecretHeader, configuredApiSecret!)) ||
      (bearerToken && timingSafeEqual(bearerToken, configuredApiSecret!)));

  if (isAuthorizedSecret) {
    return handleProductExtraction(req);
  }

  // 2. Upstash QStash cryptographic signature verification
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentSigningKey || !nextSigningKey) {
    if (process.env.NODE_ENV === "development") {
      return handleProductExtraction(req);
    }
    console.error("[QStash Error] Missing QSTASH_CURRENT_SIGNING_KEY or QSTASH_NEXT_SIGNING_KEY in environment");
    return NextResponse.json(
      { error: "Server configuration missing: QStash signing keys are required." },
      { status: 500 }
    );
  }

  const verified = verifySignatureAppRouter(handleProductExtraction, {
    currentSigningKey,
    nextSigningKey,
    clockTolerance: 60,
  });

  return verified(req);
}
