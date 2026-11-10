import type { CarouselItemSummary, ScrapedProduct } from "@/types";

export function toCarouselItemSummary(product: Partial<ScrapedProduct>): CarouselItemSummary {
  return {
    id: product.id || "",
    url: product.url || "",
    title: product.title ?? null,
    currentPrice: product.currentPrice ?? null,
    originalPrice: product.originalPrice ?? null,
    currency: product.currency ?? null,
    discountOrOffer: product.discountOrOffer ?? null,
    mainImageUrl: product.mainImageUrl ?? null,
    activeAdsCount: product.activeAdsCount,
    linkedAdsCount: product.linkedAdsCount,
    isFavorite: product.isFavorite,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    scrapeStatus: product.scrapeStatus,
    failureReason: product.failureReason,
    lastScrapedAt: product.lastScrapedAt,
    pageId: product.pageId,
    brandName: product.brandName,
    brandPageId: product.brandPageId,
    brandProfilePic: product.brandProfilePic,
    brandHoldStatus: product.brandHoldStatus,
    daysRunning: product.daysRunning,
    isBreakout: product.isBreakout,
    breakoutScore: product.breakoutScore,
    breakoutTier: product.breakoutTier,
    breakoutSurge: product.breakoutSurge,
    maxDuplications: product.maxDuplications,
    earliestAdDate: product.earliestAdDate,
    latestAdDate: product.latestAdDate,
    topCreativeThumbnail: product.topCreativeThumbnail,
  };
}

export function materializeCarouselItem(
  bundle: ScrapedProduct,
  item: CarouselItemSummary
): ScrapedProduct {
  const definedItem = Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== undefined)
  ) as Partial<ScrapedProduct>;

  return {
    ...bundle,
    ...definedItem,
    id: item.id,
    url: item.url !== undefined ? item.url : bundle.url,
    title: item.title !== undefined ? item.title : bundle.title,
    currentPrice: item.currentPrice !== undefined ? item.currentPrice : bundle.currentPrice,
    originalPrice: item.originalPrice !== undefined ? item.originalPrice : bundle.originalPrice,
    currency: item.currency !== undefined ? item.currency : bundle.currency,
    discountOrOffer:
      item.discountOrOffer !== undefined ? item.discountOrOffer : bundle.discountOrOffer,
    mainImageUrl: item.mainImageUrl !== undefined ? item.mainImageUrl : bundle.mainImageUrl,
    isFavorite: item.isFavorite == null ? bundle.isFavorite : item.isFavorite,
    createdAt:
      item.createdAt instanceof Date
        ? item.createdAt.toISOString()
        : item.createdAt !== undefined
        ? item.createdAt
        : bundle.createdAt,
    updatedAt:
      item.updatedAt instanceof Date
        ? item.updatedAt.toISOString()
        : item.updatedAt !== undefined
        ? item.updatedAt
        : bundle.updatedAt,
    carouselItems: bundle.carouselItems,
    isCarouselBundle: bundle.isCarouselBundle,
    carouselBundleCount: bundle.carouselBundleCount,
    carouselGroupKey: bundle.carouselGroupKey,
  };
}

function rankProduct(product: Partial<ScrapedProduct>): [number, number, number, string] {
  return [
    product.activeAdsCount || 0,
    product.linkedAdsCount || 0,
    product.maxDuplications || 1,
    product.id || "",
  ];
}

function compareProducts(a: Partial<ScrapedProduct>, b: Partial<ScrapedProduct>): number {
  const aRank = rankProduct(a);
  const bRank = rankProduct(b);
  return (
    bRank[0] - aRank[0] ||
    bRank[1] - aRank[1] ||
    bRank[2] - aRank[2] ||
    aRank[3].localeCompare(bRank[3])
  );
}

export function getCarouselBundleMembers(bundle: ScrapedProduct): ScrapedProduct[] {
  if (bundle.carouselItems && bundle.carouselItems.length > 0) {
    return bundle.carouselItems.map((item) => materializeCarouselItem(bundle, item));
  }
  return [bundle];
}

export function rebuildCarouselBundle(
  bundle: ScrapedProduct,
  members: ScrapedProduct[]
): ScrapedProduct | null {
  const uniqueMembers = Array.from(
    new Map(members.filter((member) => member.id).map((member) => [member.id, member])).values()
  ).sort(compareProducts);

  if (uniqueMembers.length === 0) return null;

  const hero = uniqueMembers[0];
  if (uniqueMembers.length === 1) {
    return {
      ...hero,
      carouselItems: null,
      isCarouselBundle: false,
      carouselBundleCount: 1,
      carouselGroupKey: bundle.carouselGroupKey,
    };
  }

  return {
    ...hero,
    carouselItems: uniqueMembers.map(toCarouselItemSummary),
    isCarouselBundle: true,
    carouselBundleCount: uniqueMembers.length,
    carouselGroupKey: bundle.carouselGroupKey,
  };
}

export function mergeCarouselProductPages(
  existing: ScrapedProduct[],
  incoming: ScrapedProduct[]
): ScrapedProduct[] {
  const merged = [...existing];

  for (const product of incoming) {
    const existingIndex = merged.findIndex(
      (candidate) =>
        candidate.id === product.id ||
        Boolean(candidate.carouselItems?.some((item) => item.id === product.id)) ||
        Boolean(
          product.carouselGroupKey && candidate.carouselGroupKey === product.carouselGroupKey
        )
    );

    if (existingIndex < 0) {
      merged.push(product);
      continue;
    }

    const current = merged[existingIndex];
    if (!product.carouselGroupKey) {
      if (!current.carouselItems?.length) {
        merged[existingIndex] = product;
        continue;
      }

      const incomingMember = {
        ...product,
        carouselItems: null,
        isCarouselBundle: false,
        carouselBundleCount: 1,
      };
      const rebuilt = rebuildCarouselBundle(current, [
        ...getCarouselBundleMembers(current).filter((member) => member.id !== product.id),
        incomingMember,
      ]);
      if (rebuilt) merged[existingIndex] = rebuilt;
      continue;
    }

    const rebuilt = rebuildCarouselBundle(current, [
      ...getCarouselBundleMembers(current),
      ...getCarouselBundleMembers(product),
    ]);
    if (rebuilt) merged[existingIndex] = rebuilt;
  }

  return merged;
}

export function patchProductInCollection(
  products: ScrapedProduct[],
  productId: string,
  patch: Partial<ScrapedProduct>
): ScrapedProduct[] {
  return products.map((product) => {
    const members = getCarouselBundleMembers(product);
    const memberIndex = members.findIndex((member) => member.id === productId);
    if (memberIndex >= 0) {
      members[memberIndex] = { ...members[memberIndex], ...patch };
      return product.carouselItems?.length
        ? rebuildCarouselBundle(product, members) || product
        : { ...product, ...patch };
    }

    return product;
  });
}

export function removeProductFromCollection(
  products: ScrapedProduct[],
  productId: string
): ScrapedProduct[] {
  return products.flatMap((product) => {
    const members = getCarouselBundleMembers(product);
    if (!members.some((member) => member.id === productId)) return [product];

    const remaining = members.filter((member) => member.id !== productId);
    const rebuilt = rebuildCarouselBundle(product, remaining);
    return rebuilt ? [rebuilt] : [];
  });
}

export function findProductInCollection(
  products: ScrapedProduct[],
  productId: string
): ScrapedProduct | null {
  for (const product of products) {
    if (product.id === productId) return product;
    const item = product.carouselItems?.find((candidate) => candidate.id === productId);
    if (item) return materializeCarouselItem(product, item);
  }
  return null;
}

export function restoreProductInCollection(
  products: ScrapedProduct[],
  product: ScrapedProduct,
  targetIndex: number
): ScrapedProduct[] {
  const merged = mergeCarouselProductPages(products, [product]);
  const restoredIndex = merged.findIndex(
    (candidate) =>
      candidate.id === product.id ||
      Boolean(candidate.carouselItems?.some((item) => item.id === product.id)) ||
      Boolean(product.carouselGroupKey && candidate.carouselGroupKey === product.carouselGroupKey)
  );

  if (restoredIndex < 0) {
    const insertionIndex = Math.max(0, Math.min(targetIndex, merged.length));
    return [
      ...merged.slice(0, insertionIndex),
      product,
      ...merged.slice(insertionIndex),
    ];
  }

  const next = [...merged];
  const [restored] = next.splice(restoredIndex, 1);
  const insertionIndex = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(insertionIndex, 0, restored);
  return next;
}

export function preserveCarouselContext(
  detailedProduct: ScrapedProduct,
  sourceProduct: ScrapedProduct
): ScrapedProduct {
  if (!sourceProduct.carouselItems || sourceProduct.carouselItems.length < 2) {
    return detailedProduct;
  }

  return {
    ...detailedProduct,
    carouselItems: sourceProduct.carouselItems,
    isCarouselBundle: true,
    carouselBundleCount: sourceProduct.carouselItems.length,
    carouselGroupKey: sourceProduct.carouselGroupKey,
  };
}
