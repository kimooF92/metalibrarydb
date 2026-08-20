/**
 * Tunisian E-Commerce Network Extractor (Shadow Network Engine)
 * Extracts Tunisian phone numbers, WhatsApp order links, Meta Pixel IDs, and store platform.
 * $0 LLM Cost — 100% fast deterministic regex and HTML parsing.
 */

/**
 * Normalizes and extracts Tunisian phone numbers (+216 2X/3X/4X/5X/7X/9X...).
 * Standardizes to "216XXXXXXXX" format.
 */
export function extractTunisianPhoneNumbers(content?: string | null): string[] {
  if (!content) return [];

  const numbers = new Set<string>();

  // Pattern 1: +216 or 00216 or (216) or 216 followed by 8 digits (optionally spaced or dotted)
  const fullFormatRegex = /(?:(?:\+|00)\s*216|\(\s*216\s*\)|(?:\b216))\s*[-.\s]?([234579]\d(?:[-.\s]?\d){6})/gi;
  let match;
  while ((match = fullFormatRegex.exec(content)) !== null) {
    const raw = match[1].replace(/[-.\s]/g, "");
    if (raw.length === 8 && /^[234579]\d{7}$/.test(raw)) {
      numbers.add(`216${raw}`);
    }
  }

  // Pattern 2: Standalone 8-digit Tunisian phone numbers with spacing/dots/dashes
  // e.g. 55 987 654, 22-123-456, 98.111.222
  const standaloneRegex = /\b([234579]\d)[-.\s](\d{3})[-.\s](\d{3})\b/g;
  while ((match = standaloneRegex.exec(content)) !== null) {
    const raw = `${match[1]}${match[2]}${match[3]}`;
    if (raw.length === 8) {
      numbers.add(`216${raw}`);
    }
  }

  // Pattern 3: Direct tel: links
  const telLinkRegex = /href=["']tel:(?:\+?216)?([234579]\d{7})["']/gi;
  while ((match = telLinkRegex.exec(content)) !== null) {
    numbers.add(`216${match[1]}`);
  }

  // Pattern 4: Also include numbers from WhatsApp links
  const waNumbers = extractWhatsAppNumbers(content);
  waNumbers.forEach((num) => numbers.add(num));

  return Array.from(numbers);
}

/**
 * Extracts WhatsApp phone numbers from direct wa.me or api.whatsapp.com links.
 */
export function extractWhatsAppNumbers(content?: string | null): string[] {
  if (!content) return [];

  const numbers = new Set<string>();

  // Pattern: wa.me/216XXXXXXXX, wa.me/+216XXXXXXXX, api.whatsapp.com/send?phone=216XXXXXXXX, etc.
  const waRegex = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp:\/\/send\?phone=)(?:\+?216)?([234579]\d{7})/gi;
  let match;
  while ((match = waRegex.exec(content)) !== null) {
    numbers.add(`216${match[1]}`);
  }

  return Array.from(numbers);
}

/**
 * Extracts Meta / Facebook Pixel IDs from HTML / JavaScript tags.
 */
export function extractMetaPixelIds(content?: string | null): string[] {
  if (!content) return [];

  const pixelIds = new Set<string>();

  // Pattern 1: fbq('init', '123456789012345') or fbq("init", "123456789012345")
  const fbqRegex = /fbq\(\s*['"]init['"]\s*,\s*['"](\d{12,18})['"]/gi;
  let match;
  while ((match = fbqRegex.exec(content)) !== null) {
    pixelIds.add(match[1]);
  }

  // Pattern 2: connect.facebook.net/.../fbevents.js or tr?id=123456789012345
  const trRegex = /(?:connect\.facebook\.net|facebook\.com\/tr)\?[^'"]*id=(\d{12,18})/gi;
  while ((match = trRegex.exec(content)) !== null) {
    pixelIds.add(match[1]);
  }

  // Pattern 3: Common JSON pixel configs, e.g. "pixel_id": "123456789012345" or "pixelId": 123456789012345
  const jsonPixelRegex = /["']pixel[_-]?id["']\s*:\s*["']?(\d{12,18})["']?/gi;
  while ((match = jsonPixelRegex.exec(content)) !== null) {
    pixelIds.add(match[1]);
  }

  return Array.from(pixelIds);
}

/**
 * Classifies the store e-commerce engine (YouCan, WooCommerce, Shopify, Custom COD, etc.).
 */
export function detectStorePlatform(
  html?: string | null,
  url?: string | null
): "youcan" | "woocommerce" | "shopify" | "custom_cod" | "other" {
  const content = (html || "").toLowerCase();
  const rawUrl = (url || "").toLowerCase();

  // 1. YouCan (Huge in Tunisia & North Africa COD)
  if (
    content.includes("youcan.shop") ||
    content.includes("assets.youcan.shop") ||
    content.includes("cdn.youcan.shop") ||
    content.includes("youcan-") ||
    rawUrl.includes("youcan.store") ||
    rawUrl.includes("youcan.shop")
  ) {
    return "youcan";
  }

  // 2. WooCommerce / WordPress
  if (
    content.includes("wp-content") ||
    content.includes("wp-includes") ||
    content.includes("woocommerce") ||
    content.includes("wc-ajax")
  ) {
    return "woocommerce";
  }

  // 3. Shopify
  if (
    content.includes("cdn.shopify.com") ||
    content.includes("shopify.shop") ||
    content.includes("myshopify.com") ||
    rawUrl.includes("myshopify.com")
  ) {
    return "shopify";
  }

  // 4. Custom COD Landing Page (Funnelish / Leadpages / Custom PHP with COD form)
  if (
    content.includes("gouvernorat") ||
    content.includes("délégation") ||
    content.includes("delegation") ||
    content.includes("nom et prénom") ||
    content.includes("adresse de livraison") ||
    content.includes("commander maintenant") ||
    content.includes("الدفع عند الاستلام") ||
    content.includes("توصيل")
  ) {
    return "custom_cod";
  }

  return "other";
}

/**
 * Formats a normalized "216XXXXXXXX" number into human-friendly "+216 XX XXX XXX" with telecom operator info.
 */
export function formatTunisianPhone(phone: string): {
  formatted: string;
  operator: "Ooredoo" | "Orange" | "Tunisie Telecom" | "Fixe" | "Unknown";
} {
  const clean = phone.replace(/\D/g, "");
  const localDigits = clean.startsWith("216") ? clean.slice(3) : clean;

  if (localDigits.length !== 8) {
    return { formatted: phone, operator: "Unknown" };
  }

  const prefix = localDigits[0];
  let operator: "Ooredoo" | "Orange" | "Tunisie Telecom" | "Fixe" | "Unknown" = "Unknown";

  if (prefix === "2" || prefix === "9") {
    // 2X = Ooredoo, 9X = Tunisie Telecom
    operator = prefix === "2" ? "Ooredoo" : "Tunisie Telecom";
  } else if (prefix === "5") {
    operator = "Orange";
  } else if (prefix === "7" || prefix === "3") {
    operator = "Fixe";
  } else if (prefix === "4") {
    operator = "Tunisie Telecom";
  }

  const formatted = `+216 ${localDigits.slice(0, 2)} ${localDigits.slice(2, 5)} ${localDigits.slice(5)}`;
  return { formatted, operator };
}

/**
 * Detects delivery/shipping policy (Livraison gratuite, 7 DT, 8 DT, Gratuite dès 2 pièces, etc.)
 */
export function extractDeliveryInfo(
  htmlOrText?: string | null,
  extractedDelivery?: string | null,
  allOffers?: Array<{ tier_name?: string; tierName?: string; price?: string }> | null
): { isFree: boolean; label: string; rawCost?: string; isConditional?: boolean } {
  const content = (htmlOrText || "").toLowerCase();

  // 1. Check for explicit checkout paid shipping amounts first (e.g. "Shipping: 7.00 DT", "Frais de livraison: 7 DT")
  const paidMatch =
    content.match(/(?:shipping|frais de livraison|frais livraison|livraison|توصيل|مصاريف الشحن)\s*[:=\s]\s*([1-9][0-9]*(?:\.[0-9]+)?\s*(?:dt|tnd|dinar|dinars|د\.ت|د))/i) ||
    content.match(/([1-9][0-9]*(?:\.[0-9]{2})?)\s*(?:dt|tnd)\s*(?:de livraison|pour la livraison|frais)/i);

  // 2. Check for Conditional Free Delivery (e.g. "Livraison gratuite à partir de 2", "اشتري زوز توصيل مجاني")
  const hasConditionalFree =
    content.includes("livraison gratuite à partir de") ||
    content.includes("livraison gratuite des") ||
    content.includes("livraison gratuite dès") ||
    content.includes("توصيل مجاني عند شراء") ||
    content.includes("توصيل مجاني بداية من") ||
    content.includes("اشتري زوز توصيل مجاني") ||
    content.includes("اشتري 2 توصيل مجاني") ||
    content.includes("اشري 2 توصيل مجاني") ||
    content.includes("اشري زوز توصيل مجاني") ||
    (content.includes("pack 2") && content.includes("gratuit")) ||
    (allOffers &&
      Array.isArray(allOffers) &&
      allOffers.some((o, idx) => {
        const name = (o.tier_name || o.tierName || "").toLowerCase();
        return (
          idx > 0 &&
          (name.includes("مجاني") ||
            name.includes("gratuit") ||
            name.includes("free") ||
            name.includes("بلاش"))
        );
      }));

  // If there's an explicit paid delivery amount
  if (paidMatch) {
    const rawCost = paidMatch[1].toUpperCase().trim();
    if (hasConditionalFree) {
      return {
        isFree: false,
        isConditional: true,
        label: `Livraison: ${rawCost} (Gratuite dès 2 pcs)`,
        rawCost,
      };
    }
    return {
      isFree: false,
      label: `Livraison: ${rawCost}`,
      rawCost,
    };
  }

  // If conditional free delivery detected (e.g. Buy 2 get free delivery) but single item has standard delivery
  if (hasConditionalFree) {
    return {
      isFree: false,
      isConditional: true,
      label: "Livraison: 7 DT (Gratuite dès 2 pcs)",
      rawCost: "7 DT",
    };
  }

  // If Firecrawl explicitly extracted a delivery policy
  if (
    extractedDelivery &&
    extractedDelivery.trim().length > 0 &&
    extractedDelivery.toLowerCase() !== "non spécifiée" &&
    extractedDelivery.toLowerCase() !== "unspecified"
  ) {
    const lower = extractedDelivery.toLowerCase();
    const isFree =
      lower.includes("gratuit") ||
      lower.includes("free") ||
      lower.includes("مجاني") ||
      lower.includes("0 dt") ||
      lower.includes("0dt") ||
      lower.includes("بلاش");

    if (isFree && !hasConditionalFree) {
      return {
        isFree: true,
        label: "Livraison Gratuite",
        rawCost: "0 DT",
      };
    }

    if (!isFree) {
      return {
        isFree: false,
        label: extractedDelivery.startsWith("Livraison")
          ? extractedDelivery
          : `Livraison: ${extractedDelivery}`,
        rawCost: extractedDelivery,
      };
    }
  }

  // 3. Check for genuine Unconditional Free Delivery on single item
  const hasUnconditionalFree =
    (content.includes("livraison gratuite") ||
      content.includes("livraison offerte") ||
      content.includes("توصيل مجاني") ||
      content.includes("شحن مجاني") ||
      content.includes("free shipping") ||
      content.includes("livraison 0 dt") ||
      content.includes("livraison 0dt") ||
      content.includes("توصيل بلاش")) &&
    !hasConditionalFree;

  if (hasUnconditionalFree) {
    return {
      isFree: true,
      label: "Livraison Gratuite",
      rawCost: "0 DT",
    };
  }

  // 4. Default for Tunisian COD
  return {
    isFree: false,
    label: "Livraison: 7 DT",
    rawCost: "7 DT",
  };
}
