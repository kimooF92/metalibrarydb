import type { ExtractedProductData } from "@/types";
// Never import from lib/html-scraper.ts (circular dep BUG-24). Import from peer modules only.
import { isPriceString, isUrgencyOrPromoBanner, normalizeTndMillimes } from "./price-parser";
import {
  extractJsonLd,
  extractMeta,
  decodeHtmlEntities,
  isProductSchemaType,
} from "./jsonld-extractor";
import { isSafePublicUrl } from "./ssrf-validator";

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

/**
 * Extracts and normalizes an image URL from strings, objects, and Next.js image wrappers.
 */
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
 * Fetches landing page or homepage HTML with timeout and safe URL checks,
 * and extracts the store logo.
 * Uses peer isSafePublicUrl and extractStoreLogoFromHtml (BUG-25).
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

    // 1. JSON-LD Extraction & Custom Platform Data Extraction (BUG-10 deep graph traversal)
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
      /(?:\bDH\b|\bMAD\b|د\.م|درهم)/.test(html);

    const isTunisiaDomain = /\.tn(\/|$)/i.test(url);
    const hasTunisianHint =
      isTunisiaDomain ||
      /(?:\bDT\b|\bTND\b|\bdt\b|د\.ت|دت|دinar|Dinar)/.test(html) ||
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
        if (currency === "TND") {
          priceNum = normalizeTndMillimes(priceNum, String(rawOfferPrice));
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
              if (currency === "TND") {
                ogNum = normalizeTndMillimes(ogNum, ogPrice);
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
          if (currency === "TND") {
            num = normalizeTndMillimes(num, cleaned);
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
          if (currency === "TND") {
            num = normalizeTndMillimes(num, cleanedPrice);
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
        if (currency === "TND") {
          num = normalizeTndMillimes(num, descPriceMatch[1]);
        }
        currentPrice = `${num} ${currencySymbol}`;
      }
    }

    // 4f. Try Markdown prices (e.g. from Firecrawl rendered SPA body or Playwright innerText)
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

      // 1b. Check labelled product price (e.g. "سعر المنتج\n19.900 دت", "Prix unitaire: 19 DT", "Price: 19 DT")
      if (!currentPrice) {
        const labeledPriceMatch = markdown.match(/(?:سعر(?:\s*المنتج)?|Prix(?:\s*unitaire)?|Price)\s*:?\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|دت|DT|TND|DH|dh|MAD|د\.م|درهم)/i);
        if (labeledPriceMatch && labeledPriceMatch[1] && Number(labeledPriceMatch[1].replace(",", ".")) > 0) {
          if (/MAD|DH|dh|د\.م|درهم/i.test(labeledPriceMatch[0])) {
            currency = "MAD";
            currencySymbol = "DH";
          }
          let numStr = labeledPriceMatch[1].replace(",", ".");
          let num = parseFloat(numStr);
          if (currency === "TND") {
            num = normalizeTndMillimes(num, labeledPriceMatch[1]);
          }
          currentPrice = `${num} ${currencySymbol}`;
        }
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
          if (currency === "TND") {
            num = normalizeTndMillimes(num, finalTotalMatch[1]);
          }
          currentPrice = `${num} ${currencySymbol}`;
        }
      }

      // 3. Check adjacent prices: "19.900 دت 29.850 دت"
      if (!currentPrice) {
        const adjacentPriceMatch = markdown.match(/(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|دت|DT|TND|د|DH|dh|MAD|د\.م|درهم)\s+(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:د\.ت|دت|DT|TND|د|DH|dh|MAD|د\.م|درهم)/i);
        if (adjacentPriceMatch) {
          if (/MAD|DH|dh|د\.م|درهم/i.test(adjacentPriceMatch[0])) {
            currency = "MAD";
            currencySymbol = "DH";
          }
          let p1 = parseFloat(adjacentPriceMatch[1].replace(",", "."));
          let p2 = parseFloat(adjacentPriceMatch[2].replace(",", "."));
          if (currency === "TND" && p1 >= 1000) p1 = Math.round(p1 / 1000);
          if (currency === "TND" && p2 >= 1000) p2 = Math.round(p2 / 1000);
          const curr = Math.min(p1, p2);
          const orig = Math.max(p1, p2);
          currentPrice = `${curr} ${currencySymbol}`;
          if (orig > curr) originalPrice = `${orig} ${currencySymbol}`;
        }
      }
    }

    // 4g. Price container with separate currency elements (e.g. Addy: <span class="...price..."><span class="currency...">د.ت</span>49.000 </span>, or <span id="price">19.900</span>)
    if (!currentPrice && html) {
      const priceContainerRegex =
        /(?:class|id)=["'][^"']*\b(?:price|product-price|current-price|amount)\b[^"']*["'][^>]*>(?:<[^>]+>|[^\d<])*?(\d{1,4}(?:[.,]\d{1,3})?)/gi;
      let pcMatch;
      while ((pcMatch = priceContainerRegex.exec(html)) !== null) {
        let numStr = pcMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (currency === "TND") {
          num = normalizeTndMillimes(num, pcMatch[1]);
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
          if (currency === "TND") {
            num = normalizeTndMillimes(num, prefMatch[1]);
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
        if (currency === "TND") {
          num = normalizeTndMillimes(num, regMatch[1]);
        }
        currentPrice = `${num} ${currencySymbol}`;
      }
    }

    if (!currentPrice) {
      // General price regex in page body (allows intervening tags like <sup>دت</sup> or <span class="currency">DT</span>)
      const generalPriceMatch = /(\d{1,4}(?:[.,]\d{2,3})?)\s*(?:<\/[^>]+>\s*)*(?:<[^>]+>\s*)*(?:TND|DT|dt|د\.ت|دت|\bDH\b|\bdh\b|\bMAD\b|د\.م|درهم)/i.exec(html);
      if (generalPriceMatch && generalPriceMatch[1] && Number(generalPriceMatch[1].replace(",", ".")) > 0) {
        if (/\bMAD\b|\bDH\b|\bdh\b|د\.م|درهم/i.test(generalPriceMatch[0])) {
          currency = "MAD";
          currencySymbol = "DH";
        }
        let numStr = generalPriceMatch[1].replace(",", ".");
        let num = parseFloat(numStr);
        if (currency === "TND") {
          num = normalizeTndMillimes(num, generalPriceMatch[1]);
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
        if (currency === "TND") {
          num = normalizeTndMillimes(num, bdiMatch[1]);
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
          if (currency === "TND") {
            num = normalizeTndMillimes(num, numMatch[1]);
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
        if (currency === "TND") {
          num = normalizeTndMillimes(num, delMatch[1]);
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
          if (currency === "TND") {
            num = normalizeTndMillimes(num, numMatch[1]);
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

