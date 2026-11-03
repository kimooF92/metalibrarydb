import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeBrandCadence, CadenceAdInput, CadenceProductInput } from "./brand-cadence";

describe("computeBrandCadence", () => {
  it("handles empty ads and products gracefully without throwing", () => {
    const result = computeBrandCadence([], []);
    assert.equal(result.timeSeries.days.length, 30);
    assert.equal(result.timeSeries.weeks.length, 16);
    assert.equal(result.timeSeries.months.length, 12);
    assert.equal(result.productLifecycleFunnel.totalProductsTested, 0);
    assert.equal(result.productLifecycleFunnel.winRate, 0);
    assert.equal(result.dayOfWeekPattern.length, 7);
    assert.deepEqual(result.recentProductLaunches, []);
  });

  it("correctly buckets ads and products into time buckets", () => {
    const now = new Date();
    const mockAds: CadenceAdInput[] = [
      {
        id: "ad-1",
        startedRunningOn: now.toISOString(),
        mediaType: "video",
        duplicationCount: 3,
        isActive: true,
        productId: "prod-1",
      },
      {
        id: "ad-2",
        startedRunningOn: now.toISOString(),
        mediaType: "image",
        duplicationCount: 1,
        isActive: true,
        productId: "prod-1",
      },
    ];

    const mockProducts: CadenceProductInput[] = [
      {
        id: "prod-1",
        title: "Super Insole",
        currentPrice: "49.00",
        currency: "USD",
      },
    ];

    const result = computeBrandCadence(mockAds, mockProducts);

    // Today's bucket should have 2 ads
    const todayBucket = result.timeSeries.days[result.timeSeries.days.length - 1];
    assert.equal(todayBucket.totalAds, 2);
    assert.equal(todayBucket.videoCount, 1);
    assert.equal(todayBucket.imageCount, 1);
    assert.equal(todayBucket.totalCopies, 4);
    assert.equal(todayBucket.newProductsLaunched, 1);

    // Product should be classified in testing/scaling
    assert.equal(result.productLifecycleFunnel.totalProductsTested, 1);
    assert.equal(result.recentProductLaunches.length, 1);
    assert.equal(result.recentProductLaunches[0].id, "prod-1");
    assert.equal(result.recentProductLaunches[0].totalAdsInjected, 2);
    assert.equal(result.recentProductLaunches[0].maxCopies, 3);
  });

  it("resolves real titles and thumbnails from ads when scraped data is missing or generic", () => {
    const now = new Date();
    const mockAds: CadenceAdInput[] = [
      {
        id: "ad-real-1",
        title: "Titanium Magnetic Shaver",
        thumbnailUrl: "https://cdn.example.com/shaver.jpg",
        startedRunningOn: now.toISOString(),
        linkUrl: "https://shop.com/products/titanium-magnetic-shaver",
        duplicationCount: 5,
        isActive: true,
      },
    ];

    // Product with generic "Product Offer" and missing image
    const mockProducts: CadenceProductInput[] = [
      {
        id: "prod-generic",
        url: "https://shop.com/products/titanium-magnetic-shaver",
        title: "Product Offer",
        mainImageUrl: null,
      },
    ];

    const result = computeBrandCadence(mockAds, mockProducts);
    assert.equal(result.recentProductLaunches.length, 1);
    assert.equal(result.recentProductLaunches[0].title, "Titanium Magnetic Shaver");
    assert.equal(result.recentProductLaunches[0].mainImageUrl, "https://cdn.example.com/shaver.jpg");
    assert.equal(result.productLifecycleFunnel.productWinRate, 100);
  });

  it("accurately computes day-of-week distribution", () => {
    // 2026-11-01 was a Sunday (day 0)
    const sundayDate = new Date("2026-11-01T12:00:00Z");
    const mondayDate = new Date("2026-11-02T12:00:00Z");

    const mockAds: CadenceAdInput[] = [
      { id: "ad-sun-1", startedRunningOn: sundayDate.toISOString() },
      { id: "ad-sun-2", startedRunningOn: sundayDate.toISOString() },
      { id: "ad-mon-1", startedRunningOn: mondayDate.toISOString() },
    ];

    const result = computeBrandCadence(mockAds, []);
    const sundayStat = result.dayOfWeekPattern.find((d) => d.dayName === "Sun");
    const mondayStat = result.dayOfWeekPattern.find((d) => d.dayName === "Mon");

    assert.equal(sundayStat?.adCount, 2);
    assert.equal(mondayStat?.adCount, 1);
    assert.equal(sundayStat?.percentage, 67); // 2/3 = 67%
    assert.equal(mondayStat?.percentage, 33); // 1/3 = 33%
  });
});
