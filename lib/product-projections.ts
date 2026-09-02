import { ads, scrapedProducts } from "@/db/schema";

// Keep normal product actions explicit. In particular, rawExtract is intentionally
// absent from these projections because it can contain the full Firecrawl payload.
export const PRODUCT_MATCH_PROJECTION = {
  id: scrapedProducts.id,
  url: scrapedProducts.url,
  domain: scrapedProducts.domain,
  pageId: scrapedProducts.pageId,
  title: scrapedProducts.title,
  currentPrice: scrapedProducts.currentPrice,
  originalPrice: scrapedProducts.originalPrice,
  currency: scrapedProducts.currency,
  discountOrOffer: scrapedProducts.discountOrOffer,
  mainImageUrl: scrapedProducts.mainImageUrl,
  galleryImages: scrapedProducts.galleryImages,
  allOffers: scrapedProducts.allOffers,
  scrapeStatus: scrapedProducts.scrapeStatus,
  failureReason: scrapedProducts.failureReason,
  lastScrapedAt: scrapedProducts.lastScrapedAt,
  createdAt: scrapedProducts.createdAt,
  updatedAt: scrapedProducts.updatedAt,
} as const;

export const PRODUCT_NETWORK_PROJECTION = {
  id: scrapedProducts.id,
  url: scrapedProducts.url,
  domain: scrapedProducts.domain,
  pageId: scrapedProducts.pageId,
  phoneNumbers: scrapedProducts.phoneNumbers,
  whatsappNumbers: scrapedProducts.whatsappNumbers,
  metaPixelIds: scrapedProducts.metaPixelIds,
  storePlatform: scrapedProducts.storePlatform,
} as const;

export const PRODUCT_EXTRACTION_LOOKUP_PROJECTION = {
  id: scrapedProducts.id,
  url: scrapedProducts.url,
  domain: scrapedProducts.domain,
  pageId: scrapedProducts.pageId,
  title: scrapedProducts.title,
  currentPrice: scrapedProducts.currentPrice,
  originalPrice: scrapedProducts.originalPrice,
  currency: scrapedProducts.currency,
  discountOrOffer: scrapedProducts.discountOrOffer,
  mainImageUrl: scrapedProducts.mainImageUrl,
  galleryImages: scrapedProducts.galleryImages,
  allOffers: scrapedProducts.allOffers,
  rawExtract: scrapedProducts.rawExtract,
  phoneNumbers: scrapedProducts.phoneNumbers,
  whatsappNumbers: scrapedProducts.whatsappNumbers,
  metaPixelIds: scrapedProducts.metaPixelIds,
  storePlatform: scrapedProducts.storePlatform,
  deliveryCost: scrapedProducts.deliveryCost,
  scrapeStatus: scrapedProducts.scrapeStatus,
} as const;

// The sync worker needs rawExtract only to preserve an existing extraction when a
// new extraction does not return one. Its response uses PRODUCT_RESPONSE_PROJECTION.
export const PRODUCT_SYNC_LOOKUP_PROJECTION = {
  ...PRODUCT_EXTRACTION_LOOKUP_PROJECTION,
  category: scrapedProducts.category,
  subCategory: scrapedProducts.subCategory,
  targetAudience: scrapedProducts.targetAudience,
  supplierUrls: scrapedProducts.supplierUrls,
} as const;

export const PRODUCT_RESPONSE_PROJECTION = {
  id: scrapedProducts.id,
  url: scrapedProducts.url,
  domain: scrapedProducts.domain,
  pageId: scrapedProducts.pageId,
  title: scrapedProducts.title,
  currentPrice: scrapedProducts.currentPrice,
  originalPrice: scrapedProducts.originalPrice,
  currency: scrapedProducts.currency,
  discountOrOffer: scrapedProducts.discountOrOffer,
  mainImageUrl: scrapedProducts.mainImageUrl,
  galleryImages: scrapedProducts.galleryImages,
  allOffers: scrapedProducts.allOffers,
  phoneNumbers: scrapedProducts.phoneNumbers,
  whatsappNumbers: scrapedProducts.whatsappNumbers,
  metaPixelIds: scrapedProducts.metaPixelIds,
  storePlatform: scrapedProducts.storePlatform,
  deliveryCost: scrapedProducts.deliveryCost,
  category: scrapedProducts.category,
  subCategory: scrapedProducts.subCategory,
  targetAudience: scrapedProducts.targetAudience,
  supplierUrls: scrapedProducts.supplierUrls,
  isFavorite: scrapedProducts.isFavorite,
  scrapeStatus: scrapedProducts.scrapeStatus,
  failureReason: scrapedProducts.failureReason,
  lastScrapedAt: scrapedProducts.lastScrapedAt,
  createdAt: scrapedProducts.createdAt,
  updatedAt: scrapedProducts.updatedAt,
} as const;

// Drizzle's relational `columns` option uses booleans, unlike `.select()`.
export const AD_STATUS_PRODUCT_COLUMNS = {
  id: true,
  title: true,
  url: true,
} as const;

export const AD_STATUS_AD_COLUMNS = {
  id: true,
  adArchiveId: true,
  isArchived: true,
  archivedAt: true,
} as const;

export function projectionIncludesRawExtract(projection: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(projection, "rawExtract");
}
