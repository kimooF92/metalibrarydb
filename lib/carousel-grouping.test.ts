import { test } from "node:test";
import assert from "node:assert";
import { ScrapedProduct, CarouselItemSummary } from "@/types";

/**
 * Grouping function replicating the engine in /api/products
 */
function groupCarouselProducts(
  products: any[],
  groupCarousels: boolean,
  limit: number = 24
) {
  if (!groupCarousels) return products.slice(0, limit);

  const carouselGroups = new Map<string, any[]>();

  for (const p of products) {
    if (p.hasCarouselAd) {
      const groupKey = p.brandPageId
        ? `brand:${p.brandPageId}`
        : p.pageId
        ? `page:${p.pageId}`
        : p.domain
        ? `domain:${p.domain.toLowerCase()}`
        : null;

      if (groupKey) {
        const existing = carouselGroups.get(groupKey) || [];
        existing.push(p);
        carouselGroups.set(groupKey, existing);
      }
    }
  }

  const consolidated: any[] = [];
  const processedGroupKeys = new Set<string>();

  for (const p of products) {
    if (p.hasCarouselAd) {
      const groupKey = p.brandPageId
        ? `brand:${p.brandPageId}`
        : p.pageId
        ? `page:${p.pageId}`
        : p.domain
        ? `domain:${p.domain.toLowerCase()}`
        : null;

      if (groupKey) {
        if (processedGroupKeys.has(groupKey)) continue;
        processedGroupKeys.add(groupKey);

        const group = carouselGroups.get(groupKey) || [p];
        if (group.length > 1) {
          // Sort within cluster so highest active ads / strongest product serves as Hero
          group.sort(
            (a, b) =>
              (b.activeAdsCount || 0) - (a.activeAdsCount || 0) ||
              (b.linkedAdsCount || 0) - (a.linkedAdsCount || 0)
          );

          const hero = { ...group[0] };
          hero.isCarouselBundle = true;
          hero.carouselBundleCount = group.length;
          hero.carouselItems = group.map((item) => ({
            id: item.id,
            url: item.url,
            title: item.title,
            currentPrice: item.currentPrice,
            originalPrice: item.originalPrice,
            currency: item.currency,
            discountOrOffer: item.discountOrOffer,
            mainImageUrl: item.mainImageUrl,
            activeAdsCount: item.activeAdsCount,
            linkedAdsCount: item.linkedAdsCount,
            isFavorite: item.isFavorite,
            createdAt: item.createdAt,
          }));
          consolidated.push(hero);
          continue;
        } else {
          consolidated.push(p);
          continue;
        }
      }
    }
    consolidated.push(p);
  }

  return consolidated.slice(0, limit);
}

test("Task 1: Groups sibling carousel products from same brand into single stacked card", () => {
  const mockProducts = [
    {
      id: "prod-1",
      domain: "tbshopp.com",
      brandPageId: "183958198135625",
      title: "Organisateur de Bijoux",
      hasCarouselAd: true,
      activeAdsCount: 3,
      currentPrice: "24.9 DT",
    },
    {
      id: "prod-2",
      domain: "tbshopp.com",
      brandPageId: "183958198135625",
      title: "Houdh Al Matbakh",
      hasCarouselAd: true,
      activeAdsCount: 8, // Highest active ads!
      currentPrice: "189 DT",
    },
    {
      id: "prod-3",
      domain: "tbshopp.com",
      brandPageId: "183958198135625",
      title: "Sechoir Mural",
      hasCarouselAd: true,
      activeAdsCount: 1,
      currentPrice: "49 DT",
    },
    {
      id: "standalone-1",
      domain: "otherbrand.com",
      brandPageId: "99999",
      title: "Smart Watch V8",
      hasCarouselAd: false,
      activeAdsCount: 4,
      currentPrice: "59 DT",
    },
  ];

  const grouped = groupCarouselProducts(mockProducts, true);

  // Instead of 4 items, should collapse 3 tbshopp items into 1 stacked card + 1 standalone = 2 cards!
  assert.strictEqual(grouped.length, 2);

  const bundle = grouped[0];
  assert.strictEqual(bundle.isCarouselBundle, true);
  assert.strictEqual(bundle.carouselBundleCount, 3);
  assert.strictEqual(bundle.carouselItems?.length, 3);

  // Hero product should be prod-2 because activeAdsCount = 8
  assert.strictEqual(bundle.id, "prod-2");
  assert.strictEqual(bundle.title, "Houdh Al Matbakh");
  assert.strictEqual(bundle.activeAdsCount, 8);

  // Second card should be untouched standalone-1
  assert.strictEqual(grouped[1].id, "standalone-1");
  assert.strictEqual(grouped[1].isCarouselBundle, undefined);
});

test("Task 2: Returns unbundled flat products when groupCarousels is false", () => {
  const mockProducts = [
    { id: "prod-1", domain: "tbshopp.com", brandPageId: "183958198135625", hasCarouselAd: true },
    { id: "prod-2", domain: "tbshopp.com", brandPageId: "183958198135625", hasCarouselAd: true },
    { id: "prod-3", domain: "tbshopp.com", brandPageId: "183958198135625", hasCarouselAd: true },
  ];

  const unbundled = groupCarouselProducts(mockProducts, false);
  assert.strictEqual(unbundled.length, 3);
  assert.strictEqual(unbundled[0].isCarouselBundle, undefined);
  assert.strictEqual(unbundled[1].isCarouselBundle, undefined);
  assert.strictEqual(unbundled[2].isCarouselBundle, undefined);
});

test("Task 3: Single carousel product without siblings is not marked as bundle", () => {
  const mockProducts = [
    {
      id: "solo-1",
      domain: "solostore.com",
      brandPageId: "11111",
      title: "Solo Dress",
      hasCarouselAd: true,
      activeAdsCount: 2,
    },
  ];

  const grouped = groupCarouselProducts(mockProducts, true);
  assert.strictEqual(grouped.length, 1);
  assert.strictEqual(grouped[0].id, "solo-1");
  assert.strictEqual(grouped[0].isCarouselBundle, undefined);
  assert.strictEqual(grouped[0].carouselItems, undefined);
});
