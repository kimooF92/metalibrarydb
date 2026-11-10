import { test } from "node:test";
import assert from "node:assert";
import { ScrapedProduct, CarouselItemSummary } from "@/types";
import {
  getCarouselGroupKey,
  groupProductsIntoCarousels,
  shouldGroupCarousels,
} from "@/services/product-query-service";
import {
  materializeCarouselItem,
  mergeCarouselProductPages,
  patchProductInCollection,
  preserveCarouselContext,
  restoreProductInCollection,
} from "@/lib/carousel-grouping";

/**
 * Grouping function replicating the engine in /api/products
 */
function groupCarouselProducts(
  products: any[],
  groupCarousels: boolean,
  limit: number = 24
) {
  if (!groupCarousels) return products.slice(0, limit);
  return groupProductsIntoCarousels(products, limit, !groupCarousels);
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

test("Carousel grouping invariant: groupProductsIntoCarousels with skipGrouping=true (includeDetails=true) preserves flat products without grouping", () => {
  const mockProducts = [
    { id: "prod-1", domain: "tbshopp.com", brandPageId: "183958198135625", hasCarouselAd: true, activeAdsCount: 3 },
    { id: "prod-2", domain: "tbshopp.com", brandPageId: "183958198135625", hasCarouselAd: true, activeAdsCount: 8 },
    { id: "prod-3", domain: "tbshopp.com", brandPageId: "183958198135625", hasCarouselAd: true, activeAdsCount: 1 },
  ];

  // When skipGrouping is true (e.g. single product detail modal read), products are returned flat
  const flat = groupProductsIntoCarousels(mockProducts, 24, true);
  assert.strictEqual(flat.length, 3);
  assert.strictEqual(flat[0].id, "prod-1");
  assert.strictEqual(flat[0].isCarouselBundle, undefined);
  assert.strictEqual(flat[1].id, "prod-2");
  assert.strictEqual(flat[2].id, "prod-3");
});

test("Carousel grouping uses a valid page identity and never groups by domain alone", () => {
  assert.strictEqual(
    getCarouselGroupKey({ hasCarouselAd: true, brandPageId: "0", pageId: "  ", domain: "same.com" }),
    null
  );
  assert.strictEqual(
    getCarouselGroupKey({ hasCarouselAd: true, brandPageId: "  PAGE-42  " }),
    "page:page-42"
  );
});

test("Carousel bundles merge unique siblings when a group crosses API pages", () => {
  const pageOne = groupProductsIntoCarousels(
    [{ id: "prod-1", brandPageId: "page-1", hasCarouselAd: true, activeAdsCount: 3 }],
    24
  );
  const pageTwo = groupProductsIntoCarousels(
    [{ id: "prod-2", brandPageId: "page-1", hasCarouselAd: true, activeAdsCount: 8 }],
    24
  );

  const merged = mergeCarouselProductPages(pageOne, pageTwo);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].carouselBundleCount, 2);
  assert.deepStrictEqual(
    merged[0].carouselItems?.map((item) => item.id),
    ["prod-2", "prod-1"]
  );
});

test("Carousel summaries retain slide-specific status and empty values", () => {
  const grouped = groupProductsIntoCarousels(
    [
      {
        id: "prod-1",
        brandPageId: "page-1",
        hasCarouselAd: true,
        title: "Hero",
        currentPrice: "100 DT",
        mainImageUrl: "hero.jpg",
        scrapeStatus: "success",
      },
      {
        id: "prod-2",
        brandPageId: "page-1",
        hasCarouselAd: true,
        title: "Pending sibling",
        currentPrice: null,
        mainImageUrl: null,
        scrapeStatus: "pending",
      },
    ],
    24
  );

  const sibling = grouped[0].carouselItems?.find((item: CarouselItemSummary) => item.id === "prod-2");
  assert.strictEqual(sibling?.currentPrice, null);
  assert.strictEqual(sibling?.mainImageUrl, null);
  assert.strictEqual(sibling?.scrapeStatus, "pending");
});

test("Nested slide updates patch the rendered bundle instead of only the hero", () => {
  const [bundle] = groupProductsIntoCarousels(
    [
      { id: "hero", brandPageId: "page-1", hasCarouselAd: true, activeAdsCount: 8 },
      { id: "sibling", brandPageId: "page-1", hasCarouselAd: true, isFavorite: false },
    ],
    24
  );

  const [patched] = patchProductInCollection([bundle], "sibling", { isFavorite: true });
  assert.strictEqual(
    patched.carouselItems?.find((item) => item.id === "sibling")?.isFavorite,
    true
  );
});

test("Hero updates keep the bundle and update the hero summary", () => {
  const [bundle] = groupProductsIntoCarousels(
    [
      { id: "hero", brandPageId: "page-1", hasCarouselAd: true, title: "Old hero" },
      { id: "sibling", brandPageId: "page-1", hasCarouselAd: true, title: "Sibling" },
    ],
    24
  );

  const [patched] = patchProductInCollection([bundle], "hero", { title: "New hero" });
  assert.strictEqual(patched.isCarouselBundle, true);
  assert.strictEqual(patched.carouselItems?.find((item) => item.id === "hero")?.title, "New hero");
  assert.strictEqual(patched.carouselItems?.length, 2);
});

test("Carousel materialization preserves inherited fields when a summary omits them", () => {
  const bundle = {
    id: "hero",
    url: "https://example.com/hero",
    title: "Hero",
    brandName: "Brand",
    brandHoldStatus: "on_hold" as const,
    isFavorite: true,
  };
  const materialized = materializeCarouselItem(bundle as unknown as ScrapedProduct, {
    id: "sibling",
    url: "https://example.com/sibling",
    title: "Sibling",
    currentPrice: null,
    mainImageUrl: null,
    isFavorite: null,
  });

  assert.strictEqual(materialized.brandName, "Brand");
  assert.strictEqual(materialized.brandHoldStatus, "on_hold");
  assert.strictEqual(materialized.isFavorite, true);
});

test("Appending an ungrouped duplicate updates an existing bundle member", () => {
  const [bundle] = groupProductsIntoCarousels(
    [
      { id: "hero", brandPageId: "page-1", hasCarouselAd: true, title: "Hero" },
      { id: "sibling", brandPageId: "page-1", hasCarouselAd: true, title: "Old" },
    ],
    24
  );

  const [merged] = mergeCarouselProductPages([bundle], [
    {
      id: "sibling",
      url: "https://example.com/sibling",
      title: "Updated",
      carouselGroupKey: null,
    } as unknown as ScrapedProduct,
  ]);
  assert.strictEqual(merged.carouselItems?.find((item) => item.id === "sibling")?.title, "Updated");
  assert.strictEqual(merged.carouselItems?.length, 2);
});

test("Restoring a deleted product returns the collection item to its original position", () => {
  const products = [
    { id: "first", title: "First" } as ScrapedProduct,
    { id: "second", title: "Second" } as ScrapedProduct,
  ];
  const restored = restoreProductInCollection(
    [products[0]],
    products[1],
    1
  );

  assert.deepStrictEqual(restored.map((product) => product.id), ["first", "second"]);
});

test("Detail hydration preserves the grouped sibling context", () => {
  const [bundle] = groupProductsIntoCarousels(
    [
      { id: "hero", brandPageId: "page-1", hasCarouselAd: true },
      { id: "sibling", brandPageId: "page-1", hasCarouselAd: true },
    ],
    24
  );
  const detailed = preserveCarouselContext(
    { ...bundle, id: "sibling", carouselItems: null, isCarouselBundle: false },
    bundle
  );

  assert.strictEqual(detailed.isCarouselBundle, true);
  assert.strictEqual(detailed.carouselItems?.length, 2);
});

test("Lean and detail requests explicitly skip grouping", () => {
  assert.strictEqual(shouldGroupCarousels(true, false, false), true);
  assert.strictEqual(shouldGroupCarousels(true, true, false), false);
  assert.strictEqual(shouldGroupCarousels(true, false, true), false);
});

test("Cache hygiene invariant: Brand cache key suffix null-guard prevents wiping all workspace brand caches", () => {
  const ws = "test-ws-123";
  const getBrandCachePrefix = (domain: string | null | undefined): string | null => {
    const brandKey = (domain || "").toLowerCase().trim();
    return brandKey ? `cache:brand:${ws}:${brandKey}:` : null;
  };

  // With a valid domain
  assert.strictEqual(getBrandCachePrefix("example.com"), "cache:brand:test-ws-123:example.com:");
  assert.strictEqual(getBrandCachePrefix("  TBSHOPP.COM  "), "cache:brand:test-ws-123:tbshopp.com:");

  // With null, empty, or whitespace-only domain, brand cache prefix MUST be null (never cache:brand:test-ws-123::)
  assert.strictEqual(getBrandCachePrefix(null), null);
  assert.strictEqual(getBrandCachePrefix(""), null);
  assert.strictEqual(getBrandCachePrefix("   "), null);
  assert.strictEqual(getBrandCachePrefix(undefined), null);
});

