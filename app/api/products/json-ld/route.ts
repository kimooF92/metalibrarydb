import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret } from "@/lib/api-guard";
import { normalizeProductUrl } from "@/lib/firecrawl";
import { scrapeProductDirectHtml, extractJsonLd, extractRawJsonLdScripts, parseProductHtmlContent } from "@/lib/html-scraper";
import { db } from "@/db";
import { scrapedProducts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deleteByPrefix } from "@/lib/cache-service";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { url, productId, applyToProduct } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "A valid landing page URL is required." },
        { status: 400 }
      );
    }

    const normalizedUrl = normalizeProductUrl(url);
    if (!normalizedUrl) {
      return NextResponse.json(
        { success: false, error: "The provided URL is invalid or malformed." },
        { status: 400 }
      );
    }

    // 1. Fetch direct HTML with timeout and redirect handling
    const scrapeResult = await scrapeProductDirectHtml(normalizedUrl, 15000);
    const html = scrapeResult.rawHtml || "";

    if (!html) {
      return NextResponse.json(
        {
          success: false,
          error: scrapeResult.error || "Unable to fetch HTML content from the store destination.",
        },
        { status: 502 }
      );
    }

    // 2. Extract JSON-LD objects and raw script bodies
    const schemas = extractJsonLd(html);
    const rawScripts = extractRawJsonLdScripts(html);

    // 3. Find Product schema specifically
    let productSchema: any = null;
    for (const item of schemas) {
      if (item["@type"] === "Product" || item["@type"] === "http://schema.org/Product") {
        productSchema = item;
        break;
      }
      if (Array.isArray(item["@graph"])) {
        const found = item["@graph"].find(
          (g: any) => g["@type"] === "Product" || g["@type"] === "http://schema.org/Product"
        );
        if (found) {
          productSchema = found;
          break;
        }
      }
    }

    // 4. Parse extracted fields using standard logic
    const parsed = parseProductHtmlContent(html, normalizedUrl);

    // 5. Optionally apply extracted data to database product
    let updatedProduct: any = null;
    if (applyToProduct && productId && parsed.success && parsed.data) {
      const p = parsed.data;
      const formattedOffers = (p.all_offers || []).map((o: any) => ({
        tierName: o.tier_name,
        price: o.price,
        savings: o.savings,
      }));

      const isForeign = Boolean(p.current_price && /(?:\$|€|£|¥|\b(?:USD|EUR|GBP)\b)/i.test(p.current_price));

      const updatePayload: Record<string, any> = {
        lastScrapedAt: new Date(),
        scrapeStatus: isForeign ? "needs_review" : "success",
        failureReason: isForeign
          ? `Foreign currency detected (${p.current_price}) - Queued for local worker residential validation`
          : null,
      };

      if (p.title) updatePayload.title = p.title;
      if (p.current_price) updatePayload.currentPrice = p.current_price;
      if (p.original_price) updatePayload.originalPrice = p.original_price;
      if (p.currency) updatePayload.currency = p.currency;
      if (p.discount_or_offer) updatePayload.discountOrOffer = p.discount_or_offer;
      if (p.main_image_url) updatePayload.mainImageUrl = p.main_image_url;
      if (Array.isArray(p.gallery_images) && p.gallery_images.length > 0) {
        updatePayload.galleryImages = p.gallery_images;
      }
      if (formattedOffers.length > 0) {
        updatePayload.allOffers = formattedOffers;
      }

      const [updated] = await db
        .update(scrapedProducts)
        .set(updatePayload)
        .where(eq(scrapedProducts.id, productId))
        .returning();

      if (isForeign) {
        try {
          const { queue } = await import("@/db/schema");
          await db
            .insert(queue)
            .values({
              jobType: "product_scrape",
              status: "pending",
              priority: 9,
              failureReason: `product:${productId}`,
            })
            .onConflictDoNothing();
        } catch {}
      }

      updatedProduct = updated;
      await deleteByPrefix("cache:products:").catch(() => {});
    }

    return NextResponse.json({
      success: true,
      url: normalizedUrl,
      schemaCount: schemas.length,
      schemas,
      rawScripts,
      productSchema,
      parsedProduct: parsed.data || null,
      updatedProduct,
    });
  } catch (err: any) {
    console.error("[JSON-LD Extraction Error]", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to extract JSON-LD from page.",
      },
      { status: 500 }
    );
  }
}
