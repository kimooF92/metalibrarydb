import { test } from "node:test";
import assert from "node:assert";
import {
  canonicalizeStoreUrl,
  selectBestProductCandidateUrl,
} from "./discovery-product-selector";
import { validatePreviewQuality } from "./preview-validator";
import { isSafePublicUrl } from "./html-scraper";

test("canonicalizeStoreUrl strips UTM parameters, tracking shims, and normalizes URLs", () => {
  const url1 = "https://store.tn/products/smart-watch?utm_source=facebook&utm_medium=cpc&fbclid=IwAR123";
  assert.strictEqual(canonicalizeStoreUrl(url1), "https://store.tn/products/smart-watch");

  const url2 = "https://shop.com/produit/sac-a-main/?gclid=xyz&ref=instagram";
  assert.strictEqual(canonicalizeStoreUrl(url2), "https://shop.com/produit/sac-a-main");

  const url3 = "http://MY-SHOP.com/";
  assert.strictEqual(canonicalizeStoreUrl(url3), "http://my-shop.com/");

  const url4 = "invalid-url";
  assert.strictEqual(canonicalizeStoreUrl(url4), null);
});

test("selectBestProductCandidateUrl prioritizes deep product paths over homepages", () => {
  const sampleUrls = [
    "https://facebook.com/my-page",
    "https://wa.me/21612345678",
    "https://boutique-tendance.tn/pages/about-us",
    "https://boutique-tendance.tn/products/air-cushion-cc-cream?fbclid=123",
    "https://boutique-tendance.tn/",
  ];

  const selection = selectBestProductCandidateUrl(sampleUrls);
  assert.ok(selection);
  assert.strictEqual(selection.source, "product_page");
  assert.strictEqual(selection.url, "https://boutique-tendance.tn/products/air-cushion-cc-cream");
});

test("selectBestProductCandidateUrl falls back to homepage when no deep product path is present", () => {
  const sampleUrls = [
    "https://wa.me/21612345678",
    "https://boutique-tendance.tn/?utm_source=meta",
  ];

  const selection = selectBestProductCandidateUrl(sampleUrls);
  assert.ok(selection);
  assert.strictEqual(selection.source, "homepage_fallback");
  assert.strictEqual(selection.url, "https://boutique-tendance.tn");
});

test("selectBestProductCandidateUrl returns null when only excluded hosts are present", () => {
  const sampleUrls = [
    "https://wa.me/21612345678",
    "https://instagram.com/my_store",
    "https://bit.ly/3XYZ123",
  ];

  const selection = selectBestProductCandidateUrl(sampleUrls);
  assert.strictEqual(selection, null);
});

test("validatePreviewQuality filters out empty, generic, or price-based titles and missing images", () => {
  // Missing image
  const res1 = validatePreviewQuality({
    title: "Sac à Main Cuir",
    current_price: "49.00 DT",
    main_image_url: "",
  });
  assert.strictEqual(res1.isValid, false);

  // Generic placeholder title
  const res2 = validatePreviewQuality({
    title: "Product Landing Page",
    current_price: "49.00 DT",
    main_image_url: "https://store.tn/cdn/image.jpg",
  });
  assert.strictEqual(res2.isValid, false);

  // Price string as title
  const res3 = validatePreviewQuality({
    title: "49.00 DT",
    current_price: "49.00 DT",
    main_image_url: "https://store.tn/cdn/image.jpg",
  });
  assert.strictEqual(res3.isValid, false);

  // Valid product
  const res4 = validatePreviewQuality({
    title: "Montre Intelligente Pro 2026 - Boutique TN",
    current_price: "89.00 DT",
    main_image_url: "https://store.tn/cdn/watch.jpg",
  });
  assert.strictEqual(res4.isValid, true);
  assert.strictEqual(res4.cleanTitle, "Montre Intelligente Pro 2026");
  assert.strictEqual(res4.cleanPrice, "89.00 DT");
  assert.strictEqual(res4.imageUrl, "https://store.tn/cdn/watch.jpg");
});

test("isSafePublicUrl blocks private, loopback, and cloud metadata IPs (IPv4 and IPv6)", () => {
  // IPv4 tests
  assert.strictEqual(isSafePublicUrl("http://localhost:3000/api"), false);
  assert.strictEqual(isSafePublicUrl("http://127.0.0.1/admin"), false);
  assert.strictEqual(isSafePublicUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.strictEqual(isSafePublicUrl("http://192.168.1.1/setup"), false);
  assert.strictEqual(isSafePublicUrl("http://10.0.0.1/status"), false);
  assert.strictEqual(isSafePublicUrl("http://172.16.0.5/api"), false);
  assert.strictEqual(isSafePublicUrl("http://0.0.0.0/test"), false);

  // IPv6 tests (RFC 4291, RFC 4193, RFC 3879)
  assert.strictEqual(isSafePublicUrl("http://[::1]/admin"), false);
  assert.strictEqual(isSafePublicUrl("http://[0:0:0:0:0:0:0:1]/admin"), false);
  assert.strictEqual(isSafePublicUrl("http://[fe80::1]/setup"), false); // Link-local
  assert.strictEqual(isSafePublicUrl("http://[fc00::1]/internal"), false); // ULA
  assert.strictEqual(isSafePublicUrl("http://[fd12:3456::1]/test"), false); // ULA
  assert.strictEqual(isSafePublicUrl("http://[::ffff:127.0.0.1]/test"), false); // IPv4-mapped IPv6

  // Non-IP internal machine names
  assert.strictEqual(isSafePublicUrl("http://metadata/latest"), false);
  assert.strictEqual(isSafePublicUrl("http://admin/login"), false);

  // Valid public targets
  assert.strictEqual(isSafePublicUrl("https://example.com/products/item"), true);
  assert.strictEqual(isSafePublicUrl("https://store.tn/produit-test"), true);
  assert.strictEqual(isSafePublicUrl("http://[2607:f8b0:4005:805::200e]/test"), true); // Public Google IPv6
});
