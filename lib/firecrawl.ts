import FirecrawlApp from "@mendable/firecrawl-js";
import { resolveDestinationUrl } from "./utils";
import { scrapeProductDirectHtml, parseProductHtmlContent } from "./html-scraper";
import { normalizeProductUrl } from "./url-parser";
export { normalizeProductUrl };

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
import type { ExtractedProductData } from "@/types";
export type { ExtractedProductData };

/**
 * Scrapes a landing page URL using direct HTML first and Firecrawl rendered content as fallback.
 */
export async function extractProductFromUrl(url: string): Promise<{
  success: boolean;
  data?: ExtractedProductData;
  error?: string;
  raw?: any;
}> {
  const normalized = normalizeProductUrl(url);
  if (!normalized) {
    return {
      success: false,
      error: "Invalid or empty destination URL.",
    };
  }

  // 1. Primary: High-speed Direct E-Commerce HTML & JSON-LD Scraper ($0 cost, ~250ms latency)
  let directResult: any = null;
  try {
    directResult = await scrapeProductDirectHtml(normalized);
    const priceStr = directResult.data?.current_price?.trim() || "";
    const isZeroPrice = /^0(\.0+)?\s*(dt|tnd|usd|eur|dinar)?$/i.test(priceStr) || priceStr === "0";
    const hasValidPrice = Boolean(priceStr && !isZeroPrice);
    const hasValidImage = Boolean(directResult.data?.main_image_url);

    // Early exit if direct HTML already confirmed dead link / 404
    if (directResult && !directResult.success && directResult.error?.includes("[Dead link]")) {
      return {
        success: false,
        error: directResult.error,
      };
    }

    // If direct HTML successfully found a title AND (valid price OR valid image), return immediately (image is enough).
    if (
      directResult?.success &&
      directResult.data &&
      directResult.data.title &&
      (hasValidPrice || hasValidImage)
    ) {
      return {
        success: true,
        data: directResult.data,
        raw: { html: directResult.rawHtml, engine: "direct_html" },
      };
    }
    console.log(`[Product Scraper] Direct HTML incomplete or missing price/image for ${normalized}. Checking Firecrawl rescue fallback...`);
  } catch (directErr: any) {
    console.warn(`[Product Scraper] Direct scraper error for ${normalized}:`, directErr?.message);
  }

  // 2. Backup: Firecrawl rendered HTML/Markdown (no AI extraction dependency)
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (apiKey && apiKey.trim() !== "") {
    try {
      console.log(`[Product Scraper] Invoking Firecrawl rendered-content fallback for ${normalized}...`);
      const firecrawl = new FirecrawlApp({ apiKey: apiKey.trim() });

      const scrapeResponse: any = await firecrawl.scrapeUrl(normalized, {
        formats: ["markdown", "html"],
        waitFor: 3000,
      });

      const renderedHtml = scrapeResponse?.html || scrapeResponse?.data?.html || "";
      const renderedMarkdown = scrapeResponse?.markdown || scrapeResponse?.data?.markdown;

      if (renderedHtml || renderedMarkdown) {
        const parsed = parseProductHtmlContent(
          renderedHtml,
          normalized,
          renderedMarkdown
        );
        if (parsed.success && parsed.data && (parsed.data.title || parsed.data.current_price)) {
          return {
            success: true,
            data: parsed.data,
            raw: { ...scrapeResponse, engine: "firecrawl_rendered_html" },
          };
        }
      }
    } catch (err: any) {
      console.warn(`[Product Scraper] Firecrawl rescue fallback also failed for ${normalized}:`, err?.message);
    }
  }

  // 3. Fallback: If Firecrawl could not rescue or failed, return direct HTML best-effort result if available
  if (directResult?.success && directResult.data && directResult.data.title) {
    return {
      success: true,
      data: directResult.data,
      raw: { html: directResult.rawHtml, engine: "direct_html_best_effort" },
    };
  }

  // 4. Local Residential Browser Fallback:
  // If running on desktop/local worker (not Vercel/serverless), attempt to bypass Cloudflare
  // using the local Playwright browser with residential IP
  if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const { scrapeUrlWithLocalPlaywright } = await import("./local-browser-scraper");
      const localResult = await scrapeUrlWithLocalPlaywright(normalized);
      if (localResult.success && localResult.data) {
        return {
          success: true,
          data: localResult.data,
          raw: { html: localResult.rawHtml, engine: "local_playwright_browser" },
        };
      }
    } catch (localErr: any) {
      console.warn(`[Product Scraper] Local browser fallback error for ${normalized}:`, localErr?.message);
    }
  }

  return {
    success: false,
    error: directResult?.error || "Failed to extract product details from landing page using both direct and fallback extractors.",
  };
}
