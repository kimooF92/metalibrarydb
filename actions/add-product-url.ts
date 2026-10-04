import { db } from "@/db";
import { trackedPages, queue, scrapedProducts } from "@/db/schema";
import { eq, or, sql, and, isNotNull } from "drizzle-orm";
import { parseTrackableUrl } from "@/lib/url-parser";
import { linkAndAutoScrapeProduct } from "@/lib/product-ingest";
import {
  dispatchCreativeScanForBrand,
  CreativeRunnerType,
  DispatchCreativeScanResult,
} from "@/lib/creative-scan-dispatch";
import { getActiveWorkspace } from "@/lib/workspace-server";

export interface AddProductPageLinkOptions {
  allowDuplicate?: boolean;
  runner?: CreativeRunnerType;
  webhookBaseUrl?: string;
}

export interface AddProductUrlResult {
  success: boolean;
  message: string;
  isNewBrand?: boolean;
  isDuplicate?: boolean;
  page?: typeof trackedPages.$inferSelect;
  productId?: string | null;
  productUrl?: string;
  targetDomain?: string;
  creativeScan?: DispatchCreativeScanResult;
}

/**
 * Searches the database using a strict 4-tier match to determine if a website/brand
 * is already being tracked.
 */
export async function findExistingBrandByDomain(
  domain: string,
  canonicalSearchUrl?: string
): Promise<typeof trackedPages.$inferSelect | null> {
  const normDomain = domain.toLowerCase().trim();

  // Tier 1: Exact match on landingPage column
  const byLandingPage = await db.query.trackedPages.findFirst({
    where: sql`lower(${trackedPages.landingPage}) = ${normDomain}`,
  });
  if (byLandingPage) return byLandingPage;

  // Tier 2: Exact match on displayName
  const byDisplayName = await db.query.trackedPages.findFirst({
    where: sql`lower(trim(${trackedPages.displayName})) = ${normDomain}`,
  });
  if (byDisplayName) return byDisplayName;

  // Tier 3: Exact match on Ad Library search URL
  if (canonicalSearchUrl) {
    const byUrl = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.url, canonicalSearchUrl),
    });
    if (byUrl) return byUrl;
  }

  // Tier 4: Scraped products cross-reference (check if products from this domain have a resolved pageId)
  const linkedProduct = await db.query.scrapedProducts.findFirst({
    where: and(
      sql`lower(${scrapedProducts.domain}) = ${normDomain}`,
      isNotNull(scrapedProducts.pageId)
    ),
    columns: { pageId: true },
  });

  if (linkedProduct?.pageId) {
    const byPageId = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.pageId, linkedProduct.pageId),
    });
    if (byPageId) return byPageId;
  }

  return null;
}

/**
 * Primary server action to add an e-commerce product link.
 * 1. Normalizes product URL & extracts search domain (preserving SaaS merchant subdomains).
 * 2. Checks if website exists in DB.
 * 3. Ingests and extracts product page details.
 * 4. Sets brand page to creative scan workflow (Apify or Local Playwright).
 */
export async function addProductPageLink(
  rawUrl: string,
  optionsOrAllowDuplicate: boolean | AddProductPageLinkOptions = false
): Promise<AddProductUrlResult> {
  const options: AddProductPageLinkOptions =
    typeof optionsOrAllowDuplicate === "boolean"
      ? { allowDuplicate: optionsOrAllowDuplicate }
      : optionsOrAllowDuplicate || {};

  const allowDuplicate = Boolean(options.allowDuplicate);
  const runner = options.runner || "local";

  const trimmed = rawUrl.trim();
  const parsed = parseTrackableUrl(trimmed);

  if (!parsed) {
    return {
      success: false,
      message:
        "Please enter a valid product page or store website URL (e.g. https://brand.com/products/item).",
    };
  }

  const { targetDomain, productUrl, metaAdLibraryUrl } = parsed;

  try {
    const activeWorkspace = await getActiveWorkspace();

    // 1. Search if website / brand already exists in database
    const existing = await findExistingBrandByDomain(targetDomain, metaAdLibraryUrl);

    if (existing && !allowDuplicate) {
      let productId: string | null = null;

      // Ingest and link product if productUrl is present
      if (productUrl) {
        const ingestRes = await linkAndAutoScrapeProduct({
          linkUrl: productUrl,
          pageId: existing.pageId || null,
          workspaceId: existing.workspaceId || activeWorkspace.id,
        });
        productId = ingestRes.productId;
      }

      // Set existing brand page to creative scan workflow
      const creativeScanResult = await dispatchCreativeScanForBrand({
        trackedPageId: existing.id,
        runner,
        priority: 10,
        webhookBaseUrl: options.webhookBaseUrl,
      });

      return {
        success: true,
        isNewBrand: false,
        isDuplicate: true,
        message: `Brand "${existing.displayName || targetDomain}" is already tracked. Product linked & creative scan dispatched (${runner.toUpperCase()})!`,
        page: existing,
        productId,
        productUrl,
        targetDomain,
        creativeScan: creativeScanResult,
      };
    }

    // 2. Register new brand entry in tracked_pages (concurrency-safe)
    const [newPage] = await db
      .insert(trackedPages)
      .values({
        url: metaAdLibraryUrl,
        displayName: targetDomain,
        landingPage: targetDomain,
        searchType: "keyword_exact_phrase",
        workspaceId: activeWorkspace.id,
        country: activeWorkspace.countryCode || "TN",
        status: "pending",
      })
      .onConflictDoNothing()
      .returning();

    // If conflict occurred concurrently, retrieve existing record
    const effectivePage =
      newPage ??
      (await db.query.trackedPages.findFirst({
        where: eq(trackedPages.url, metaAdLibraryUrl),
      }));

    if (!effectivePage) {
      return {
        success: false,
        message: "Failed to create tracking record for brand.",
      };
    }

    // 3. Ingest and trigger background product extraction
    let productId: string | null = null;
    if (productUrl) {
      const ingestRes = await linkAndAutoScrapeProduct({
        linkUrl: productUrl,
        pageId: effectivePage.pageId || null,
        workspaceId: activeWorkspace.id,
      });
      productId = ingestRes.productId;
    }

    // 4. Set brand page into creative scan workflow (Apify or Local)
    const creativeScanResult = await dispatchCreativeScanForBrand({
      trackedPageId: effectivePage.id,
      runner,
      priority: 10,
      webhookBaseUrl: options.webhookBaseUrl,
    });

    return {
      success: true,
      isNewBrand: Boolean(newPage),
      message: newPage
        ? `Brand "${targetDomain}" registered! Creative scan dispatched via ${runner.toUpperCase()} (Priority: 10) & product extracting.`
        : `Product linked to existing tracking entry for "${targetDomain}".`,
      page: effectivePage,
      productId,
      productUrl,
      targetDomain,
      creativeScan: creativeScanResult,
    };
  } catch (err: any) {
    console.error("[AddProductUrl] Error registering product link:", err);
    return {
      success: false,
      message: err.message || "An unexpected error occurred while adding product link.",
    };
  }
}
