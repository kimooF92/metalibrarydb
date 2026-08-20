import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import { resolveDestinationUrl } from "./utils";

/**
 * Normalizes a URL for deduplication:
 * 1. Unwraps Facebook/Instagram redirect shims
 * 2. Strips tracking params (UTMs, fbclid, gclid, etc.)
 * 3. Normalizes protocol & removes trailing slash
 */
export function normalizeProductUrl(rawUrl: string | null | undefined): string | null {
  const unwrapped = resolveDestinationUrl(rawUrl);
  if (!unwrapped) return null;

  try {
    const parsed = new URL(unwrapped);

    // List of tracking query parameters to purge
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "fbclid",
      "gclid",
      "ttclid",
      "msclkid",
      "twclid",
      "ref",
      "source",
      "_ga",
      "_gl",
      "mc_cid",
      "mc_eid",
      "fbadid",
      "ad_id",
      "campaign_id",
    ];

    trackingParams.forEach((param) => {
      parsed.searchParams.delete(param);
    });

    // Remove empty hash or trailing hash
    parsed.hash = "";

    // Normalize protocol & hostname to lowercase
    let cleaned = `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname}`;

    // Remove trailing slash if path is longer than 1 character
    if (cleaned.length > 1 && cleaned.endsWith("/")) {
      cleaned = cleaned.slice(0, -1);
    }

    // Append remaining query params if any
    const remainingQuery = parsed.searchParams.toString();
    if (remainingQuery) {
      cleaned += `?${remainingQuery}`;
    }

    return cleaned;
  } catch {
    return unwrapped.trim();
  }
}

/**
 * JSON Schema for Firecrawl structured LLM extraction
 */
export const productJsonSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "The name or title of the main product on this landing page",
    },
    current_price: {
      type: "string",
      description: "The current selling price of the product, including currency symbol or code (e.g., '$29.99', '49.00 TND', '€19.95')",
    },
    original_price: {
      type: "string",
      description: "The original, regular, or crossed-out price before discount if visible",
    },
    currency: {
      type: "string",
      description: "Currency code or symbol, e.g., 'USD', 'TND', 'EUR', '$', 'DT'",
    },
    discount_or_offer: {
      type: "string",
      description: "Promotional offer, percentage off, or bundle deal (e.g., '50% OFF', 'Buy 1 Get 1 Free', 'Free Delivery')",
    },
    delivery_cost: {
      type: "string",
      description: "Shipping / delivery policy or cost (e.g., 'Livraison Gratuite', '7 DT', '8 DT', 'Gratuite à partir de 2 articles', 'Non spécifiée')",
    },
    main_image_url: {
      type: "string",
      description: "The primary high-resolution product image URL",
    },
    gallery_images: {
      type: "array",
      items: { type: "string" },
      description: "List of other product photo URLs shown in the carousel or gallery",
    },
    all_offers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tier_name: { type: "string", description: "e.g., '1 Item', 'Pack of 2', 'Family Pack'" },
          price: { type: "string", description: "Price for this tier/bundle" },
          savings: { type: "string", description: "Savings or discount for this tier (e.g., 'Save 30%')" },
        },
        required: ["tier_name", "price"],
      },
      description: "List of tiered offers, quantity discounts, or package options",
    },
  },
  required: ["title", "current_price"],
};

export interface ExtractedProductData {
  title: string;
  current_price: string;
  original_price?: string;
  currency?: string;
  discount_or_offer?: string;
  delivery_cost?: string;
  main_image_url?: string;
  gallery_images?: string[];
  all_offers?: Array<{
    tier_name: string;
    price: string;
    savings?: string;
  }>;
}

/**
 * Scrapes a landing page URL using Firecrawl's extract format
 */
export async function extractProductFromUrl(url: string): Promise<{
  success: boolean;
  data?: ExtractedProductData;
  error?: string;
  raw?: any;
}> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "FIRECRAWL_API_KEY is not configured in environment variables.",
    };
  }

  const normalized = normalizeProductUrl(url);
  if (!normalized) {
    return {
      success: false,
      error: "Invalid or empty destination URL.",
    };
  }

  try {
    const firecrawl = new FirecrawlApp({ apiKey });

    const scrapeResponse: any = await firecrawl.scrapeUrl(normalized, {
      formats: [
        {
          type: "json",
          schema: productJsonSchema,
          prompt:
            "Extract the main product title, current selling price, original/crossed-out price, discount/offer summary, main product photo URL, and any quantity/bundle discount tiers.",
        },
        "html",
      ],
      waitFor: 2000,
    });

    const rawData = scrapeResponse?.json || scrapeResponse?.extract || scrapeResponse?.data?.json || scrapeResponse?.data?.extract;

    if (!scrapeResponse || !rawData) {
      return {
        success: false,
        error: "Firecrawl could not extract product details from this page.",
        raw: scrapeResponse,
      };
    }

    const extract = rawData as ExtractedProductData;

    // Resolve relative image URLs if returned
    if (extract.main_image_url && !extract.main_image_url.startsWith("http")) {
      try {
        const base = new URL(normalized);
        extract.main_image_url = new URL(extract.main_image_url, base.origin).toString();
      } catch {
        // Keep as is if URL parsing fails
      }
    }

    if (extract.gallery_images && Array.isArray(extract.gallery_images)) {
      extract.gallery_images = extract.gallery_images.map((img) => {
        if (!img.startsWith("http")) {
          try {
            const base = new URL(normalized);
            return new URL(img, base.origin).toString();
          } catch {
            return img;
          }
        }
        return img;
      });
    }

    return {
      success: true,
      data: extract,
      raw: scrapeResponse,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to scrape product with Firecrawl.",
    };
  }
}
