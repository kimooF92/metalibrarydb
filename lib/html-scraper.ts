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
 * Detects if a candidate title string is actually just a price badge, currency, or numerical offer
 * (e.g. "49.000 دت \r\n 68.600 دت", "39 DT", "120.00 TND", "€29.99", etc.)
 */
export function isPriceString(str: string): boolean {
  if (!str) return false;
  const s = str.trim();
  // Strip currency tokens, digits, and common pricing punctuation/symbols
  const withoutPrices = s
    .replace(/(?:TND|DT|dt|د\.ت|دت|دinar|Dinar|USD|EUR|MAD|DZD|dinars?|دنانير|دينار|\$|€|£)/gi, "")
    .replace(/[\d.,\s\r\n\t\-–—+/:%()]/g, "");
  // If after removing numbers, currency tokens, and symbols, there are almost no letters left (less than 3 chars), it's a price string!
  return withoutPrices.length < 3;
}

/**
 * Checks whether an image URL or tag corresponds to an ad tracker, conversion pixel, or invisible beacon.
 */
export function isTrackingBeacon(src: string, tag?: string): boolean {
  if (!src) return true;
  const s = src.toLowerCase();
  if (
    s.includes("facebook.com/tr") ||
    s.includes("connect.facebook.net") ||
    s.includes("analytics.tiktok") ||
    s.includes("google-analytics") ||
    s.includes("googletagmanager") ||
    s.includes("doubleclick.net") ||
    s.includes("bat.bing.com") ||
    s.includes("snapchat.com") ||
    s.includes("pixel") ||
    s.includes("favicon") ||
    s.includes("sprite") ||
    s.includes("blank.gif") ||
    s.includes("spacer.gif") ||
    s.includes("1x1") ||
    s.endsWith(".ico") ||
    s.endsWith(".svg")
  ) {
    return true;
  }
  if (tag) {
    const t = tag.toLowerCase();
    if (
      (t.includes('width="1"') || t.includes("width='1'")) &&
      (t.includes('height="1"') || t.includes("height='1'"))
    ) {
      return true;
    }
    if (t.includes("display:none") || t.includes("display: none")) {
      return true;
    }
  }
  return false;
}

export function extractImageUrl(img: any): string | null {
  if (!img) return null;
  if (typeof img === "string") {
    const s = img.trim();
    if (s.includes("[[") || s.includes("{{") || s.length < 5) return null;
    if (isTrackingBeacon(s)) return null;
    return s;
  }
  if (typeof img === "object") {
    if (typeof img.url === "string") return extractImageUrl(img.url);
    if (typeof img.contentUrl === "string") return extractImageUrl(img.contentUrl);
    if (typeof img.src === "string") return extractImageUrl(img.src);
  }
  return null;
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

    if (jsonLdProduct?.name && !isPriceString(String(jsonLdProduct.name))) {
      title = String(jsonLdProduct.name).trim();
    } else if (convertyProduct?.name && !isPriceString(String(convertyProduct.name))) {
      title = String(convertyProduct.name).trim();
    } else if ((nextDataProduct?.title || nextDataProduct?.name) && !isPriceString(String(nextDataProduct.title || nextDataProduct.name))) {
      title = String(nextDataProduct.title || nextDataProduct.name).trim();
    }

    // 2b. Check COD platform form inputs (Stocki, YouCan, Funnelish, custom COD landing pages)
    if (!title && html) {
      const formNameMatch =
        html.match(/<input[^>]+name=["'](?:name|product_name|nom_produit|item_name|titre)["'][^>]+value=["']([^"']+)["']/i) ||
        html.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["'](?:name|product_name|nom_produit|item_name|titre)["']/i);
      if (formNameMatch && formNameMatch[1] && !isPriceString(formNameMatch[1])) {
        title = formNameMatch[1].trim();
      }
    }

    if (!title) {
      const ogTitle = extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
      if (ogTitle && !isPriceString(ogTitle)) {
        title = ogTitle;
      }
    }

    if (!title) {
      const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      if (h1Match) {
        const candidate = h1Match[1].replace(/<[^>]*>/g, "").trim();
        if (!isPriceString(candidate)) {
          title = candidate;
        }
      }
    }

    // Fallback to h2 / h3 headings if h1 was absent or was just a price badge
    if (!title && html) {
      const headingMatches = [...html.matchAll(/<(?:h2|h3)[^>]*>([\s\S]*?)<\/(?:h2|h3)>/gi)];
      for (const hm of headingMatches) {
        const candidate = hm[1].replace(/<[^>]*>/g, "").trim();
        if (
          candidate.length >= 3 &&
          !isPriceString(candidate) &&
          !/^(?:avis|review|livraison|shipping|connexion|login|panier|cart|contact|menu)/i.test(candidate)
        ) {
          title = candidate;
          break;
        }
      }
    }

    if (!title) {
      const titleTagMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      if (titleTagMatch) {
        const candidate = titleTagMatch[1].replace(/<[^>]*>/g, "").trim();
        if (!isPriceString(candidate)) {
          title = candidate;
        }
      }
    }

    // Markdown heading fallback for SPAs where HTML <title> is just the store name
    if (markdown) {
      const headingMatches = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)];
      for (const hm of headingMatches) {
        const hTitle = hm[1].trim();
        if (hTitle.length >= 3 && !isPriceString(hTitle) && !hTitle.toLowerCase().includes("store") && !hTitle.toLowerCase().includes("boutique")) {
          if (!title || title.length < 3 || title.toLowerCase().includes("store") || title.toLowerCase().includes("boutique")) {
            title = hTitle;
            break;
          }
        }
      }
    }

    if (title) {
      title = decodeHtmlEntities(title).trim();
      if (title.includes("|")) {
        const parts = title.split("|").map((p) => p.trim()).filter(Boolean);
        if (parts.length > 1) {
          parts.sort((a, b) => b.length - a.length);
          title = parts[0];
        }
      } else if (title.includes(" – ")) {
        const parts = title.split(" – ").map((p) => p.trim()).filter(Boolean);
        if (parts.length > 1) {
          parts.sort((a, b) => b.length - a.length);
          title = parts[0];
        }
      } else if (title.includes(" - ")) {
        const parts = title.split(" - ").map((p) => p.trim()).filter(Boolean);
        if (parts.length > 1) {
          const sorted = [...parts].sort((a, b) => b.length - a.length);
          if (sorted[0].length > sorted[1].length * 1.2) {
            title = sorted[0];
          }
        }
      }
      title = title.trim();
    }

    // 3. Extract Main Image & Gallery
    let mainImageUrl: string | null = null;
    const galleryImages: string[] = [];

    if (jsonLdProduct?.image) {
      if (typeof jsonLdProduct.image === "string") {
        mainImageUrl = extractImageUrl(jsonLdProduct.image);
      } else if (Array.isArray(jsonLdProduct.image) && jsonLdProduct.image.length > 0) {
        mainImageUrl = extractImageUrl(jsonLdProduct.image[0]);
        for (const item of jsonLdProduct.image.slice(1)) {
          const imgUrl = extractImageUrl(item);
          if (imgUrl && !galleryImages.includes(imgUrl)) {
            galleryImages.push(imgUrl);
          }
        }
      } else if (typeof jsonLdProduct.image === "object") {
        mainImageUrl = extractImageUrl(jsonLdProduct.image);
      }
    } else if (convertyProduct?.images && Array.isArray(convertyProduct.images) && convertyProduct.images.length > 0) {
      mainImageUrl = extractImageUrl(convertyProduct.images[0]);
      for (const img of convertyProduct.images.slice(1)) {
        const imgUrl = extractImageUrl(img);
        if (imgUrl && !galleryImages.includes(imgUrl)) {
          galleryImages.push(imgUrl);
        }
      }
    } else if (convertyProduct?.thumbnail) {
      mainImageUrl = extractImageUrl(convertyProduct.thumbnail);
    }

    if (!mainImageUrl) {
      mainImageUrl = extractImageUrl(
        extractMeta(html, "og:image:secure_url") || extractMeta(html, "og:image") || extractMeta(html, "twitter:image")
      );
    }

    // Markdown/HTML image fallback for dynamic DOMs
    if (!mainImageUrl && markdown) {
      const mdImgMatch = markdown.match(/!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/i);
      if (mdImgMatch && mdImgMatch[2]) {
        mainImageUrl = extractImageUrl(mdImgMatch[2]);
      }
    }

    if (!mainImageUrl && html) {
      const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(html)) !== null) {
        const fullTag = imgMatch[0];
        const src = extractImageUrl(imgMatch[1]);
        if (!src) continue;

        const isLogoOrTiny =
          /alt=["'][^"']*logo[^"']*["']/i.test(fullTag) ||
          /class=["'][^"']*logo[^"']*["']/i.test(fullTag) ||
          /id=["'][^"']*logo[^"']*["']/i.test(fullTag) ||
          src.includes("logo") ||
          src.includes("icon") ||
          src.includes("favicon") ||
          /width=["'](?:[1-9]|[1-9][0-9]|1[0-2][0-9])["']/i.test(fullTag);

        if (
          !isTrackingBeacon(src, fullTag) &&
          !isLogoOrTiny &&
          !src.includes("svg") &&
          src.length > 25
        ) {
          if (!mainImageUrl) {
            mainImageUrl = src;
          } else if (!galleryImages.includes(src)) {
            galleryImages.push(src);
          }
        }
      }
    }

    // Stocki / Carousel / Product asset image scan fallback
    if (!mainImageUrl && html) {
      const productImgRegex = /https?:\/\/[^"'\s]+\/(?:produit|products|items|uploads|cdn\.shopify\.com)[^"'\s]+\.(?:webp|jpg|jpeg|png|avif)/gi;
      let pMatch;
      while ((pMatch = productImgRegex.exec(html)) !== null) {
        const candidate = pMatch[0];
        if (!isTrackingBeacon(candidate) && !candidate.includes("logo")) {
          mainImageUrl = candidate;
          break;
        }
      }
    }

    // Resolve relative image URLs
    if (mainImageUrl && typeof mainImageUrl === "string" && !mainImageUrl.startsWith("http") && !mainImageUrl.startsWith("data:")) {
      try {
        mainImageUrl = new URL(mainImageUrl, baseOrigin).toString();
      } catch {}
    }

    // Collect other gallery images from OpenGraph or JSON-LD
    const ogImagesRegex = /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/gi;
    let ogMatch;
    while ((ogMatch = ogImagesRegex.exec(html)) !== null) {
      let img = extractImageUrl(decodeHtmlEntities(ogMatch[1].trim()));
      if (img && typeof img === "string" && !img.startsWith("http") && !img.startsWith("data:")) {
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

      if (pVal !== undefined && pVal !== null) {
        currentPrice = `${pVal} DT`;
      }
      if (compVal !== undefined && compVal !== null && Number(compVal) > Number(pVal)) {
        originalPrice = `${compVal} DT`;
      }
    }

    // 4b. Check JSON-LD offers price
    if (!currentPrice && jsonLdProduct?.offers) {
      const offer = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      if (offer?.price) {
        let priceNum = parseFloat(String(offer.price).replace(",", "."));
        if (priceNum >= 1000 && (String(offer.price).includes(",000") || String(offer.price).includes(".000"))) {
          priceNum = Math.round(priceNum / 1000);
        }
        currentPrice = `${priceNum} DT`;
        if (offer.priceCurrency) currency = offer.priceCurrency;
      }
      if (offer?.highPrice && parseFloat(offer.highPrice) > parseFloat(offer.price || "0")) {
        originalPrice = `${offer.highPrice} ${currency === "TND" ? "DT" : currency}`;
      }
    }

    // 4c. Check COD Form hidden price inputs (Stocki, YouCan, Funnelish, custom COD forms)
    if (!currentPrice && html) {
      const formPriceMatch =
        html.match(/<input[^>]+name=["'](?:price|prix|unit_price|amount)["'][^>]+value=["']([^"']+)["']/i) ||
        html.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["'](?:price|prix|unit_price|amount)["']/i);
      if (formPriceMatch && formPriceMatch[1]) {
        const cleaned = formPriceMatch[1].replace(/[^0-9.,]/g, "").trim();
        if (cleaned && Number(cleaned.replace(",", ".")) > 0) {
          let num = parseFloat(cleaned.replace(",", "."));
          if (num >= 1000 && (cleaned.includes(",000") || cleaned.includes(".000"))) {
            num = Math.round(num / 1000);
          }
          currentPrice = `${num} DT`;
          currency = "TND";
        }
      }
    }

    // 4d. Check Meta Tags (og:price:amount, product:price:amount)
    if (!currentPrice) {
      const metaPrice =
        extractMeta(html, "product:price:amount") ||
        extractMeta(html, "og:price:amount") ||
        extractMeta(html, "twitter:data1");
      if (metaPrice) {
        const cleanedPrice = metaPrice.replace(/[^0-9.,]/g, "").trim();
        if (cleanedPrice && Number(cleanedPrice.replace(",", ".")) > 0) {
          let num = parseFloat(cleanedPrice.replace(",", "."));
          if (num >= 1000 && (cleanedPrice.includes(",000") || cleanedPrice.includes(".000"))) {
            num = Math.round(num / 1000);
          }
          currentPrice = `${num} DT`;
          currency = extractMeta(html, "product:price:currency") || extractMeta(html, "og:price:currency") || "TND";
        }
      }
    }

    // 4e. Check OpenGraph Title or Description for price
    if (!currentPrice) {
      const ogDesc = extractMeta(html, "og:description") || extractMeta(html, "description") || "";
      const descPriceMatch = /(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دت)/i.exec(ogDesc);
      if (descPriceMatch && descPriceMatch[1] && Number(descPriceMatch[1].replace(",", ".")) > 0) {
        let numStr = descPriceMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (num >= 1000 && (descPriceMatch[1].includes(",000") || descPriceMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        currentPrice = `${num} DT`;
        currency = "TND";
      }
    }

    // 4f. Try Markdown prices (e.g. from Firecrawl rendered SPA body)
    if (!currentPrice && markdown) {
      // 1. Check discount pair in markdown: e.g. -38% 89,000 د.ت 55,000 د.ت
      const discountPairMatch = markdown.match(/-\d{1,2}%\s*(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|دت|DT|TND|د)\s*(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|دت|DT|TND|د)/i);
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
        const finalTotalMatch = markdown.match(/(?:المجموع\s*النهائي|Total|Prix\s*Total|السعر\s*:?)\s*(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|دت|DT|TND|د)/i);
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

    // 4g. Try HTML DOM regex patterns (WooCommerce, YouCan, Shopify, Stocki, COD funnels)
    if (!currentPrice) {
      const tunisianPriceRegex = /(?:class|id|data-[^=]*)?["'][^"']*(?:price|current|sale|amount|total)[^"']*["'][^>]*>[\s\S]*?(?:^|\s|>)(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دت|دinar|Dinar)/i;
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
      const generalPriceMatch = /(\d{1,4}(?:[.,]\d{2,3})?)\s*(?:TND|DT|dt|د\.ت|دت)/i.exec(html);
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
      const delPriceRegex = /<(?:del|s|span)[^>]*(?:class|id)=["'][^"']*(?:old|regular|compare|original|was)[^"']*["'][^>]*>[\s\S]*?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دت)?/gi;
      let delMatch;
      const currNum = currentPrice ? parseFloat(currentPrice.replace(/[^0-9.]/g, "")) : 0;
      while ((delMatch = delPriceRegex.exec(html)) !== null) {
        let numStr = delMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (num >= 1000 && (delMatch[1].includes(",000") || delMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        if (num > 0 && num > currNum) {
          originalPrice = `${num} ${currency === "TND" ? "DT" : currency}`;
          break;
        }
      }
    }

    // 4h. Check inline CSS line-through for crossed-out original prices (Shopify, WooCommerce, Stocki, page builders)
    if (!originalPrice && html) {
      const lineThroughRegex = /<(?:span|p|div|del|s)[^>]*style=["'][^"']*line-through[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|p|div|del|s)>/gi;
      let ltMatch;
      const currNum = currentPrice ? parseFloat(currentPrice.replace(/[^0-9.]/g, "")) : 0;
      while ((ltMatch = lineThroughRegex.exec(html)) !== null) {
        const textContent = ltMatch[1].replace(/<[^>]*>/g, "").trim();
        const numMatch = /(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دت)?/i.exec(textContent);
        if (numMatch && numMatch[1]) {
          let numStr = numMatch[1].replace(",", ".");
          let num = parseFloat(numStr);
          if (num >= 1000 && (numMatch[1].includes(",000") || numMatch[1].includes(".000"))) {
            num = Math.round(num / 1000);
          }
          if (num > 0 && num > currNum) {
            originalPrice = `${num} ${currency === "TND" ? "DT" : currency}`;
            break;
          }
        }
      }
    }

    // 5. Extract Bundle Offers
    const allOffers: Array<{ tier_name: string; price: string; savings?: string }> = [];
    const packRegex = /(?:Pack|pack|باقة|عرض|Offre)\s*(?:de\s*)?(\d+|duo|trio|familial)[\s\S]*?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:DT|TND|dt|د\.ت|دت)/gi;
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
    const discountMatch = /(\d{1,2}%\s*(?:de\s*réduction|off|de\s*remise|تخفيض)|Achetez\s*\d+\s*obtenez\s*\d+|Buy\s*\d+\s*Get\s*\d+|-\d{1,2}%|\d{1,3}\s*DT\s*de\s*(?:réduction|remise))/i.exec(html || markdown || "");
    if (discountMatch) {
      discountOrOffer = discountMatch[1].trim();
    } else if (originalPrice && currentPrice) {
      const origNum = parseFloat(originalPrice.replace(/[^0-9.]/g, ""));
      const currNum = parseFloat(currentPrice.replace(/[^0-9.]/g, ""));
      if (origNum > currNum && origNum > 0) {
        const pct = Math.round(((origNum - currNum) / origNum) * 100);
        discountOrOffer = `-${pct}% (Promo: ${currentPrice} au lieu de ${originalPrice})`;
      }
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
