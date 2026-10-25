/**
 * Unified Product Validator & Ingestion Gatekeeper
 *
 * Centralized, deterministic quality gate across all ingestion entry routes:
 * 1. lib/product-ingest.ts (Automated background scrapers)
 * 2. app/api/products/extract/route.ts (Manual URL extraction API)
 * 3. scripts/run-product-scraper.ts (CLI batch scraping)
 * 4. worker/product-rescue.ts (Worker rescue pipeline)
 * 5. app/api/spy/brand/[id]/products/sync/route.ts (Brand catalog sync)
 *
 * Ensures consistent filtering:
 * - Layer 1: Obvious junk (policies, FAQ, cart, checkout) -> 'ignored' ($0)
 * - Layer 2: Genuine product evidence (price > 0 + /products/ slug + title >= 10 + image) -> 'success' ($0)
 * - Layer 3: No image + no price + no slug -> 'ignored' ($0)
 * - Layer 4: Ambiguous edge cases -> AI Gatekeeper (fails safely to 'needs_review' on downtime)
 */

import { filterJunkWithJev } from "./typesafe-jev";
import { isCategoryUrl } from "./url-parser";

export interface ProductValidationInput {
  url: string;
  title?: string | null;
  rawPrice?: string | null;
  mainImageUrl?: string | null;
  html?: string | null;
}

export interface ProductValidationResult {
  isProduct: boolean;
  status: "success" | "needs_review" | "ignored";
  reason?: string;
  confidence?: number;
}

export async function validateAndGatekeepProduct(
  input: ProductValidationInput
): Promise<ProductValidationResult> {
  const cleanTitle = (input.title || "").trim();
  const urlLower = (input.url || "").toLowerCase();
  const titleLower = cleanTitle.toLowerCase();
  const priceStr = (input.rawPrice || "").trim();
  const priceClean = priceStr.replace(/[^0-9.]/g, "");
  const priceNum = parseFloat(priceClean);
  const isForeign = /(?:\$|€|£|¥|\b(?:USD|EUR|GBP)\b)/i.test(priceStr);
  const isZeroPrice = !priceStr || isNaN(priceNum) || priceNum <= 0;
  const isMicroPrice = priceNum <= 10; // Potential delivery fee or accessory

  // Layer 2 requires clean, standard local price without foreign currency or micro-price doubt
  const hasConfidentProductPrice = Boolean(!isZeroPrice && !isForeign && !isMicroPrice);
  const hasAnyPrice = Boolean(!isZeroPrice);
  const hasValidImage = Boolean(input.mainImageUrl && input.mainImageUrl.trim() !== "");
  const hasProductSlug = /\/(?:products?|produits?|items?|item|p|dp)\//i.test(urlLower);

  // 0. Deterministic rejection for category, collection, and catalog listing URLs
  if (isCategoryUrl(input.url) || urlLower.includes("/category")) {
    return {
      isProduct: false,
      status: "ignored",
      reason: "Category / collection listing URL excluded from product scraping",
      confidence: 1.0,
    };
  }

  // 1. Layer 1 ($0 tokens): Deterministic rejection for policies, cart, account, and navigation junk
  const isObviousJunk =
    /(?:politique|mentions l[eé]gales|conditions g[eé]n[eé]rales|cgv|cgu|confidentialit[eé]|privacy policy|terms of (?:service|use)|termes et conditions|faq|support client|contactez-nous|contact us|panier d'achat|mon panier|checkout|cart|mon compte|my account|connexion|login|shipping policy|livraison et retours|politique de retour|avis clients|qui sommes-nous|about us)/i.test(
      titleLower
    ) ||
    /\/(?:policies|pages\/(?:contact|faq|terms|privacy|cgv|about|shipping|retours)|cart|checkout|account)\b/i.test(
      urlLower
    );

  if (isObviousJunk) {
    return {
      isProduct: false,
      status: "ignored",
      reason: "Matched non-product legal/navigation pattern (deterministic regex)",
      confidence: 1.0,
    };
  }

  // 2. Reject empty titles
  if (!cleanTitle || cleanTitle.length < 2) {
    return {
      isProduct: false,
      status: "ignored",
      reason: "Title is missing or empty",
      confidence: 1.0,
    };
  }

  // 3. Layer 2 ($0 tokens): Obvious high-confidence product with validated non-micro local price
  if (hasConfidentProductPrice && hasProductSlug && cleanTitle.length >= 10 && hasValidImage) {
    return {
      isProduct: true,
      status: "success",
      reason: "Confirmed genuine product (confident local price, product slug, image, descriptive title)",
      confidence: 0.99,
    };
  }

  // 4. Layer 3 ($0 tokens): Insufficient product evidence check
  // A page with NO image and NO valid price and NO product slug is not an e-commerce product
  if (!hasValidImage && !hasAnyPrice && !hasProductSlug) {
    return {
      isProduct: false,
      status: "ignored",
      reason: "Insufficient product evidence (no price, no product image, no product slug)",
      confidence: 0.95,
    };
  }

  // 5. Generic navigation page check (e.g. title is "Accueil" or "Boutique" on root/catalog URL)
  const isGenericNavTitle = /^(?:accueil|boutique|store|panier|bienvenue|home)\b/i.test(titleLower);
  if (isGenericNavTitle && !hasProductSlug) {
    return {
      isProduct: false,
      status: "ignored",
      reason: `Generic navigation title ("${cleanTitle}") without product slug`,
      confidence: 0.95,
    };
  }

  // 6. Layer 4: Ambiguous edge cases (e.g. root domain with price, or short title) -> Call AI Gatekeeper
  try {
    const jevCheck = await filterJunkWithJev(cleanTitle);

    if (!jevCheck) {
      // AI gatekeeper unreachable or key missing
      // Fail safely: if no product slug and no valid price, mark needs_review rather than auto-pass
      if (!hasProductSlug && !hasAnyPrice) {
        return {
          isProduct: false,
          status: "needs_review",
          reason: "Ambiguous non-slug page without price; AI gatekeeper unavailable",
          confidence: 0.5,
        };
      }

      // If it has a product slug or valid price, allow with needs_review
      return {
        isProduct: true,
        status: "needs_review",
        reason: "Gatekeeper fallback (product slug or price present, but AI check unavailable)",
        confidence: 0.6,
      };
    }

    if (!jevCheck.isProduct || jevCheck.probability < 0.35) {
      return {
        isProduct: false,
        status: "ignored",
        reason: `AI gatekeeper identified non-product (${Math.round((1 - jevCheck.probability) * 100)}% confidence)`,
        confidence: 1 - jevCheck.probability,
      };
    }

    return {
      isProduct: true,
      status: "success",
      reason: "Passed AI gatekeeper check",
      confidence: jevCheck.probability,
    };
  } catch (err: any) {
    console.warn(`[Product Validator] Gatekeeper error for "${cleanTitle}":`, err?.message || err);
    return {
      isProduct: !isGenericNavTitle && (hasProductSlug || hasAnyPrice),
      status: "needs_review",
      reason: `AI gatekeeper exception: ${err?.message || "unknown"}`,
      confidence: 0.5,
    };
  }
}

/**
 * Resolves the final effective scrape status by taking the most conservative verdict:
 * ignored (rejected) > needs_review (amber/doubt) > success (green)
 */
export function resolveEffectiveScrapeStatus(
  gateCheck: { status: "success" | "needs_review" | "ignored"; reason?: string },
  enhanced: { scrapeStatus?: "success" | "needs_review" | "ignored"; statusReason?: string }
): { status: "success" | "needs_review" | "ignored"; reason: string | null } {
  if (gateCheck.status === "ignored" || enhanced.scrapeStatus === "ignored") {
    return {
      status: "ignored",
      reason: gateCheck.status === "ignored" ? (gateCheck.reason || null) : (enhanced.statusReason || null),
    };
  }
  if (gateCheck.status === "needs_review" || enhanced.scrapeStatus === "needs_review") {
    return {
      status: "needs_review",
      reason: gateCheck.status === "needs_review" ? (gateCheck.reason || null) : (enhanced.statusReason || null),
    };
  }
  return { status: "success", reason: null };
}
