import type { ExtractedProductData } from "@/types";
import net from "net";
import { isCategoryUrl } from "./url-parser";

/**
 * Helper to check if a schema.org @type matches Product
 */
function isProductSchemaType(type: any): boolean {
  if (typeof type === "string") {
    return (
      type === "Product" ||
      type === "http://schema.org/Product" ||
      type === "https://schema.org/Product" ||
      type === "IndividualProduct"
    );
  }
  if (Array.isArray(type)) {
    return type.some((t) => isProductSchemaType(t));
  }
  return false;
}

/**
 * Extracts JSON-LD schema objects from HTML content.
 */
export function extractJsonLd(html: string): any[] {
  const results: any[] = [];
  const regex = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      let raw = match[1].trim();
      if (raw.startsWith("<!--")) {
        raw = raw.replace(/^<!--\s*/, "").replace(/\s*-->$/, "");
      }
      const parsed = JSON.parse(raw);
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
    .replace(/(?:TND|DT|dt|د\.ت|دت|دinar|Dinar|USD|EUR|MAD|DZD|dinars?|دنانير|دينار|DH|dh|د\.م|درهم|SAR|SR|AED|\$|€|£)/gi, "")
    .replace(/[\d.,\s\r\n\t\-–—+/:%()]/g, "");
  // If after removing numbers, currency tokens, and symbols, there are almost no letters left (less than 3 chars), it's a price string!
  return withoutPrices.length < 3;
}

/**
 * Detects if a candidate title string is actually an urgency marquee, countdown banner,
 * promotional ticker, stock alert, or call-to-action widget rather than a real product title.
 * Examples: "فرصة ما تتفوّتش! تبقّى فقط 9 قطع في المخزون", "سارع بالطلب الآن! الكمية محدودة", "عرض سريع! المخزون يوشك على النفاد"
 */
export function isUrgencyOrPromoBanner(str: string): boolean {
  if (!str) return false;
  const s = str.trim().toLowerCase();

  // Arabic urgency, countdown, stock, delivery, and CTA patterns
  if (
    /فرصة ما تتفو|لا تفوت الفرصة|تبق[ىت] فقط|بق[يي] فقط|باقي فقط|قطع[ة]? في المخزون|الكمية محدودة|كمية محدودة|سارع بالطلب|سارع قبل|سارع الآن|عرض سريع|عرض خاص|عرض محدود|المخزون يوشك|أ?طلب الآن|اطلب الان|الدفع عند ال?إ?ستلام|التوصيل مجاني|توصيل مجاني|توصيل سريع|اختر من بين عروضنا|عروضنا الخاصة|منتجات قد تعجبك|قد يعجبك ايضا/i.test(
      s
    )
  ) {
    return true;
  }

  // French urgency, stock, delivery, and CTA patterns
  if (
    /ne ratez pas|ne manquez pas|plus que \d+ pi[èe]ces?|pi[èe]ces? en stock|quantit[ée] limit[ée]e|stock limit[ée]|stock [ée]puis[ée]|d[ée]p[êe]chez-vous|commandez vite|commandez maintenant|offre sp[ée]ciale|offre limit[ée]e|vente flash|livraison gratuite|paiement [àa] la livraison|produits similaires|vous aimerez aussi/i.test(
      s
    )
  ) {
    return true;
  }

  // English urgency, stock, delivery, and CTA patterns
  if (
    /don'?t miss out|hurry up|limited (?:stock|quantity)|only \d+ left|special offer|flash sale|free shipping|cash on delivery|you may also like|related products/i.test(
      s
    )
  ) {
    return true;
  }

  return false;
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
    let s = img.trim();
    if (s.includes("[[") || s.includes("{{") || s.length < 5) return null;
    if (isTrackingBeacon(s)) return null;

    // Decode HTML entities if encoded in attribute
    s = decodeHtmlEntities(s);

    // Unwrap Next.js image optimizer URL: /_next/image?url=https%3A%2F%2F... or https://domain/_next/image?url=...
    const nextImgMatch = s.match(/\/_next\/image\/?\?url=([^&]+)/i);
    if (nextImgMatch && nextImgMatch[1]) {
      try {
        const decoded = decodeURIComponent(nextImgMatch[1]);
        if (decoded.startsWith("http") || decoded.startsWith("/")) {
          s = decoded;
        }
      } catch {}
    }

    if (s.toLowerCase().endsWith(".svg") || s.toLowerCase().includes("shape.svg")) return null;
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
 * Extracts the official brand/store logo from an e-commerce website HTML.
 * Priority:
 * 1. JSON-LD Schema: Organization, Brand, Store, or WebSite publisher logo
 * 2. High-res Apple Touch Icons (<link rel="apple-touch-icon" ...>)
 * 3. OpenGraph / Twitter logo metadata (<meta property="og:logo">)
 * 4. Primary Navbar / Header Logo (<img class/id/alt="*logo*">)
 * 5. High-res Favicons (<link rel="icon" sizes="..." ...>)
 *
 * Normalizes relative URLs using baseUrl, verifies protocol, and filters out tracking beacons and payment badges.
 */
export function extractStoreLogoFromHtml(html: string, baseUrl: string): string | null {
  if (!html || typeof html !== "string") return null;

  const isTrackerOrBeacon = (url: string): boolean => {
    const s = url.toLowerCase();
    return (
      s.includes("facebook.com/tr") ||
      s.includes("connect.facebook.net") ||
      s.includes("analytics.tiktok") ||
      s.includes("google-analytics") ||
      s.includes("googletagmanager") ||
      s.includes("doubleclick.net") ||
      s.includes("bat.bing.com") ||
      s.includes("snapchat.com") ||
      s.includes("pixel") ||
      s.includes("1x1") ||
      s.includes("blank.gif") ||
      s.includes("spacer.gif")
    );
  };

  const resolveUrl = (rel: string | null | undefined): string | null => {
    if (!rel || typeof rel !== "string") return null;
    const trimmed = rel.trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.length < 5) return null;
    if (isTrackerOrBeacon(trimmed)) return null;

    try {
      if (trimmed.startsWith("//")) {
        return `https:${trimmed}`;
      }
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed;
      }
      if (baseUrl) {
        return new URL(trimmed, baseUrl).href;
      }
      return null;
    } catch {
      return null;
    }
  };

  const isBadLogoCandidate = (url: string, contextTag?: string): boolean => {
    const s = url.toLowerCase();
    const tag = (contextTag || "").toLowerCase();

    // Reject payment badges, credit cards, social icons, flags, rating stars, carts, banners
    if (
      s.includes("visa") ||
      s.includes("mastercard") ||
      s.includes("paypal") ||
      s.includes("stripe") ||
      s.includes("cmi") ||
      s.includes("edinar") ||
      s.includes("sobflous") ||
      s.includes("payment") ||
      s.includes("badge") ||
      s.includes("trust") ||
      s.includes("guarantee") ||
      s.includes("flag") ||
      s.includes("star") ||
      s.includes("rating") ||
      s.includes("cart") ||
      s.includes("bag") ||
      s.includes("social") ||
      s.includes("facebook") ||
      s.includes("instagram") ||
      s.includes("tiktok") ||
      s.includes("youtube") ||
      s.includes("twitter") ||
      s.includes("whatsapp") ||
      s.includes("banner") ||
      s.includes("hero") ||
      s.includes("slider") ||
      s.includes("blank.gif") ||
      s.includes("spacer.gif") ||
      s.includes("defaultstorelogo") ||
      s.includes("default_logo") ||
      s.includes("default-logo") ||
      s.includes("placeholder") ||
      s.includes("no-logo") ||
      s.includes("nologo") ||
      s.includes("dummy") ||
      s.includes("google.com/s2/favicons") ||
      s.includes("globe")
    ) {
      return true;
    }

    if (
      tag.includes("payment") ||
      tag.includes("credit-card") ||
      (tag.includes("footer") && !tag.includes("logo"))
    ) {
      return true;
    }

    return false;
  };

  // 1. Check JSON-LD for Organization, Brand, Store, or WebSite publisher logo
  try {
    const jsonLdList = extractJsonLd(html);
    for (const item of jsonLdList) {
      const candidates = [item];
      if (Array.isArray(item["@graph"])) {
        candidates.push(...item["@graph"]);
      }

      for (const c of candidates) {
        if (!c || typeof c !== "object") continue;
        const type = String(c["@type"] || "").toLowerCase();
        if (
          type.includes("organization") ||
          type.includes("brand") ||
          type.includes("store") ||
          type.includes("onlinestore") ||
          type.includes("localbusiness") ||
          type.includes("website")
        ) {
          const rawLogo = c.logo || (type !== "website" ? c.image : null);
          const logoCandidate = extractImageUrl(rawLogo);
          const resolved = resolveUrl(logoCandidate);
          if (resolved && !isBadLogoCandidate(resolved)) {
            return resolved;
          }
        }
      }
    }
  } catch {}

  // 2. High-res Apple Touch Icon (<link rel="apple-touch-icon" href="...">)
  // Standard 180x180 or 512x512 official brand app icons across Shopify, WooCommerce, YouCan
  const appleTouchMatch =
    html.match(/<link\s+[^>]*rel=["'](?:apple-touch-icon|apple-touch-icon-precomposed)["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:apple-touch-icon|apple-touch-icon-precomposed)["']/i);
  if (appleTouchMatch && appleTouchMatch[1]) {
    const resolved = resolveUrl(appleTouchMatch[1]);
    if (resolved && !isBadLogoCandidate(resolved)) {
      return resolved;
    }
  }

  // 3. OpenGraph / Meta logo
  const ogLogo =
    extractMeta(html, "og:logo") ||
    extractMeta(html, "og:image:logo") ||
    extractMeta(html, "twitter:image:src");
  if (ogLogo) {
    const resolved = resolveUrl(ogLogo);
    if (resolved && !isBadLogoCandidate(resolved)) {
      return resolved;
    }
  }

  // 4. Header or Navbar wrapper logo image
  // Check container elements with class/id containing logo e.g. <div class="*logo*">...<img src="...">
  const containerRegex =
    /<(?:div|header|nav|a|span|figure)[^>]*?(?:class|id)=["'][^"']*(?:menu__logo|header__logo|site-logo|site-branding|navbar-brand|brand-logo|logo)[^"']*["'][^>]*?>([\s\S]*?)<\/(?:div|header|nav|a|span|figure)>/gi;
  let containerMatch;
  while ((containerMatch = containerRegex.exec(html)) !== null) {
    const innerHtml = containerMatch[1];
    const innerImgMatch = /<img\s+([^>]*?)>/i.exec(innerHtml);
    if (innerImgMatch) {
      const attrs = innerImgMatch[1];
      const srcMatch = attrs.match(/(?:src|data-src)=["']([^"']+)["']/i);
      if (srcMatch && srcMatch[1]) {
        const resolved = resolveUrl(srcMatch[1]);
        if (resolved && !isBadLogoCandidate(resolved, attrs)) {
          return resolved;
        }
      }
    }
  }

  // 4b. Direct <img> tags with logo in class, id, alt, or src
  const imgRegex = /<img\s+([^>]*?)>/gi;
  let match;
  let bestHeaderLogo: string | null = null;

  while ((match = imgRegex.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch = attrs.match(/(?:src|data-src)=["']([^"']+)["']/i);
    if (!srcMatch || !srcMatch[1]) continue;

    const rawSrc = srcMatch[1];
    const resolved = resolveUrl(rawSrc);
    if (!resolved || isBadLogoCandidate(resolved, attrs)) continue;

    const hasLogoInAttr =
      /(?:class|id|alt)=["'][^"']*(?:logo|brand|site-title|header__logo)[^"']*["']/i.test(attrs);
    const hasLogoInSrc = /(?:logo|brand)[^/]*\.(?:png|jpg|jpeg|webp|svg)/i.test(resolved);

    // If both attr and src indicate logo, high confidence match
    if (hasLogoInAttr && hasLogoInSrc) {
      return resolved;
    }

    if (hasLogoInAttr && !bestHeaderLogo) {
      bestHeaderLogo = resolved;
    } else if (hasLogoInSrc && !bestHeaderLogo) {
      bestHeaderLogo = resolved;
    }
  }

  if (bestHeaderLogo) {
    return bestHeaderLogo;
  }

  // 5. Large high-res Favicons (<link rel="icon" sizes="192x192|180x180|512x512|32x32" ...>)
  const iconMatches = [...html.matchAll(/<link\s+[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*>/gi)];
  let fallbackIcon: string | null = null;
  let maxIconSize = 0;

  for (const m of iconMatches) {
    const tag = m[0];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch || !hrefMatch[1]) continue;

    const resolved = resolveUrl(hrefMatch[1]);
    if (!resolved || isBadLogoCandidate(resolved)) continue;

    const sizesMatch = tag.match(/sizes=["'](\d+)x(\d+)["']/i);
    if (sizesMatch) {
      const size = parseInt(sizesMatch[1], 10);
      if (size > maxIconSize) {
        maxIconSize = size;
        fallbackIcon = resolved;
      }
    } else if (!fallbackIcon && !resolved.endsWith(".ico")) {
      fallbackIcon = resolved;
    } else if (!fallbackIcon) {
      fallbackIcon = resolved;
    }
  }

  if (fallbackIcon) {
    return fallbackIcon;
  }

  return null;
}

/**
 * Parses product data from raw or rendered HTML (and optional markdown).
 */
export function parseProductHtmlContent(
  html: string,
  url: string,
  markdown?: string,
  options?: {
    defaultCurrency?: string;
    defaultCurrencySymbol?: string;
  }
): { success: boolean; data?: ExtractedProductData; error?: string } {
  try {
    const baseOrigin = new URL(url).origin;

    // 1. JSON-LD Extraction & Custom Platform Data Extraction
    const jsonLdList = extractJsonLd(html);
    let jsonLdProduct: any = null;

    for (const item of jsonLdList) {
      if (isProductSchemaType(item["@type"])) {
        jsonLdProduct = item;
        break;
      }
      if (Array.isArray(item["@graph"])) {
        const graphProd = item["@graph"].find(
          (g: any) => isProductSchemaType(g["@type"])
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

    if (jsonLdProduct?.name && !isPriceString(String(jsonLdProduct.name)) && !isUrgencyOrPromoBanner(String(jsonLdProduct.name))) {
      title = String(jsonLdProduct.name).trim();
    } else if (convertyProduct?.name && !isPriceString(String(convertyProduct.name)) && !isUrgencyOrPromoBanner(String(convertyProduct.name))) {
      title = String(convertyProduct.name).trim();
    } else if ((nextDataProduct?.title || nextDataProduct?.name) && !isPriceString(String(nextDataProduct.title || nextDataProduct.name)) && !isUrgencyOrPromoBanner(String(nextDataProduct.title || nextDataProduct.name))) {
      title = String(nextDataProduct.title || nextDataProduct.name).trim();
    }

    // 2b. Check COD platform form inputs (Stocki, YouCan, Funnelish, custom COD landing pages)
    if (!title && html) {
      const formNameMatch =
        html.match(/<input[^>]+name=["'](?:name|product_name|nom_produit|item_name|titre)["'][^>]+value=["']([^"']+)["']/i) ||
        html.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["'](?:name|product_name|nom_produit|item_name|titre)["']/i);
      if (formNameMatch && formNameMatch[1] && !isPriceString(formNameMatch[1]) && !isUrgencyOrPromoBanner(formNameMatch[1])) {
        title = formNameMatch[1].trim();
      }
    }

    if (!title) {
      const ogTitle = extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
      if (ogTitle && !isPriceString(ogTitle) && !isUrgencyOrPromoBanner(ogTitle)) {
        title = ogTitle;
      }
    }

    // Iterate through all h1 headings to bypass scrolling promotional tickers, stock alerts, or urgency banners
    if (!title && html) {
      const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
      for (const m of h1Matches) {
        const candidate = m[1].replace(/<[^>]*>/g, "").trim();
        if (candidate.length >= 3 && !isPriceString(candidate) && !isUrgencyOrPromoBanner(candidate)) {
          title = candidate;
          break;
        }
      }
    }

    // Fallback to h2 / h3 headings if h1 was absent or was just a price badge / urgency banner
    if (!title && html) {
      const headingMatches = [...html.matchAll(/<(?:h2|h3)[^>]*>([\s\S]*?)<\/(?:h2|h3)>/gi)];
      for (const hm of headingMatches) {
        const candidate = hm[1].replace(/<[^>]*>/g, "").trim();
        if (
          candidate.length >= 3 &&
          !isPriceString(candidate) &&
          !isUrgencyOrPromoBanner(candidate) &&
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
        if (!isPriceString(candidate) && !isUrgencyOrPromoBanner(candidate)) {
          title = candidate;
        }
      }
    }

    // Markdown heading fallback for SPAs where HTML <title> is just the store name
    if (markdown) {
      const headingMatches = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)];
      for (const hm of headingMatches) {
        const hTitle = hm[1].trim();
        if (
          hTitle.length >= 3 &&
          !isPriceString(hTitle) &&
          !isUrgencyOrPromoBanner(hTitle) &&
          !hTitle.toLowerCase().includes("store") &&
          !hTitle.toLowerCase().includes("boutique")
        ) {
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

    // 3a. Fallback to WebPage / ItemPage schema in JSON-LD if Product schema was absent
    if (!mainImageUrl && jsonLdList.length > 0) {
      for (const item of jsonLdList) {
        const checkItem = (obj: any) => {
          if (!obj || typeof obj !== "object") return;
          if (obj["@type"] === "WebPage" || obj["@type"] === "ItemPage" || obj["@type"] === "ImageObject") {
            const candidate = extractImageUrl(obj.image || obj.primaryImageOfPage || obj.url || obj.contentUrl);
            if (candidate && !mainImageUrl && !isTrackingBeacon(candidate)) {
              mainImageUrl = candidate;
            }
          }
        };
        checkItem(item);
        if (Array.isArray(item["@graph"])) {
          for (const g of item["@graph"]) checkItem(g);
        }
      }
    }

    if (!mainImageUrl) {
      mainImageUrl = extractImageUrl(
        extractMeta(html, "og:image:secure_url") || extractMeta(html, "og:image") || extractMeta(html, "twitter:image")
      );
    }

    // 3b. High-confidence Platform Product Image Selectors (WooCommerce, Shopify, YouCan, Stocki)
    if (!mainImageUrl && html) {
      const wooImgMatch =
        html.match(/<img[^>]+class=["'][^"']*(?:wp-post-image|woocommerce-product-gallery__image|attachment-woocommerce_single|attachment-shop_single)[^"']*["'][^>]*>/i) ||
        html.match(/<img[^>]+data-large_image=["']([^"']+)["'][^>]*>/i) ||
        html.match(/<div[^>]+class=["'][^"']*(?:woocommerce-product-gallery__image|product__media)[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);

      if (wooImgMatch) {
        const fullTag = wooImgMatch[0];
        const dataLarge = wooImgMatch[1] || fullTag.match(/data-large_image=["']([^"']+)["']/i)?.[1];
        const dataSrc = fullTag.match(/data-src=["']([^"']+)["']/i)?.[1];
        const srcMatch = fullTag.match(/src=["']([^"']+)["']/i)?.[1];
        const candidate = extractImageUrl(dataLarge || dataSrc || srcMatch);
        if (candidate && !isTrackingBeacon(candidate, fullTag)) {
          mainImageUrl = candidate;
        }
      }
    }

    // Markdown/HTML image fallback for dynamic DOMs
    if (!mainImageUrl && markdown) {
      const mdImgMatches = [...markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/gi)];
      for (const m of mdImgMatches) {
        const candidate = extractImageUrl(m[2]);
        if (candidate && !candidate.endsWith(".svg") && !candidate.includes("shape.svg") && !candidate.includes("logo")) {
          mainImageUrl = candidate;
          break;
        }
      }
    }

    if (!mainImageUrl && html) {
      const imgRegex = /<img\s+([^>]+)>/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(html)) !== null) {
        const fullTag = imgMatch[0];
        const srcAttr = fullTag.match(/src=["']([^"']+)["']/i)?.[1] || "";
        const dataSrcAttr = fullTag.match(/data-src=["']([^"']+)["']/i)?.[1] || "";
        const srcsetAttr = fullTag.match(/srcset=["']([^"']+)["']/i)?.[1] || "";

        let rawCandidate = srcAttr || dataSrcAttr;
        if ((!rawCandidate || rawCandidate.startsWith("data:")) && srcsetAttr) {
          const firstSrcset = srcsetAttr.split(",")[0].trim().split(/\s+/)[0];
          if (firstSrcset) rawCandidate = firstSrcset;
        }

        const src = extractImageUrl(rawCandidate);
        if (!src) continue;

        const preContext = html.slice(Math.max(0, imgMatch.index - 200), imgMatch.index);
        const isEnclosedInLogoOrHeader =
          /(?:class|id)=["'][^"']*(?:logo|brand|menu__logo|site-header|navbar)[^"']*/i.test(preContext) ||
          /<a\s+[^>]*href=["'](?:\/|https?:\/\/[^\/"'\s]+\/?)["'][^>]*>\s*$/i.test(preContext.trim());

        const isLogoOrTiny =
          isEnclosedInLogoOrHeader ||
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

    // Detect currency & symbol from options or domain or page hints
    const isMoroccoDomain = /\.ma(\/|$)/i.test(url);
    const hasMoroccanHint =
      isMoroccoDomain ||
      /og:price:currency["'][^>]*content=["']MAD/i.test(html) ||
      /(?:DH|MAD|د\.م|درهم)/i.test(html);

    const isTunisiaDomain = /\.tn(\/|$)/i.test(url);
    const hasTunisianHint =
      isTunisiaDomain ||
      /(?:DT|TND|dt|د\.ت|دت|دinar|Dinar)/i.test(html) ||
      html.includes("+216") ||
      /(?:livraison|توصيل|دينار)/i.test(html);

    const isLocalStore =
      options?.defaultCurrency === "TND" ||
      options?.defaultCurrency === "MAD" ||
      hasMoroccanHint ||
      hasTunisianHint;

    let currency: string =
      options?.defaultCurrency ||
      (hasMoroccanHint && !options?.defaultCurrency ? "MAD" : "TND");

    let currencySymbol: string =
      options?.defaultCurrencySymbol ||
      (currency === "MAD" ? "DH" : "DT");

    let isHighConfidencePrice = false;

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
        currentPrice = `${pVal} ${currencySymbol}`;
        isHighConfidencePrice = true;
      }
      if (compVal !== undefined && compVal !== null && Number(compVal) > Number(pVal)) {
        originalPrice = `${compVal} ${currencySymbol}`;
      }
    }

    // 4b. Check JSON-LD offers price
    if (!currentPrice && jsonLdProduct?.offers) {
      const offer = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      const rawOfferPrice = offer?.price ?? offer?.lowPrice ?? offer?.priceSpecification?.price;
      if (rawOfferPrice !== undefined && rawOfferPrice !== null && String(rawOfferPrice).trim() !== "") {
        let priceNum = parseFloat(String(rawOfferPrice).replace(",", "."));
        if (currency === "TND" && priceNum >= 1000 && (String(rawOfferPrice).includes(",000") || String(rawOfferPrice).includes(".000"))) {
          priceNum = Math.round(priceNum / 1000);
        }
        const offerCurrency = offer.priceCurrency || offer.priceSpecification?.priceCurrency;
        if (offerCurrency) {
          const rawOfferCurr = String(offerCurrency).trim().toUpperCase();
          const isForeignGeoSwitch = (rawOfferCurr === "USD" || rawOfferCurr === "EUR" || rawOfferCurr === "GBP") && isLocalStore;

          if (isForeignGeoSwitch) {
            // First check if OpenGraph contains the authentic local store currency before using geo-converted price
            const ogPrice = extractMeta(html, "product:sale_price:amount") || extractMeta(html, "og:price:amount") || extractMeta(html, "product:price:amount");
            const ogCurr = (extractMeta(html, "product:sale_price:currency") || extractMeta(html, "og:price:currency") || extractMeta(html, "product:price:currency"))?.trim().toUpperCase();
            if (ogPrice && (ogCurr === "TND" || ogCurr === "MAD" || (!ogCurr && isLocalStore))) {
              let ogNum = parseFloat(ogPrice.replace(",", "."));
              if (currency === "TND" && ogNum >= 1000 && (ogPrice.includes(",000") || ogPrice.includes(".000"))) {
                ogNum = Math.round(ogNum / 1000);
              }
              currentPrice = `${ogNum} ${currencySymbol}`;
              isHighConfidencePrice = true;
            } else {
              // Preserve the foreign currency symbol ($ or €) so it gets flagged cleanly for local worker residential validation
              currency = rawOfferCurr;
              currencySymbol = rawOfferCurr === "EUR" ? "€" : rawOfferCurr === "GBP" ? "£" : "$";
              currentPrice = `${currencySymbol}${priceNum}`;
              isHighConfidencePrice = false;
            }
          } else {
            currency = rawOfferCurr;
            if (currency === "MAD") currencySymbol = "DH";
            else if (currency === "TND") currencySymbol = "DT";
            else if (currency === "EUR") currencySymbol = "€";
            else if (currency === "USD") currencySymbol = "$";
            else currencySymbol = currency;
            currentPrice = `${priceNum} ${currencySymbol}`;
            isHighConfidencePrice = true;
          }
        } else {
          currentPrice = `${priceNum} ${currencySymbol}`;
          isHighConfidencePrice = true;
        }
      }
      if (offer?.highPrice && parseFloat(offer.highPrice) > parseFloat(offer.price || "0")) {
        originalPrice = `${offer.highPrice} ${currencySymbol}`;
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
          if (currency === "TND" && num >= 1000 && (cleaned.includes(",000") || cleaned.includes(".000"))) {
            num = Math.round(num / 1000);
          }
          currentPrice = `${num} ${currencySymbol}`;
          isHighConfidencePrice = true;
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
          if (currency === "TND" && num >= 1000 && (cleanedPrice.includes(",000") || cleanedPrice.includes(".000"))) {
            num = Math.round(num / 1000);
          }
          const detectedCurr = (extractMeta(html, "product:price:currency") || extractMeta(html, "og:price:currency"))?.trim().toUpperCase();
          if (detectedCurr) {
            if (detectedCurr === "USD" && isLocalStore) {
              // Ignore USD geo-switch from cloud scrapers on local stores
            } else {
              currency = detectedCurr;
              if (currency === "MAD") currencySymbol = "DH";
              else if (currency === "TND") currencySymbol = "DT";
              else currencySymbol = currency;
            }
          }
          currentPrice = `${num} ${currencySymbol}`;
          isHighConfidencePrice = true;
        }
      }
    }

    // 4e. Check OpenGraph Title or Description for price
    if (!currentPrice) {
      const ogDesc = extractMeta(html, "og:description") || extractMeta(html, "description") || "";
      const descPriceMatch = /(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دت|MAD|DH|dh|د\.م|درهم)/i.exec(ogDesc);
      if (descPriceMatch && descPriceMatch[1] && Number(descPriceMatch[1].replace(",", ".")) > 0) {
        if (/MAD|DH|dh|د\.م|درهم/i.test(descPriceMatch[0])) {
          currency = "MAD";
          currencySymbol = "DH";
        }
        let numStr = descPriceMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (currency === "TND" && num >= 1000 && (descPriceMatch[1].includes(",000") || descPriceMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        currentPrice = `${num} ${currencySymbol}`;
      }
    }

    // 4f. Try Markdown prices (e.g. from Firecrawl rendered SPA body)
    if (!currentPrice && markdown) {
      // 1. Check discount pair in markdown: e.g. -38% 89,000 د.ت 55,000 د.ت or -20% 300 DH 240 DH
      const discountPairMatch = markdown.match(/-\d{1,2}%\s*(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|دت|DT|TND|د|DH|dh|MAD|د\.م|درهم)\s*(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|دت|DT|TND|د|DH|dh|MAD|د\.م|درهم)/i);
      if (discountPairMatch) {
        if (/MAD|DH|dh|د\.م|درهم/i.test(discountPairMatch[0])) {
          currency = "MAD";
          currencySymbol = "DH";
        }
        let origNum = parseFloat(discountPairMatch[1].replace(",", "."));
        let currNum = parseFloat(discountPairMatch[2].replace(",", "."));
        if (currency === "TND" && origNum >= 1000) origNum = Math.round(origNum / 1000);
        if (currency === "TND" && currNum >= 1000) currNum = Math.round(currNum / 1000);
        originalPrice = `${origNum} ${currencySymbol}`;
        currentPrice = `${currNum} ${currencySymbol}`;
      }

      // 2. Check checkout total or final price line
      if (!currentPrice) {
        const finalTotalMatch = markdown.match(/(?:المجموع\s*النهائي|Total|Prix\s*Total|السعر\s*:?)\s*(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|دت|DT|TND|د|DH|dh|MAD|د\.م|درهم)/i);
        if (finalTotalMatch) {
          if (/MAD|DH|dh|د\.م|درهم/i.test(finalTotalMatch[0])) {
            currency = "MAD";
            currencySymbol = "DH";
          }
          let numStr = finalTotalMatch[1].replace(",", ".");
          let num = parseFloat(numStr);
          if (currency === "TND" && num >= 1000 && (finalTotalMatch[1].includes(",000") || finalTotalMatch[1].includes(".000"))) {
            num = Math.round(num / 1000);
          }
          currentPrice = `${num} ${currencySymbol}`;
        }
      }
    }

    // 4g. Price container with separate currency elements (e.g. Addy: <span class="...price..."><span class="currency...">د.ت</span>49.000 </span>)
    if (!currentPrice && html) {
      const priceContainerRegex =
        /class=["'][^"']*\b(?:price|product-price|current-price|amount)\b[^"']*["'][^>]*>(?:<[^>]+>|[^\d<])*?(\d{1,4}(?:[.,]\d{1,3})?)/gi;
      let pcMatch;
      while ((pcMatch = priceContainerRegex.exec(html)) !== null) {
        let numStr = pcMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (currency === "TND" && num >= 1000 && (pcMatch[1].includes(",000") || pcMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        if (num > 0 && num <= 50000) {
          currentPrice = `${num} ${currencySymbol}`;
          isHighConfidencePrice = true;
          break;
        }
      }

      if (!currentPrice) {
        const prefixCurrencyRegex =
          /(?:&#x62f;\.&#x62a;|د\.ت|دت|د\.م|درهم|DH|MAD|DT|TND)\s*(?:<\/[^>]+>\s*)*(\d{1,4}(?:[.,]\d{1,3})?)/i;
        const prefMatch = prefixCurrencyRegex.exec(html);
        if (prefMatch && prefMatch[1]) {
          let numStr = prefMatch[1].replace(",", ".");
          let num = parseFloat(numStr);
          if (currency === "TND" && num >= 1000 && (prefMatch[1].includes(",000") || prefMatch[1].includes(".000"))) {
            num = Math.round(num / 1000);
          }
          if (num > 0 && num <= 50000) {
            currentPrice = `${num} ${currencySymbol}`;
            isHighConfidencePrice = true;
          }
        }
      }
    }

    // 4h. Try HTML DOM regex patterns (WooCommerce, YouCan, Shopify, Stocki, COD funnels)
    if (!currentPrice) {
      const regionPriceRegex = /(?:class|id|data-[^=]*)?["'][^"']*(?:price|current|sale|amount|total)[^"']*["'][^>]*>[\s\S]*?(?:^|\s|>)(?:‎|\s)*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دت|دinar|Dinar|MAD|DH|dh|د\.م|درهم)/i;
      const regMatch = regionPriceRegex.exec(html);
      if (regMatch && regMatch[1] && Number(regMatch[1].replace(",", ".")) > 0) {
        if (/MAD|DH|dh|د\.م|درهم/i.test(regMatch[0])) {
          currency = "MAD";
          currencySymbol = "DH";
        }
        let numStr = regMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (currency === "TND" && num >= 1000 && (regMatch[1].includes(",000") || regMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        currentPrice = `${num} ${currencySymbol}`;
      }
    }

    if (!currentPrice) {
      // General price regex in page body
      const generalPriceMatch = /(\d{1,4}(?:[.,]\d{2,3})?)\s*(?:TND|DT|dt|د\.ت|دت|MAD|DH|dh|د\.م|درهم)/i.exec(html);
      if (generalPriceMatch && generalPriceMatch[1] && Number(generalPriceMatch[1].replace(",", ".")) > 0) {
        if (/MAD|DH|dh|د\.م|درهم/i.test(generalPriceMatch[0])) {
          currency = "MAD";
          currencySymbol = "DH";
        }
        let numStr = generalPriceMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (currency === "TND" && num >= 1000 && (generalPriceMatch[1].includes(",000") || generalPriceMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        currentPrice = `${num} ${currencySymbol}`;
      }
    }

    // 4h. WooCommerce / Arabic prefix currency e.g. <bdi><span class="woocommerce-Price-currencySymbol">&#x62f;.&#x62a;</span>99.00</bdi>
    // or (?:&#x62f;\.&#x62a;|د\.ت|دت|DT|TND|د\.م|درهم|DH|MAD)\s*(\d{1,4}(?:[.,]\d{1,3})?)
    if (!currentPrice) {
      const bdiMatch =
        /<bdi>[^<]*(?:<span[^>]*>[^<]*<\/span>[^<]*)?(\d{1,4}(?:[.,]\d{1,3})?)\s*<\/bdi>/i.exec(html) ||
        /(?:&#x62f;\.&#x62a;|د\.ت|دت|د\.م|درهم|DH|MAD)\s*(\d{1,4}(?:[.,]\d{1,3})?)/i.exec(html);
      if (bdiMatch && bdiMatch[1] && Number(bdiMatch[1].replace(",", ".")) > 0) {
        if (/MAD|DH|dh|د\.م|درهم/i.test(bdiMatch[0])) {
          currency = "MAD";
          currencySymbol = "DH";
        }
        let numStr = bdiMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (currency === "TND" && num >= 1000 && (bdiMatch[1].includes(",000") || bdiMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        currentPrice = `${num} ${currencySymbol}`;
      }
    }

    // 4i. Safeguard for micro-prices < 10 from generic unstructured text matches:
    // If the price was NOT from structured data (JSON-LD, form input, meta tag) and is under 10,
    // verify it wasn't a delivery fee (e.g. "Livraison: 7 DT") by checking for real price spans.
    const currentPriceNum = currentPrice ? parseFloat(currentPrice.replace(/[^0-9.]/g, "") || "0") : 0;
    if (!isHighConfidencePrice && currentPrice && currentPriceNum > 0 && currentPriceNum < 10) {
      const spanPriceRegex = /<(?:span|bdi|p|div)[^>]*class=["'][^"']*(?:price|amount|valeur|current|regular|sale|prix)[^"']*["'][^>]*>([^<]+)<\/(?:span|bdi|p|div)>/gi;
      let spMatch;
      while ((spMatch = spanPriceRegex.exec(html)) !== null) {
        const textContent = spMatch[1].trim();
        // Ignore delivery fee or free shipping threshold text
        if (/(?:livraison|delivery|توصيل|frais|d[eè]s|gratuit)/i.test(textContent)) continue;

        const numMatch = textContent.match(/(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دت|دinar|Dinar|MAD|DH|dh|د\.م|درهم)/i);
        if (numMatch && numMatch[1]) {
          let numStr = numMatch[1].replace(",", ".");
          let num = parseFloat(numStr);
          if (currency === "TND" && num >= 1000 && (numMatch[1].includes(",000") || numMatch[1].includes(".000"))) {
            num = Math.round(num / 1000);
          }
          if (num >= 10 && num <= 50000) {
            currentPrice = `${num} ${currencySymbol}`;
            break;
          }
        }
      }
    }

    // Extract Crossed-out / Regular Price if not already extracted
    if (!originalPrice) {
      const delPriceRegex = /<(?:del|s|span)[^>]*(?:class|id)=["'][^"']*(?:old|regular|compare|original|was)[^"']*["'][^>]*>[\s\S]*?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دت|MAD|DH|dh|د\.م|درهم)?/gi;
      let delMatch;
      const currNum = currentPrice ? parseFloat(currentPrice.replace(/[^0-9.]/g, "")) : 0;
      while ((delMatch = delPriceRegex.exec(html)) !== null) {
        let numStr = delMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (currency === "TND" && num >= 1000 && (delMatch[1].includes(",000") || delMatch[1].includes(".000"))) {
          num = Math.round(num / 1000);
        }
        if (num > 0 && num > currNum) {
          originalPrice = `${num} ${currencySymbol}`;
          break;
        }
      }
    }

    // 4i. Check inline CSS line-through for crossed-out original prices (Shopify, WooCommerce, Stocki, page builders)
    if (!originalPrice && html) {
      const lineThroughRegex = /<(?:span|p|div|del|s)[^>]*style=["'][^"']*line-through[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|p|div|del|s)>/gi;
      let ltMatch;
      const currNum = currentPrice ? parseFloat(currentPrice.replace(/[^0-9.]/g, "")) : 0;
      while ((ltMatch = lineThroughRegex.exec(html)) !== null) {
        const textContent = ltMatch[1].replace(/<[^>]*>/g, "").trim();
        const numMatch = /(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:TND|DT|dt|د\.ت|دت|MAD|DH|dh|د\.م|درهم)?/i.exec(textContent);
        if (numMatch && numMatch[1]) {
          let numStr = numMatch[1].replace(",", ".");
          let num = parseFloat(numStr);
          if (currency === "TND" && num >= 1000 && (numMatch[1].includes(",000") || numMatch[1].includes(".000"))) {
            num = Math.round(num / 1000);
          }
          if (num > 0 && num > currNum) {
            originalPrice = `${num} ${currencySymbol}`;
            break;
          }
        }
      }
    }

    // 5. Extract Bundle Offers
    const allOffers: Array<{ tier_name: string; price: string; savings?: string }> = [];
    const packRegex = /(?:Pack|pack|باقة|عرض|Offre)\s*(?:de\s*)?(\d+|duo|trio|familial)[\s\S]*?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:DT|TND|dt|د\.ت|دت|DH|dh|MAD|د\.م|درهم)/gi;
    let packMatch;
    let tierCount = 0;

    while ((packMatch = packRegex.exec(html)) !== null && tierCount < 4) {
      const tierName = `Pack ${packMatch[1]}`;
      const tierPrice = `${packMatch[2]} ${currencySymbol}`;
      if (!allOffers.some((o) => o.tier_name === tierName)) {
        allOffers.push({ tier_name: tierName, price: tierPrice });
        tierCount++;
      }
    }

    // Discount or promotional offer summary
    let discountOrOffer: string | null = null;
    const discountMatch = /(\d{1,2}%\s*(?:de\s*réduction|off|de\s*remise|تخفيض)|Achetez\s*\d+\s*obtenez\s*\d+|Buy\s*\d+\s*Get\s*\d+|-\d{1,2}%|\d{1,3}\s*(?:DT|DH)\s*de\s*(?:réduction|remise))/i.exec(html || markdown || "");
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

    const storeLogoUrl = extractStoreLogoFromHtml(html, url);

    return {
      success: true,
      data: {
        title: title || "Product Landing Page",
        current_price: currentPrice || "",
        original_price: originalPrice || undefined,
        currency: currency || "TND",
        discount_or_offer: discountOrOffer || undefined,
        delivery_cost: deliveryCost || undefined,
        main_image_url: mainImageUrl || undefined,
        gallery_images: galleryImages.length > 0 ? galleryImages : undefined,
        all_offers: allOffers.length > 0 ? allOffers : undefined,
        resolved_url: url,
        store_logo_url: storeLogoUrl || undefined,
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
/**
 * Validates that an IP or hostname is not in a private, loopback, or cloud-metadata subnet.
 * Protects against IPv4 and IPv6 SSRF attacks.
 */
export function isSafePublicUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const hostname = url.hostname.toLowerCase().trim();
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".onion") ||
      hostname.endsWith(".lan") ||
      hostname.endsWith(".home") ||
      hostname.endsWith(".corp")
    ) {
      return false;
    }

    const cleanHost = hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

    const ipVer = net.isIP(cleanHost);
    if (ipVer === 4) {
      const parts = cleanHost.split(".").map(Number);
      const [o1, o2] = parts;
      if (o1 === 127) return false; // 127.0.0.0/8 (Loopback)
      if (o1 === 10) return false;  // 10.0.0.0/8 (Private)
      if (o1 === 192 && o2 === 168) return false; // 192.168.0.0/16 (Private)
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return false; // 172.16.0.0/12 (Private)
      if (o1 === 169 && o2 === 254) return false; // 169.254.0.0/16 (Link-local cloud metadata)
      if (o1 === 0 || o1 >= 224) return false; // Current network, multicast, or reserved
      return true;
    }

    if (ipVer === 6) {
      if (cleanHost === "::1" || cleanHost === "::") return false; // Loopback or unspecified
      if (/^0*(:0*)*:1$/.test(cleanHost)) return false; // Expanded loopback
      if (/^0*(:0*)*:0$/.test(cleanHost)) return false; // Expanded unspecified
      if (cleanHost.startsWith("fc") || cleanHost.startsWith("fd")) return false; // ULA / Private (fc00::/7)
      if (/^fe[89ab]/i.test(cleanHost)) return false; // Link-local (fe80::/10)
      if (/^fe[c-f]/i.test(cleanHost)) return false; // Site-local (fec0::/10)
      if (cleanHost.includes("::ffff:")) return false; // IPv4-mapped IPv6
      return true;
    }

    // Reject non-IP hostnames without a dot (e.g. internal machine names like 'admin', 'metadata')
    if (!hostname.includes(".")) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Direct fallback product extraction from landing page HTML.
 * Parses JSON-LD, OpenGraph, Twitter Cards, and common e-commerce HTML DOM structures.
 * Hardened with SSRF protection, manual redirect validation, byte-capping (512 KB), and active monotonic deadlines.
 */
export async function scrapeProductDirectHtml(
  url: string,
  timeoutMs = 10000,
  maxRedirects = 2,
  options?: { defaultCurrency?: string; defaultCurrencySymbol?: string },
  deadlineMs?: number
): Promise<{ success: boolean; data?: ExtractedProductData; error?: string; rawHtml?: string; finalUrl?: string }> {
  const currentDeadline = deadlineMs || Date.now() + timeoutMs;
  const remainingMs = currentDeadline - Date.now();

  if (remainingMs <= 0) {
    return {
      success: false,
      error: "Scrape deadline exceeded before fetch completed",
    };
  }

  if (isCategoryUrl(url)) {
    return {
      success: false,
      error: `[Ignored] Category URL detected: ${url}. Category listing pages are excluded from product scraping.`,
    };
  }

  if (!isSafePublicUrl(url)) {
    return {
      success: false,
      error: `[Security] Blocked unsafe target: ${url}`,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), remainingMs);

  try {
    let currentUrl = url;
    let res: Response | null = null;
    let redirectHops = 0;
    const maxHttpRedirects = Math.max(1, maxRedirects || 2);

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7,ar;q=0.6",
      "Cache-Control": "no-cache",
    };

    while (true) {
      if (!isSafePublicUrl(currentUrl)) {
        return {
          success: false,
          error: `[Security] Blocked unsafe target: ${currentUrl}`,
        };
      }

      res = await fetch(currentUrl, {
        headers,
        signal: controller.signal,
        redirect: "manual",
      });

      const isRedirect = res.status >= 300 && res.status < 400;
      if (isRedirect) {
        redirectHops++;
        if (redirectHops > maxHttpRedirects) {
          return {
            success: false,
            error: `Too many redirects (exceeded limit of ${maxHttpRedirects})`,
          };
        }

        const locationHeader = res.headers.get("location");
        if (!locationHeader) {
          return {
            success: false,
            error: `Redirect status HTTP ${res.status} returned without Location header`,
          };
        }

        let nextUrl: string;
        try {
          nextUrl = new URL(locationHeader, currentUrl).toString();
        } catch {
          return {
            success: false,
            error: `Invalid redirect Location header: ${locationHeader}`,
          };
        }

        if (!isSafePublicUrl(nextUrl)) {
          return {
            success: false,
            error: `[Security] Blocked redirect to unsafe URL: ${nextUrl}`,
          };
        }

        currentUrl = nextUrl;
        continue;
      }

      break;
    }

    if (!res || !res.ok) {
      const status = res?.status || 500;
      const statusText = res?.statusText || "Internal Server Error";
      const isDead = status === 404 || status === 410;
      return {
        success: false,
        error: isDead
          ? `[Dead link] HTTP ${status}: ${statusText}`
          : `Landing page returned HTTP ${status}: ${statusText}`,
      };
    }

    // Verify content-length header if provided
    const contentLength = Number(res.headers.get("content-length"));
    if (contentLength && contentLength > 3 * 1024 * 1024) {
      return {
        success: false,
        error: `Response size exceeds limit (${contentLength} bytes)`,
      };
    }

    // Stream up to 512 KB to prevent memory exhaustion
    // The timeout remains active throughout the streaming process
    let html = "";
    if (res.body) {
      const maxBytes = 512 * 1024;
      const reader = res.body.getReader();
      let receivedBytes = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          if (receivedBytes >= maxBytes) {
            reader.cancel();
            break;
          }
        }
      }

      const totalBuffer = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const c of chunks) {
        totalBuffer.set(c.slice(0, Math.min(c.length, receivedBytes - offset)), offset);
        offset += c.length;
        if (offset >= receivedBytes) break;
      }
      html = new TextDecoder("utf-8").decode(totalBuffer);
    } else {
      html = await res.text();
    }

    const cleanUrl = currentUrl;
    const baseOrigin = new URL(cleanUrl).origin;

    // Check for deleted / expired short URLs (e.g. shorturl.at, bit.ly 404s)
    if (
      html.includes("This link does not exist") ||
      (html.includes("404 Not Found") && (cleanUrl.includes("shorturl.at") || cleanUrl.includes("bit.ly") || cleanUrl.includes("tinyurl.com")))
    ) {
      return {
        success: false,
        error: "[Dead link] Short link expired or deleted by creator (404).",
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
        if (nextUrl.startsWith("http") && nextUrl !== url && nextUrl !== cleanUrl && isSafePublicUrl(nextUrl)) {
          return scrapeProductDirectHtml(nextUrl, timeoutMs, maxRedirects - 1, options, currentDeadline);
        }
      }

      // Follow JavaScript-based window.location redirects on redirect landing pages
      const jsRedirectMatch = /(?:window\.)?location(?:\.href|\.replace)?\s*=\s*["'](https?:\/\/[^"']+)["']/i.exec(html);
      if (jsRedirectMatch && jsRedirectMatch[1]) {
        const nextUrl = jsRedirectMatch[1].trim();
        if (nextUrl !== url && nextUrl !== cleanUrl && !html.includes("schema.org/Product") && !html.includes("og:price") && isSafePublicUrl(nextUrl)) {
          return scrapeProductDirectHtml(nextUrl, timeoutMs, maxRedirects - 1, options, currentDeadline);
        }
      }
    }

    const parsed = parseProductHtmlContent(html, cleanUrl, undefined, options);
    return {
      ...parsed,
      finalUrl: cleanUrl,
      rawHtml: html,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return {
        success: false,
        error: "Scrape request timed out (deadline exceeded)",
      };
    }
    const isDead =
      err.code === "ENOTFOUND" ||
      err.message?.includes("ENOTFOUND") ||
      err.message?.includes("ECONNREFUSED") ||
      err.message?.includes("ERR_NAME_NOT_RESOLVED");
    return {
      success: false,
      error: isDead
        ? `[Dead link] Domain unreachable (${err.message})`
        : (err.message || "Failed to fetch and scrape landing page HTML."),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches landing page or homepage HTML with timeout and safe URL checks,
 * and extracts the store logo.
 */
export async function extractStoreLogoFromUrl(
  storeUrl: string,
  timeoutMs: number = 8000
): Promise<string | null> {
  if (!storeUrl || !isSafePublicUrl(storeUrl)) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(storeUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    return extractStoreLogoFromHtml(html, res.url || storeUrl);
  } catch {
    return null;
  }
}
