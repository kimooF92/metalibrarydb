/**
 * Price and promotional banner parsing utilities for e-commerce scrapers.
 * Preserves strict heuristics for North African currencies (Tunisian Dinar TND/DT 3-decimal millimes,
 * Moroccan Dirham MAD/DH, EUR, USD) (BUG-09 mitigation).
 */

/**
 * Detects if a candidate title string is actually just a price badge, currency, or numerical offer
 * (e.g. "49.000 دت \r\n 68.600 دت", "39 DT", "120.00 TND", "€29.99", etc.)
 */
export function isPriceString(str: string): boolean {
  if (!str) return false;
  const s = str.trim();
  // Strip currency tokens, digits, and common pricing punctuation/symbols
  const withoutPrices = s
    .replace(
      /(?:TND|DT|dt|د\.ت|دت|دinar|Dinar|USD|EUR|MAD|DZD|dinars?|دنانير|دينار|DH|dh|د\.م|درهم|SAR|SR|AED|\$|€|£)/gi,
      ""
    )
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
 * Normalizes raw numeric price for Tunisian Dinar when millimes are used (BUG-09).
 * E.g., "49.000 DT" or "49000 millimes" represented as 49000.
 */
export function normalizeTndMillimes(rawPriceNum: number, rawPriceStr: string): number {
  if (rawPriceNum >= 1000 && (rawPriceStr.includes(",000") || rawPriceStr.includes(".000"))) {
    return Math.round(rawPriceNum / 1000);
  }
  return rawPriceNum;
}

