/**
 * lib/preview-validator.ts
 *
 * Quality validation filter for Ephemeral Discovery Product Previews.
 * Ensures that candidate products extracted during discovery scans are genuine
 * physical products with valid image assets, clean titles, and realistic prices.
 */

import { isPriceString, isTrackingBeacon } from "./html-scraper";
import type { ExtractedProductData } from "@/types";

const GENERIC_TITLE_BLACKLIST = new Set([
  "product landing page",
  "product",
  "produit",
  "accueil",
  "home",
  "homepage",
  "checkout",
  "commander",
  "panier",
  "cart",
  "shop",
  "boutique",
  "catalogue",
  "catalog",
  "store",
  "collection",
  "page not found",
  "404 not found",
  "error",
]);

export interface PreviewQualityResult {
  isValid: boolean;
  cleanTitle?: string;
  imageUrl?: string;
  cleanPrice?: string | null;
  rejectionReason?: string;
}

/**
 * Validates extracted product data for discovery preview display
 */
export function validatePreviewQuality(data: ExtractedProductData | null | undefined): PreviewQualityResult {
  if (!data) {
    return { isValid: false, rejectionReason: "No data provided" };
  }

  // 1. Image Validation (Mandatory for Visual Identification)
  const image = (data.main_image_url || (data as any).mainImageUrl)?.trim();
  if (!image || (!image.startsWith("http://") && !image.startsWith("https://"))) {
    return { isValid: false, rejectionReason: "Missing or invalid image URL" };
  }

  if (isTrackingBeacon(image)) {
    return { isValid: false, rejectionReason: "Image is a tracking beacon or placeholder" };
  }

  // 2. Title Validation
  const rawTitle = data.title?.trim();
  if (!rawTitle || rawTitle.length < 3) {
    return { isValid: false, rejectionReason: "Title is missing or too short" };
  }

  const normalizedTitle = rawTitle.toLowerCase();
  if (GENERIC_TITLE_BLACKLIST.has(normalizedTitle)) {
    return { isValid: false, rejectionReason: `Generic title detected: "${rawTitle}"` };
  }

  if (isPriceString(rawTitle)) {
    return { isValid: false, rejectionReason: "Title is actually a price string" };
  }

  // Clean common store name suffixes from title: "Product Name - Store Name"
  let cleanTitle = rawTitle;
  const delimiterMatch = cleanTitle.match(/^(.+?)\s+[-–—|•]\s+[^–—|-•]+$/);
  if (delimiterMatch && delimiterMatch[1].trim().length >= 4) {
    cleanTitle = delimiterMatch[1].trim();
  }

  // 3. Price Validation & Sanitization
  let cleanPrice: string | null = null;
  const priceValue = data.current_price || (data as any).currentPrice;
  if (priceValue) {
    const rawPrice = String(priceValue).trim();
    // Filter out 0 DT / free placeholders
    const numPrice = parseFloat(rawPrice.replace(/[^0-9.]/g, ""));
    if (!isNaN(numPrice) && numPrice > 0) {
      cleanPrice = rawPrice;
    }
  }

  return {
    isValid: true,
    cleanTitle,
    imageUrl: image,
    cleanPrice,
  };
}
