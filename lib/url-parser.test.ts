import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTrackableUrl,
  resolveTrackableDomain,
  normalizeAddUrlInput,
  buildMetaAdLibrarySearchUrl,
  isSocialDomain,
  extractStoreDomain,
} from "./url-parser";
import { isValidMetaAdLibraryUrl, addProductUrlSchema } from "./validators";

test("resolveTrackableDomain preserves multi-tenant SaaS store subdomains", () => {
  assert.equal(
    resolveTrackableDomain("boutique-mode.youcan.shop"),
    "boutique-mode.youcan.shop"
  );
  assert.equal(
    resolveTrackableDomain("my-brand.myshopify.com"),
    "my-brand.myshopify.com"
  );
  assert.equal(
    resolveTrackableDomain("store.storeino.com"),
    "store.storeino.com"
  );
});

test("resolveTrackableDomain strips store subdomains on custom apex domains", () => {
  assert.equal(resolveTrackableDomain("store.nike.com"), "nike.com");
  assert.equal(resolveTrackableDomain("shop.nike.com"), "nike.com");
  assert.equal(resolveTrackableDomain("www.nike.com"), "nike.com");
  assert.equal(resolveTrackableDomain("nike.com"), "nike.com");
});

test("resolveTrackableDomain handles multi-part ccTLDs correctly", () => {
  assert.equal(resolveTrackableDomain("store.wixi.com.tn"), "wixi.com.tn");
  assert.equal(resolveTrackableDomain("wixi.com.tn"), "wixi.com.tn");
  assert.equal(resolveTrackableDomain("shop.brand.co.uk"), "brand.co.uk");
});

test("parseTrackableUrl handles product links with query strings and paths", () => {
  const result = parseTrackableUrl(
    "https://store.nike.com/products/running-shoe?variant=999&utm_source=facebook&fbclid=abc"
  );

  assert.ok(result);
  assert.equal(result.type, "product_url");
  assert.equal(result.targetDomain, "nike.com");
  assert.ok(result.productUrl?.includes("https://store.nike.com/products/running-shoe"));
  assert.ok(!result.productUrl?.includes("fbclid")); // Stripped tracking param
  assert.ok(result.metaAdLibraryUrl.includes("q=%22nike.com%22"));
});

test("parseTrackableUrl handles SaaS store product URLs", () => {
  const result = parseTrackableUrl(
    "https://boutique.youcan.shop/products/sample-dress?ref=ad1"
  );

  assert.ok(result);
  assert.equal(result.type, "product_url");
  assert.equal(result.targetDomain, "boutique.youcan.shop");
  assert.ok(result.metaAdLibraryUrl.includes("q=%22boutique.youcan.shop%22"));
});

test("parseTrackableUrl handles direct Meta Ad Library URLs", () => {
  const adLibraryUrl =
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=TN&view_all_page_id=12345678&search_type=page&media_type=all";
  const result = parseTrackableUrl(adLibraryUrl);

  assert.ok(result);
  assert.equal(result.type, "meta_ad_library");
  assert.equal(result.metaAdLibraryUrl, adLibraryUrl);
});

test("parseTrackableUrl rejects non-store social media profiles", () => {
  assert.equal(parseTrackableUrl("https://instagram.com/some_brand"), null);
  assert.equal(parseTrackableUrl("https://tiktok.com/@some_user"), null);
  assert.equal(parseTrackableUrl("https://facebook.com/brandpage"), null);
});

test("normalizeAddUrlInput and validators support product URLs seamlessly", () => {
  const productUrl = "https://brand.com/products/jacket";
  const normalized = normalizeAddUrlInput(productUrl);

  assert.ok(normalized);
  assert.ok(normalized.includes("q=%22brand.com%22"));
  assert.equal(isValidMetaAdLibraryUrl(productUrl), true);

  const validation = addProductUrlSchema.safeParse({ url: productUrl });
  assert.equal(validation.success, true);
  assert.equal(validation.data.runner, "local"); // default is local

  const validationWithApify = addProductUrlSchema.safeParse({
    url: productUrl,
    runner: "apify",
  });
  assert.equal(validationWithApify.success, true);
  assert.equal(validationWithApify.data.runner, "apify");

  const validationInvalidRunner = addProductUrlSchema.safeParse({
    url: productUrl,
    runner: "invalid_runner",
  });
  assert.equal(validationInvalidRunner.success, false);
});

test("isSocialDomain identifies social media hosts and ignores others", () => {
  assert.equal(isSocialDomain("facebook.com"), true);
  assert.equal(isSocialDomain("www.facebook.com"), true);
  assert.equal(isSocialDomain("https://facebook.com/ads/library/"), true);
  assert.equal(isSocialDomain("instagram.com"), true);
  assert.equal(isSocialDomain("tiktok.com"), true);
  assert.equal(isSocialDomain("local-store.converty.shop"), false);
  assert.equal(isSocialDomain("nike.com"), false);
});

test("extractStoreDomain unwraps Meta Ad Library search URLs and rejects bare Facebook links", () => {
  // Meta ad search with keyword domain
  const adSearchUrl = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&q=%22local-store.converty.shop%22&search_type=keyword_exact_phrase';
  assert.equal(extractStoreDomain(adSearchUrl), "local-store.converty.shop");

  // Meta ad search without domain query
  const pageSearchUrl = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=103262046190718&search_type=page&media_type=all';
  assert.equal(extractStoreDomain(pageSearchUrl), null);

  // Social profile link
  assert.equal(extractStoreDomain("https://www.facebook.com/zoomshop"), null);

  // Normal store landing page
  assert.equal(extractStoreDomain("https://boutique.youcan.shop/products/dress"), "boutique.youcan.shop");
  assert.equal(extractStoreDomain("tuni-go.com"), "tuni-go.com");
});

