import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { db } from "@/db";
import { scrapedProducts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { processProductExtraction } from "@/lib/product-ingest";
import { normalizeProductUrl } from "@/lib/firecrawl";

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
    const { url, productId: incomingProductId, workspaceId, adCopy } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing required 'url' in payload" }, { status: 400 });
    }

    const normalizedUrl = normalizeProductUrl(url);
    if (!normalizedUrl) {
      return NextResponse.json({ error: "Invalid product URL format" }, { status: 400 });
    }

    // 1. Resolve or verify product record
    let targetProductId = incomingProductId;

    if (!targetProductId) {
      const [existing] = await db
        .select({ id: scrapedProducts.id, scrapeStatus: scrapedProducts.scrapeStatus })
        .from(scrapedProducts)
        .where(eq(scrapedProducts.url, normalizedUrl))
        .limit(1);

      if (existing) {
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
      // Create pending record if not present
      const now = new Date();
      const [created] = await db
        .insert(scrapedProducts)
        .values({
          url: normalizedUrl,
          title: "Product",
          scrapeStatus: "pending",
          workspaceId: workspaceId || null,
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
      workspaceId,
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

// Wrap with QStash cryptographic signature verification
export const POST = verifySignatureAppRouter(handleProductExtraction, {
  clockTolerance: 10,
});
