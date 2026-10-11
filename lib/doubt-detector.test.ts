import test from "node:test";
import assert from "node:assert/strict";
import { detectExtractionDoubt, harvestPriceCandidates } from "./doubt-detector";

test("detectExtractionDoubt passes normal clean products with $0 cost and NO doubt", () => {
  const normal1 = detectExtractionDoubt({
    title: "Montre Connectée Ultra Series 9 Smartwatch Bluetooth",
    currentPrice: "89 DT",
    url: "https://store.tn/products/montre-ultra",
  });
  assert.equal(normal1.hasDoubt, false);
  assert.equal(normal1.needsPriceReferee, false);
  assert.equal(normal1.needsTitleReferee, false);

  const normal2 = detectExtractionDoubt({
    title: "Air Fryer Friteuse Sans Huile 6L Double Tiroir",
    currentPrice: "249.9 DT",
    url: "https://store.tn/products/air-fryer-6l",
  });
  assert.equal(normal2.hasDoubt, false);
});

test("detectExtractionDoubt flags micro-prices (<= 10 DT/DH) as delivery/shipping doubt", () => {
  const microPrice = detectExtractionDoubt({
    title: "ميشد الركبة الرياضي الطبي",
    currentPrice: "5 DH",
  });
  assert.equal(microPrice.hasDoubt, true);
  assert.equal(microPrice.needsPriceReferee, true);
  assert.match(microPrice.reasons[0], /delivery fee/i);

  const sevenDt = detectExtractionDoubt({
    title: "Pack 2x Écouteurs Bluetooth Pro",
    currentPrice: "7 DT",
  });
  assert.equal(sevenDt.hasDoubt, true);
  assert.equal(sevenDt.needsPriceReferee, true);
});

test("detectExtractionDoubt flags unusual currency conversion decimals (e.g. 13.32)", () => {
  const convertedPrice = detectExtractionDoubt({
    title: "حامل هاتف محمول 3 في 1 بقاعدة شفط",
    currentPrice: "13.32 DT",
  });
  assert.equal(convertedPrice.hasDoubt, true);
  assert.equal(convertedPrice.needsPriceReferee, true);
  assert.match(convertedPrice.reasons[0], /exchange rate or installment/i);
});

test("detectExtractionDoubt flags generic non-product titles", () => {
  const genericTitle = detectExtractionDoubt({
    title: "Accueil - Gadgety Store Tunisie",
    currentPrice: "49 DT",
  });
  assert.equal(genericTitle.hasDoubt, true);
  assert.equal(genericTitle.needsTitleReferee, true);

  const shortTitle = detectExtractionDoubt({
    title: "Produit",
    currentPrice: "49 DT",
  });
  assert.equal(shortTitle.hasDoubt, true);
  assert.equal(shortTitle.needsTitleReferee, true);
});

test("harvestPriceCandidates extracts unique prices and surrounding context", () => {
  const sampleMarkdown = `
    ### ميشد الركبة
    - 1 pièce: 14 دت
    - 2 pièces promo: 18.9 دت
    - 4 pièces: 57.8 دت
    Livraison 5dt à domicile
  `;

  const candidates = harvestPriceCandidates(null, sampleMarkdown, "DT");
  assert.ok(candidates.length >= 3);
  const values = candidates.map((c) => c.value);
  assert.ok(values.includes("14 DT"));
  assert.ok(values.includes("18.9 DT"));
  assert.ok(values.includes("5 DT"));
});
