import test from "node:test";
import assert from "node:assert/strict";
import { detectExtractionDoubt } from "./doubt-detector";
import { enhanceProductWithJev } from "./product-enhancer";

test("detectExtractionDoubt flags foreign currencies ($ / € / £ / USD / EUR)", () => {
  const usdCheck = detectExtractionDoubt({
    title: "Wireless Bluetooth Earbuds",
    currentPrice: "$19.99",
    url: "https://shop.com/products/earbuds",
  });
  assert.equal(usdCheck.hasDoubt, true);
  assert.equal(usdCheck.needsPriceReferee, true);
  assert.equal(usdCheck.isForeignCurrency, true);
  assert.match(usdCheck.reasons.join(" "), /foreign currency/i);

  const eurCheck = detectExtractionDoubt({
    title: "Air Fryer 6L Digital",
    currentPrice: "29.99 €",
    url: "https://shop.com/products/air-fryer",
  });
  assert.equal(eurCheck.hasDoubt, true);
  assert.equal(eurCheck.isForeignCurrency, true);

  const wordUsdCheck = detectExtractionDoubt({
    title: "Smartwatch Ultra Series 9",
    currentPrice: "45 USD",
    url: "https://shop.com/products/smartwatch",
  });
  assert.equal(wordUsdCheck.hasDoubt, true);
  assert.equal(wordUsdCheck.isForeignCurrency, true);
});

test("detectExtractionDoubt does NOT flag standard local currencies (DT / DH / TND / MAD)", () => {
  const dtCheck = detectExtractionDoubt({
    title: "Montre Connectée Ultra Series 9",
    currentPrice: "89 DT",
    url: "https://store.tn/products/montre-ultra",
  });
  assert.equal(dtCheck.isForeignCurrency, false);

  const dhCheck = detectExtractionDoubt({
    title: "Pack Huile D'Argan Bio Maroc",
    currentPrice: "199 DH",
    url: "https://store.ma/products/pack-argan",
  });
  assert.equal(dhCheck.isForeignCurrency, false);
});

test("enhanceProductWithJev preserves foreign currency without silently relabeling to DT/DH", async () => {
  const result = await enhanceProductWithJev({
    title: "Smart Watch Ultra Pro",
    currentPrice: "$19.99",
    originalPrice: "$29.99",
    url: "https://intl-store.com/products/smart-watch",
    fallbackCurrencySymbol: "DT",
  });

  // Must NOT convert "$19.99" into "19.99 DT" or "$29.99" into "29.99 DT"!
  assert.notEqual(result.currentPrice, "19.99 DT");
  assert.equal(result.currentPrice, "$19.99");
  assert.notEqual(result.originalPrice, "29.99 DT");
  assert.equal(result.originalPrice, "$29.99");
  assert.equal(result.scrapeStatus, "needs_review");
  assert.match(result.statusReason || "", /foreign currency/i);
});

test("enhanceProductWithJev remediates generic navigation titles using product slug", async () => {
  const result = await enhanceProductWithJev({
    title: "Accueil - Bienvenue",
    currentPrice: "49 DT",
    url: "https://store.tn/products/pack-anti-chute-cheveux-bio",
    fallbackCurrencySymbol: "DT",
  });

  // Title must be recovered from the slug
  assert.equal(result.title, "Pack Anti Chute Cheveux Bio");
  assert.equal(result.currentPrice, "49 DT");
});

test("enhanceProductWithJev marks non-descriptive numeric slugs as needs_review", async () => {
  const result = await enhanceProductWithJev({
    title: "Accueil",
    currentPrice: "49 DT",
    url: "https://store.tn/products/12345", // numeric slug cannot provide descriptive title
    fallbackCurrencySymbol: "DT",
  });

  assert.equal(result.scrapeStatus, "needs_review");
  assert.match(result.statusReason || "", /non-descriptive slug/i);
});
