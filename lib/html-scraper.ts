import { ExtractedProductData } from "./firecrawl";

/**
 * Extracts JSON-LD schema objects from HTML content.
 */
function extractJsonLd(html: string): any[] {
  const results: any[] = [];
  const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else if (parsed && typeof parsed === "object") {
        results.push(parsed);
      }
    } catch {
      // Ignore invalid JSON in ld+json scripts
    }
  }

  return results;
}

/**
 * Extracts meta tag content by property or name.
 */
function extractMeta(html: string, nameOrProp: string): string | null {
  const escaped = nameOrProp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\s+[^>]*property=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*property=["']${escaped}["']`, "i"),
    new RegExp(`<meta\\s+[^>]*name=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*name=["']${escaped}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match && match[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

/**
 * Direct fallback product extraction from landing page HTML.
 * Parses JSON-LD, OpenGraph, Twitter Cards, and common e-commerce HTML DOM structures.
 */
export async function scrapeProductDirectHtml(
  url: string,
  timeoutMs = 10000
): Promise<{ success: boolean; data?: ExtractedProductData; error?: string; rawHtml?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7,ar;q=0.6",
      "Cache-Control": "no-cache",
    };

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        error: `Landing page returned HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const html = await res.text();
    const cleanUrl = res.url || url;
    const baseOrigin = new URL(cleanUrl).origin;

    // 1. JSON-LD Extraction
    const jsonLdList = extractJsonLd(html);
    let jsonLdProduct: any = null;

    for (const item of jsonLdList) {
      if (item["@type"] === "Product" || item["@type"] === "http://schema.org/Product") {
        jsonLdProduct = item;
        break;
      }
      if (Array.isArray(item["@graph"])) {
        const graphProd = item["@graph"].find(
          (g: any) => g["@type"] === "Product" || g["@type"] === "http://schema.org/Product"
        );
        if (graphProd) {
          jsonLdProduct = graphProd;
          break;
        }
      }
    }

    // 2. Extract Title
    let title: string | null = null;

    if (jsonLdProduct?.name) {
      title = String(jsonLdProduct.name).trim();
    }
    if (!title) {
      title = extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
    }
    if (!title) {
      const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      if (h1Match) {
        title = h1Match[1].replace(/<[^>]*>/g, "").trim();
      }
    }
    if (!title) {
      const titleTagMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      if (titleTagMatch) {
        title = titleTagMatch[1].replace(/<[^>]*>/g, "").trim();
      }
    }

    if (title) {
      title = decodeHtmlEntities(title)
        .replace(/\s*\|\s*.*$/g, "") // remove " | StoreName"
        .replace(/\s*–\s*.*$/g, "")
        .replace(/\s*-\s*.*$/g, "")
        .trim();
    }

    // 3. Extract Main Image & Gallery
    let mainImageUrl: string | null = null;
    const galleryImages: string[] = [];

    if (jsonLdProduct?.image) {
      if (typeof jsonLdProduct.image === "string") {
        mainImageUrl = jsonLdProduct.image;
      } else if (Array.isArray(jsonLdProduct.image) && jsonLdProduct.image.length > 0) {
        mainImageUrl = jsonLdProduct.image[0];
        galleryImages.push(...jsonLdProduct.image.slice(1));
      } else if (jsonLdProduct.image.url) {
        mainImageUrl = jsonLdProduct.image.url;
      }
    }

    if (!mainImageUrl) {
      mainImageUrl = extractMeta(html, "og:image:secure_url") || extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
    }

    // Resolve relative image URLs
    if (mainImageUrl && !mainImageUrl.startsWith("http")) {
      try {
        mainImageUrl = new URL(mainImageUrl, baseOrigin).toString();
      } catch {}
    }

    // Collect other gallery images from OpenGraph or JSON-LD
    const ogImagesRegex = /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/gi;
    let ogMatch;
    while ((ogMatch = ogImagesRegex.exec(html)) !== null) {
      let img = decodeHtmlEntities(ogMatch[1].trim());
      if (img && !img.startsWith("http")) {
        try {
          img = new URL(img, baseOrigin).toString();
        } catch {}
      }
      if (img && img !== mainImageUrl && !galleryImages.includes(img)) {
        galleryImages.push(img);
      }
    }

    // 4. Extract Pricing
    let currentPrice: string | null = null;
    let originalPrice: string | null = null;
    let currency: string = "TND";

    // Try JSON-LD offers
    if (jsonLdProduct?.offers) {
      const offers = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      if (offers?.price) {
        const rawP = String(offers.price);
        const curr = offers.priceCurrency || "TND";
        currency = curr;
        currentPrice = `${rawP} ${curr}`;
      }
    }

    // Try meta og:price:amount or product:price:amount
    if (!currentPrice) {
      const metaPrice = extractMeta(html, "product:price:amount") || extractMeta(html, "og:price:amount");
      const metaCurr = extractMeta(html, "product:price:currency") || extractMeta(html, "og:price:currency") || "TND";
      if (metaPrice) {
        currency = metaCurr;
        currentPrice = `${metaPrice} ${metaCurr}`;
      }
    }

    // Try HTML DOM regex patterns (WooCommerce, YouCan, Shopify, COD funnels)
    if (!currentPrice) {
      // 1. Tunisian price formats: e.g. "49.00 TND", "49 DT", "49,000 DT", "49 د.ت", "49.00DT"
      const tunisianPriceRegex = /(?:class|id|data-[^=]*)?["'][^"']*(?:price|current|sale|amount)[^"']*["'][^>]*>[\s\S]*?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دinar|Dinar)/i;
      const tndMatch = tunisianPriceRegex.exec(html);
      if (tndMatch && tndMatch[1]) {
        currentPrice = `${tndMatch[1]} DT`;
        currency = "TND";
      }
    }

    if (!currentPrice) {
      // General price regex in page body
      const generalPriceMatch = /(\d{1,4}(?:[.,]\d{2,3})?)\s*(?:TND|DT|dt|د\.ت)/i.exec(html);
      if (generalPriceMatch && generalPriceMatch[1]) {
        currentPrice = `${generalPriceMatch[1]} DT`;
        currency = "TND";
      }
    }

    // Extract Crossed-out / Regular Price
    const delPriceMatch = /<(?:del|s|span)[^>]*(?:class|id)=["'][^"']*(?:old|regular|compare|original|was)[^"']*["'][^>]*>[\s\S]*?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت)?/i.exec(html);
    if (delPriceMatch && delPriceMatch[1] && currentPrice && !currentPrice.startsWith(delPriceMatch[1])) {
      originalPrice = `${delPriceMatch[1]} ${currency === "TND" ? "DT" : currency}`;
    }

    // 5. Extract Bundle Offers
    const allOffers: Array<{ tier_name: string; price: string; savings?: string }> = [];
    const packRegex = /(?:Pack|pack|باقة|عرض|Offre)\s*(?:de\s*)?(\d+|duo|trio|familial)[\s\S]*?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:DT|TND|dt)/gi;
    let packMatch;
    let tierCount = 0;

    while ((packMatch = packRegex.exec(html)) !== null && tierCount < 4) {
      const tierName = `Pack ${packMatch[1]}`;
      const tierPrice = `${packMatch[2]} DT`;
      if (!allOffers.some((o) => o.tier_name === tierName)) {
        allOffers.push({ tier_name: tierName, price: tierPrice });
        tierCount++;
      }
    }

    // Discount or promotional offer summary
    let discountOrOffer: string | null = null;
    const discountMatch = /(\d{1,2}%\s*(?:de\s*réduction|off|de\s*remise|تخفيض)|Achetez\s*\d+\s*obtenez\s*\d+|Buy\s*\d+\s*Get\s*\d+)/i.exec(html);
    if (discountMatch) {
      discountOrOffer = discountMatch[1].trim();
    } else if (originalPrice && currentPrice) {
      discountOrOffer = `Promo: ${currentPrice} au lieu de ${originalPrice}`;
    }

    // Delivery info
    let deliveryCost: string | null = null;
    const isFreeDelivery =
      html.toLowerCase().includes("livraison gratuite") ||
      html.toLowerCase().includes("توصيل مجاني") ||
      html.toLowerCase().includes("free delivery");
    if (isFreeDelivery) {
      deliveryCost = "Livraison Gratuite";
    }

    if (!title && !currentPrice && !mainImageUrl) {
      return {
        success: false,
        error: "Could not detect product details from landing page HTML.",
        rawHtml: html,
      };
    }

    return {
      success: true,
      data: {
        title: title || "Product Landing Page",
        current_price: currentPrice || "0 DT",
        original_price: originalPrice || undefined,
        currency: currency || "TND",
        discount_or_offer: discountOrOffer || undefined,
        delivery_cost: deliveryCost || undefined,
        main_image_url: mainImageUrl || undefined,
        gallery_images: galleryImages.length > 0 ? galleryImages : undefined,
        all_offers: allOffers.length > 0 ? allOffers : undefined,
      },
      rawHtml: html,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to fetch and scrape landing page HTML.",
    };
  }
}
