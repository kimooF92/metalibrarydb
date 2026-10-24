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

test("detectExtractionDoubt flags USD prices caused by cloud scraper geo-switching", () => {
  const usdPrice = detectExtractionDoubt({
    title: "Montre Connectée Sport",
    currentPrice: "$19.99",
  });
  assert.equal(usdPrice.hasDoubt, true);
  assert.equal(usdPrice.needsPriceReferee, true);
  assert.match(usdPrice.reasons[0], /USD \/ foreign currency detected/i);

  const usdSuffix = detectExtractionDoubt({
    title: "Casque Bluetooth Sans Fil",
    currentPrice: "24.99 USD",
  });
  assert.equal(usdSuffix.hasDoubt, true);
  assert.equal(usdSuffix.needsPriceReferee, true);
});

test("harvestPriceCandidates handles legitimate prices under 10 and ignores CSS class numbers", () => {
  const sampleHtml = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "ملصقات جدارية",
      "offers": { "@type": "Offer", "price": 9, "priceCurrency": "TND" }
    }
    </script>
    <div class="product-offre__prices flex flex-col items-end">
      <div class="product-offre__price text-gray-700 font-medium">9.00 د.ت</div>
      <div class="product-offre__old-price text-gray-600 line-through">20.00 د.ت</div>
    </div>
    <div class="delivery">Frais de livraison: 7 DT</div>
    <div class="banner">LIVRAISON GRATUITE DÈS 200 DT</div>
  `;

  const candidates = harvestPriceCandidates(sampleHtml, "", "DT");
  const values = candidates.map((c) => c.value);

  // Must include the real 9 DT and original 20 DT
  assert.ok(values.includes("9 DT"), "Must harvest genuine 9 DT");
  assert.ok(values.includes("20 DT"), "Must harvest original 20 DT");

  // Must NOT contain 700 DT (corrupted from text-gray-700)
  assert.ok(!values.includes("700 DT"), "Must never match 700 from CSS class text-gray-700");

  // Delivery 7 DT and Threshold 200 DT must be flagged as delivery
  const cand7 = candidates.find((c) => c.value === "7 DT");
  assert.ok(cand7?.isDelivery, "7 DT must be flagged as delivery");

  const cand200 = candidates.find((c) => c.value === "200 DT");
  assert.ok(cand200?.isDelivery, "200 DT must be flagged as delivery threshold");

  // High confidence must be set on the JSON-LD candidate
  const cand9 = candidates.find((c) => c.value === "9 DT");
  assert.equal(cand9?.isHighConfidence, true, "9 DT must be high confidence from JSON-LD");
});

