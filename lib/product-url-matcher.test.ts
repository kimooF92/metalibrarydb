import { test } from "node:test";
import assert from "node:assert";
import {
  normalizeProductUrl,
  generateUrlSearchVariants,
} from "./product-url-matcher";

test("normalizeProductUrl cleans trailing slashes, parameters, and lowercases hostname", () => {
  const url1 = "https://DEAL-TECH.store/products/interactive-learning-book-ar-fr-en/?utm_source=fb&fbclid=XYZ123";
  assert.strictEqual(
    normalizeProductUrl(url1),
    "https://deal-tech.store/products/interactive-learning-book-ar-fr-en"
  );

  const url2 = "https://deal-tech.store/products/interactive-learning-book-ar-fr-en/";
  assert.strictEqual(
    normalizeProductUrl(url2),
    "https://deal-tech.store/products/interactive-learning-book-ar-fr-en"
  );

  const url3 = "https://deal-tech.store/products/interactive-learning-book-ar-fr-en";
  assert.strictEqual(
    normalizeProductUrl(url3),
    "https://deal-tech.store/products/interactive-learning-book-ar-fr-en"
  );

  assert.strictEqual(normalizeProductUrl(""), null);
  assert.strictEqual(normalizeProductUrl(null), null);
  assert.strictEqual(normalizeProductUrl(undefined), null);
});

test("generateUrlSearchVariants produces robust set covering slash variations and canonical form", () => {
  const inputUrl = "https://deal-tech.store/products/interactive-learning-book-ar-fr-en/";
  const variants = generateUrlSearchVariants(inputUrl);

  // Must include trimmed input
  assert.ok(variants.includes("https://deal-tech.store/products/interactive-learning-book-ar-fr-en/"));
  // Must include without trailing slash
  assert.ok(variants.includes("https://deal-tech.store/products/interactive-learning-book-ar-fr-en"));
  // Must handle UTM stripped form
  const inputWithUtm = "https://deal-tech.store/products/interactive-learning-book-ar-fr-en/?fbclid=abc";
  const utmVariants = generateUrlSearchVariants(inputWithUtm);
  assert.ok(utmVariants.includes("https://deal-tech.store/products/interactive-learning-book-ar-fr-en"));
  assert.ok(utmVariants.includes("https://deal-tech.store/products/interactive-learning-book-ar-fr-en/"));
});
