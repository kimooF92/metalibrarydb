import { db } from "@/db";
import { ads, scrapedProducts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deleteByPrefix, deleteCached } from "@/lib/cache-service";

/**
 * Extracts numeric Meta Page ID from a string, URL, or identifier
 */
export function extractPageId(input?: string | null): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check if it's pure digits
  if (/^[0-9]+$/.test(trimmed)) {
    return trimmed;
  }

  // Check if it's a Meta Ad Library URL: view_all_page_id=(\d+) or page_id=(\d+) or id=(\d+)
  const match = trimmed.match(/(?:view_all_page_id|page_id|id)=([0-9]+)/i);
  if (match && match[1]) {
    return match[1];
  }

  // Facebook profile / page URL pattern
  const profileMatch = trimmed.match(/facebook\.com\/profile\.php\?id=([0-9]+)/i);
  if (profileMatch && profileMatch[1]) {
    return profileMatch[1];
  }

  return trimmed;
}

export interface UpdateProductPayload {
  isFavorite?: boolean;
  supplierUrls?: string[];
  title?: string;
  url?: string;
  mainImageUrl?: string;
  currentPrice?: string;
  originalPrice?: string;
  discountOrOffer?: string;
  deliveryCost?: string;
  category?: string;
  subCategory?: string;
  storePlatform?: string;
  pageId?: string;
  metaAdLibraryUrl?: string;
}

/**
 * Updates product details and handles role-based favorite scoping (BUG-03) and cache invalidation (BUG-23)
 */
export async function updateProduct(
  id: string,
  payload: UpdateProductPayload,
  workspaceId: string,
  role: "admin" | "staff" = "admin"
) {
  const {
    isFavorite,
    supplierUrls,
    title,
    url,
    mainImageUrl,
    currentPrice,
    originalPrice,
    discountOrOffer,
    deliveryCost,
    category,
    subCategory,
    storePlatform,
    pageId,
    metaAdLibraryUrl,
  } = payload;

  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  // BUG-03: Enforce role-based favorite toggles
  if (isFavorite !== undefined) {
    if (role === "staff") {
      updateData.isFavoriteStaff = Boolean(isFavorite);
    } else {
      updateData.isFavorite = Boolean(isFavorite);
    }
  }

  if (title !== undefined) {
    updateData.title = typeof title === "string" ? title.trim() : null;
  }

  if (url !== undefined && typeof url === "string" && url.trim()) {
    updateData.url = url.trim();
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      updateData.domain = parsed.hostname.replace(/^www\./, "");
    } catch {}
  }

  if (mainImageUrl !== undefined) {
    updateData.mainImageUrl = typeof mainImageUrl === "string" ? mainImageUrl.trim() : null;
  }

  if (currentPrice !== undefined) {
    updateData.currentPrice = typeof currentPrice === "string" ? currentPrice.trim() : null;
  }

  if (originalPrice !== undefined) {
    updateData.originalPrice = typeof originalPrice === "string" ? originalPrice.trim() : null;
  }

  if (discountOrOffer !== undefined) {
    updateData.discountOrOffer = typeof discountOrOffer === "string" ? discountOrOffer.trim() : null;
  }

  if (deliveryCost !== undefined) {
    updateData.deliveryCost = typeof deliveryCost === "string" ? deliveryCost.trim() : null;
  }

  if (category !== undefined) {
    updateData.category = typeof category === "string" ? category.trim() : null;
  }

  if (subCategory !== undefined) {
    updateData.subCategory = typeof subCategory === "string" ? subCategory.trim() : null;
  }

  if (storePlatform !== undefined) {
    updateData.storePlatform = typeof storePlatform === "string" ? storePlatform.trim() : null;
  }

  const rawPageId = pageId !== undefined ? pageId : metaAdLibraryUrl;
  if (rawPageId !== undefined) {
    const parsedPageId = extractPageId(rawPageId);
    updateData.pageId = parsedPageId;
  }

  if (supplierUrls !== undefined) {
    updateData.supplierUrls = Array.isArray(supplierUrls)
      ? Array.from(
          new Set(
            supplierUrls
              .filter((u: any) => typeof u === "string" && u.trim().length > 0)
              .map((u: string) => u.trim())
          )
        )
      : [];
  }

  const favColumn =
    role === "staff" ? scrapedProducts.isFavoriteStaff : scrapedProducts.isFavorite;

  const [updatedProduct] = await db
    .update(scrapedProducts)
    .set(updateData)
    .where(eq(scrapedProducts.id, id))
    .returning({
      id: scrapedProducts.id,
      title: scrapedProducts.title,
      currentPrice: scrapedProducts.currentPrice,
      originalPrice: scrapedProducts.originalPrice,
      discountOrOffer: scrapedProducts.discountOrOffer,
      deliveryCost: scrapedProducts.deliveryCost,
      category: scrapedProducts.category,
      subCategory: scrapedProducts.subCategory,
      storePlatform: scrapedProducts.storePlatform,
      url: scrapedProducts.url,
      domain: scrapedProducts.domain,
      mainImageUrl: scrapedProducts.mainImageUrl,
      supplierUrls: scrapedProducts.supplierUrls,
      isFavorite: favColumn,
      updatedAt: scrapedProducts.updatedAt,
    });

  // BUG-23: Safe cache invalidation with brandKey null-guard
  if (workspaceId) {
    const brandKey = (updatedProduct?.domain || "").toLowerCase();
    await Promise.allSettled([
      deleteByPrefix(`cache:products:${workspaceId}:`),
      deleteByPrefix(`cache:spy_ads:${workspaceId}:`),
      deleteCached(`cache:stats:${workspaceId}`),
      brandKey ? deleteByPrefix(`cache:brand:${workspaceId}:${brandKey}:`) : Promise.resolve(),
    ]);
  }

  return {
    product: updatedProduct,
    supplierUrls: updateData.supplierUrls,
  };
}

/**
 * Soft deletes product, clears raw_extract to protect quota, unlinks ads, and invalidates caches (BUG-23)
 */
export async function deleteProduct(id: string, workspaceId: string) {
  // 1. Unlink product_id from ads
  await db
    .update(ads)
    .set({ productId: null })
    .where(eq(ads.productId, id));

  // 2. Mark product as deleted and purge ephemeral raw_extract to protect 500 MB disk quota
  const [deletedProduct] = await db
    .update(scrapedProducts)
    .set({
      scrapeStatus: "deleted",
      rawExtract: null,
      isFavorite: false,
      isFavoriteStaff: false,
      updatedAt: new Date(),
    })
    .where(eq(scrapedProducts.id, id))
    .returning({ domain: scrapedProducts.domain });

  // 3. BUG-23: Invalidate caches with explicit brandKey check
  if (workspaceId) {
    const brandKey = (deletedProduct?.domain || "").toLowerCase();
    await Promise.allSettled([
      deleteByPrefix(`cache:products:${workspaceId}:`),
      deleteByPrefix(`cache:spy_ads:${workspaceId}:`),
      deleteCached(`cache:stats:${workspaceId}`),
      brandKey ? deleteByPrefix(`cache:brand:${workspaceId}:${brandKey}:`) : Promise.resolve(),
    ]);
  }

  return {
    success: true,
    deletedDomain: deletedProduct?.domain || null,
  };
}

