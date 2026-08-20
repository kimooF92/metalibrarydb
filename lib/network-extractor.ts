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
