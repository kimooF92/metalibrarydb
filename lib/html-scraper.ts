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
 * Parses product data from raw or rendered HTML (and optional markdown).
 */
export function parseProductHtmlContent(
  html: string,
  url: string,
  markdown?: string
): { success: boolean; data?: ExtractedProductData; error?: string } {
  try {
    const baseOrigin = new URL(url).origin;

    // 1. JSON-LD Extraction & Custom Platform Data Extraction
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

    // 1b. Check Converty platform product data (<script id="productData">)
    let convertyProduct: any = null;
    const convertyMatch = /<script\s+id=["']productData["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
    if (convertyMatch && convertyMatch[1]) {
      try {
        convertyProduct = JSON.parse(convertyMatch[1].trim());
      } catch {}
    }

    // 1c. Check Next.js __NEXT_DATA__
    let nextDataProduct: any = null;
    const nextDataMatch = /<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
    if (nextDataMatch && nextDataMatch[1]) {
      try {
        const nextJson = JSON.parse(nextDataMatch[1].trim());
        const pageProps = nextJson?.props?.pageProps;
        nextDataProduct = pageProps?.product || pageProps?.initialProduct || pageProps?.item;
      } catch {}
    }

    // 2. Extract Title
    let title: string | null = null;

    if (jsonLdProduct?.name) {
      title = String(jsonLdProduct.name).trim();
    } else if (convertyProduct?.name) {
      title = String(convertyProduct.name).trim();
    } else if (nextDataProduct?.title || nextDataProduct?.name) {
      title = String(nextDataProduct.title || nextDataProduct.name).trim();
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

    // Markdown heading fallback for SPAs where HTML <title> is just the store name
    if (markdown) {
      const headingMatch = markdown.match(/^#\s+(.+)$/m);
      if (headingMatch && headingMatch[1].trim()) {
        const hTitle = headingMatch[1].trim();
        if (!title || title.length < 3 || title.toLowerCase().includes("store") || title.toLowerCase().includes("boutique")) {
          title = hTitle;
        }
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
    } else if (convertyProduct?.images && Array.isArray(convertyProduct.images) && convertyProduct.images.length > 0) {
      mainImageUrl = convertyProduct.images[0]?.url || convertyProduct.images[0];
      galleryImages.push(
        ...convertyProduct.images.slice(1).map((img: any) => (typeof img === "string" ? img : img.url)).filter(Boolean)
      );
    } else if (convertyProduct?.thumbnail) {
      mainImageUrl = convertyProduct.thumbnail;
    }

    if (!mainImageUrl) {
      mainImageUrl = extractMeta(html, "og:image:secure_url") || extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
    }

    // Markdown/HTML image fallback for dynamic DOMs
    if (!mainImageUrl && markdown) {
      const mdImgMatch = markdown.match(/!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/i);
      if (mdImgMatch && mdImgMatch[2]) {
        mainImageUrl = mdImgMatch[2];
      }
    }

    if (!mainImageUrl && html) {
      const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(html)) !== null) {
        const src = imgMatch[1];
        if (
          !src.includes("pixel") &&
          !src.includes("icon") &&
          !src.includes("svg") &&
          !src.includes("logo") &&
          src.length > 30
        ) {
          if (!mainImageUrl) {
            mainImageUrl = src;
          } else if (!galleryImages.includes(src)) {
            galleryImages.push(src);
          }
        }
      }
    }

    // Resolve relative image URLs
    if (mainImageUrl && !mainImageUrl.startsWith("http") && !mainImageUrl.startsWith("data:")) {
      try {
        mainImageUrl = new URL(mainImageUrl, baseOrigin).toString();
      } catch {}
    }

    // Collect other gallery images from OpenGraph or JSON-LD
    const ogImagesRegex = /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/gi;
    let ogMatch;
    while ((ogMatch = ogImagesRegex.exec(html)) !== null) {
      let img = decodeHtmlEntities(ogMatch[1].trim());
      if (img && !img.startsWith("http") && !img.startsWith("data:")) {
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

    // 4a. Check Converty platform price
    if (convertyProduct) {
      const pVal =
        convertyProduct.price ??
        convertyProduct.salePrice ??
        convertyProduct.variants?.[0]?.price ??
        convertyProduct.variants?.[0]?.salePrice ??
        convertyProduct.offers?.[0]?.price;
      
      const compVal =
        convertyProduct.comparePrice ??
        convertyProduct.regularPrice ??
        convertyProduct.compareAtPrice ??
        convertyProduct.variants?.[0]?.comparePrice ??
        convertyProduct.variants?.[0]?.regularPrice;

      if (pVal !== undefined && pVal !== null && Number(pVal) > 0) {
        currentPrice = `${pVal} DT`;
      }
      if (compVal !== undefined && compVal !== null && Number(compVal) > 0) {
        originalPrice = `${compVal} DT`;
      }
    }

    // 4b. Try JSON-LD offers
    if (!currentPrice && jsonLdProduct?.offers) {
      const offers = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      if (offers?.price && Number(offers.price) > 0) {
        const rawP = String(offers.price);
        const curr = offers.priceCurrency || "TND";
        currency = curr;
        currentPrice = `${rawP} ${curr === "TND" ? "DT" : curr}`;
      }
    }

    // 4c. Try meta og:price:amount or product:price:amount
    if (!currentPrice) {
      const metaPrice = extractMeta(html, "product:price:amount") || extractMeta(html, "og:price:amount");
      const metaCurr = extractMeta(html, "product:price:currency") || extractMeta(html, "og:price:currency") || "TND";
      if (metaPrice && Number(metaPrice) > 0) {
        currency = metaCurr;
        currentPrice = `${metaPrice} ${metaCurr === "TND" ? "DT" : metaCurr}`;
      }
    }

    // 4d. Try JSON state regex (e.g. "price":49 or "regularPrice":79 in scripts)
    if (!currentPrice) {
      const jsonPriceMatch = /["'](?:price|selling_price|current_price|price_amount)["']\s*:\s*(\d+(?:\.\d+)?)/i.exec(html);
      if (jsonPriceMatch && jsonPriceMatch[1] && Number(jsonPriceMatch[1]) > 0) {
        currentPrice = `${jsonPriceMatch[1]} DT`;
        currency = "TND";
      }
    }

    // 4e. Try Markdown prices (e.g. from Firecrawl rendered SPA body)
    if (!currentPrice && markdown) {
      // 1. Check discount pair in markdown: e.g. -38% 89,000 د.ت 55,000 د.ت
      const discountPairMatch = markdown.match(/-\d{1,2}%\s*(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|DT|TND|د)\s*(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|DT|TND|د)/i);
      if (discountPairMatch) {
        let origNum = parseFloat(discountPairMatch[1].replace(",", "."));
        let currNum = parseFloat(discountPairMatch[2].replace(",", "."));
        if (origNum >= 1000) origNum = Math.round(origNum / 1000);
        if (currNum >= 1000) currNum = Math.round(currNum / 1000);
        originalPrice = `${origNum} DT`;
        currentPrice = `${currNum} DT`;
      }

      // 2. Check checkout total or final price line
      if (!currentPrice) {
        const finalTotalMatch = markdown.match(/(?:المجموع\s*النهائي|Total|Prix\s*Total|السعر\s*:?)\s*(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|DT|TND|د)/i);
        if (finalTotalMatch) {
          let numStr = finalTotalMatch[1].replace(",", ".");
          let num = parseFloat(numStr);
          if (num >= 1000 && (finalTotalMatch[1].includes(",000") || finalTotalMatch[1].includes(".000"))) {
            num = Math.round(num / 1000);
          }
          currentPrice = `${num} DT`;
        }
      }
    }

    // 4f. Try HTML DOM regex patterns (WooCommerce, YouCan, Shopify, COD funnels)
    if (!currentPrice) {
      const tunisianPriceRegex = /(?:class|id|data-[^=]*)?["'][^"']*(?:price|current|sale|amount)[^"']*["'][^>]*>[\s\S]*?(?:^|\s|>)(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دinar|Dinar)/i;
      const tndMatch = tunisianPriceRegex.exec(html);
      if (tndMatch && tndMatch[1] && Number(tndMatch[1].replace(",", ".")) > 0) {
        let numStr = tndMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (num >= 1000 && (tndMatch[1].includes(",000") || tndMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        currentPrice = `${num} DT`;
        currency = "TND";
      }
    }

    if (!currentPrice) {
      // General price regex in page body
      const generalPriceMatch = /(\d{1,4}(?:[.,]\d{2,3})?)\s*(?:TND|DT|dt|د\.ت)/i.exec(html);
      if (generalPriceMatch && generalPriceMatch[1] && Number(generalPriceMatch[1].replace(",", ".")) > 0) {
        let numStr = generalPriceMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (num >= 1000 && (generalPriceMatch[1].includes(",000") || generalPriceMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        currentPrice = `${num} DT`;
        currency = "TND";
      }
    }

    // Extract Crossed-out / Regular Price if not already extracted
    if (!originalPrice) {
      const delPriceMatch = /<(?:del|s|span)[^>]*(?:class|id)=["'][^"']*(?:old|regular|compare|original|was)[^"']*["'][^>]*>[\s\S]*?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت)?/i.exec(html);
      if (delPriceMatch && delPriceMatch[1] && currentPrice && !currentPrice.startsWith(delPriceMatch[1])) {
        originalPrice = `${delPriceMatch[1]} ${currency === "TND" ? "DT" : currency}`;
      }
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
    const discountMatch = /(\d{1,2}%\s*(?:de\s*réduction|off|de\s*remise|تخفيض)|Achetez\s*\d+\s*obtenez\s*\d+|Buy\s*\d+\s*Get\s*\d+|-\d{1,2}%)/i.exec(html || markdown || "");
    if (discountMatch) {
      discountOrOffer = discountMatch[1].trim();
    } else if (originalPrice && currentPrice) {
      discountOrOffer = `Promo: ${currentPrice} au lieu de ${originalPrice}`;
    }

    // Delivery info
    let deliveryCost: string | null = null;
    const textToCheck = `${html} ${markdown || ""}`.toLowerCase();
    const isFreeDelivery =
      textToCheck.includes("livraison gratuite") ||
      textToCheck.includes("توصيل مجاني") ||
      textToCheck.includes("شحن مجاني") ||
      textToCheck.includes("free delivery") ||
      textToCheck.includes("free shipping");
    if (isFreeDelivery) {
      deliveryCost = "Livraison Gratuite";
    }

    if (!title && !currentPrice && !mainImageUrl) {
      return {
        success: false,
        error: "Could not detect product details from landing page HTML.",
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
        resolved_url: url,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to parse product data.",
    };
  }
}

/**
 * Direct fallback product extraction from landing page HTML.
 * Parses JSON-LD, OpenGraph, Twitter Cards, and common e-commerce HTML DOM structures.
 */
export async function scrapeProductDirectHtml(
  url: string,
  timeoutMs = 10000,
  maxRedirects = 2
): Promise<{ success: boolean; data?: ExtractedProductData; error?: string; rawHtml?: string; finalUrl?: string }> {
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

    // Check for deleted / expired short URLs (e.g. shorturl.at, bit.ly 404s)
    if (
      html.includes("This link does not exist") ||
      (html.includes("404 Not Found") && (cleanUrl.includes("shorturl.at") || cleanUrl.includes("bit.ly") || cleanUrl.includes("tinyurl.com")))
    ) {
      return {
        success: false,
        error: "Short link expired or deleted by creator (404).",
        rawHtml: html,
      };
    }

    // Follow HTML Meta-Refresh redirects (e.g. <meta http-equiv="refresh" content="0; url=...">)
    if (maxRedirects > 0) {
      const metaRefreshMatch = /<meta\s+[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>\s]+)["']/i.exec(html);
      if (metaRefreshMatch && metaRefreshMatch[1]) {
        let nextUrl = metaRefreshMatch[1].trim();
        if (!nextUrl.startsWith("http")) {
          try {
            nextUrl = new URL(nextUrl, baseOrigin).toString();
          } catch {}
        }
        if (nextUrl.startsWith("http") && nextUrl !== url && nextUrl !== cleanUrl) {
          return scrapeProductDirectHtml(nextUrl, timeoutMs, maxRedirects - 1);
        }
      }

      // Follow JavaScript-based window.location redirects on redirect landing pages
      const jsRedirectMatch = /(?:window\.)?location(?:\.href|\.replace)?\s*=\s*["'](https?:\/\/[^"']+)["']/i.exec(html);
      if (jsRedirectMatch && jsRedirectMatch[1]) {
        const nextUrl = jsRedirectMatch[1].trim();
        if (nextUrl !== url && nextUrl !== cleanUrl && !html.includes("schema.org/Product") && !html.includes("og:price")) {
          return scrapeProductDirectHtml(nextUrl, timeoutMs, maxRedirects - 1);
        }
      }
    }

    const parsed = parseProductHtmlContent(html, cleanUrl);
    return {
      ...parsed,
      finalUrl: cleanUrl,
      rawHtml: html,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to fetch and scrape landing page HTML.",
    };
  }
}
