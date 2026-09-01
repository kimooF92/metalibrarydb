import test from "node:test";
import assert from "node:assert/strict";
import type { ScrapedProduct } from "../types";
import {
  buildProductExtractionNotification,
  resolveProductForRefresh,
} from "./product-extraction";

const product: ScrapedProduct = {
  id: "product-1",
  url: "https://store.example/product",
  domain: "store.example",
  pageId: null,
  title: "Example Product",
  currentPrice: null,
  originalPrice: null,
  currency: null,
  discountOrOffer: null,
  mainImageUrl: null,
  scrapeStatus: "success",
  lastScrapedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

test("resolves a product from the current list", () => {
  assert.equal(resolveProductForRefresh(product.id, [product]), product);
});

test("resolves a deep-linked product from the fallback context", () => {
  assert.equal(resolveProductForRefresh(product.id, [], product), product);
  assert.equal(resolveProductForRefresh(product.id, [], { ...product, id: "other" }), null);
  assert.equal(
    resolveProductForRefresh(product.id, [{ ...product, url: "" }], product),
    product
  );
});

test("builds success and failure notification payloads", () => {
  const success = buildProductExtractionNotification({
    success: true,
    wasExistingProduct: false,
    productId: product.id,
    title: product.title,
    url: product.url,
  });
  assert.equal(success.title, "Product Added: Example Product (store.example/product)");
  assert.equal(success.severity, "success");
  assert.equal(success.actionUrl, `/products?id=${product.id}`);

  const failure = buildProductExtractionNotification({
    success: false,
    url: product.url,
    domain: product.domain,
    error: "Page blocked",
  });
  assert.match(failure.title, /^Product Extraction Failed: store\.example$/);
  assert.equal(failure.severity, "error");
  assert.match(failure.message, /Page blocked/);

  const refresh = buildProductExtractionNotification({
    success: true,
    wasExistingProduct: true,
    productId: product.id,
    title: product.title,
    url: product.url,
  });
  assert.equal(refresh.title, "Product Re-extracted: Example Product (store.example/product)");
  assert.equal(refresh.metadata.event, "product_re_extracted");
});
