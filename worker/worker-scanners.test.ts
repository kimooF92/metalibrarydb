import test from "node:test";
import assert from "node:assert/strict";
import {
  scanAdCreatives,
  parseAdGraphQLNode,
  processAdMedia,
} from "./spy-scanner";
import {
  runDiscoveryScan,
  isMatchingEcommerceCta,
  parseDiscoveryGraphQLNode,
} from "./discovery-scanner";
import { withDistributedScrapeLock } from "./core/distributed-lock";

test("Worker Scanner Barrel Re-exports & Interfaces", () => {
  assert.equal(typeof scanAdCreatives, "function", "scanAdCreatives should be a function");
  assert.equal(typeof parseAdGraphQLNode, "function", "parseAdGraphQLNode should be a function");
  assert.equal(typeof processAdMedia, "function", "processAdMedia should be a function");
  assert.equal(typeof runDiscoveryScan, "function", "runDiscoveryScan should be a function");
  assert.equal(typeof isMatchingEcommerceCta, "function", "isMatchingEcommerceCta should be a function");
  assert.equal(typeof parseDiscoveryGraphQLNode, "function", "parseDiscoveryGraphQLNode should be a function");
});

test("parseAdGraphQLNode normalizes node structures safely", () => {
  // Empty or invalid node returns null
  assert.equal(parseAdGraphQLNode(null), null);
  assert.equal(parseAdGraphQLNode({}), null);

  // Valid node extracts normalized attributes
  const node = {
    adArchiveID: "123456789",
    pageID: "987654321",
    publisherPlatformPageName: "Acme Store",
    startDate: 1700000000,
    snapshot: {
      body: { text: "Best deal of the season!" },
      title: "Super Sale",
      cta_text: "Shop Now",
      link_url: "https://acme.com/deal",
      images: [{ original_image_url: "https://acme.com/img.jpg" }],
    },
  };

  const parsed = parseAdGraphQLNode(node);
  assert.ok(parsed, "Parsed result should not be null");
  assert.equal(parsed.adArchiveId, "123456789");
  assert.equal(parsed.pageName, "Acme Store");
  assert.equal(parsed.ctaText, "Shop Now");
  assert.equal(parsed.linkUrl, "https://acme.com/deal");
  assert.equal(parsed.mediaType, "image");
});

test("isMatchingEcommerceCta categorizes commercial CTA types accurately", () => {
  // E-commerce CTAs
  assert.equal(isMatchingEcommerceCta("SHOP_NOW"), true);
  assert.equal(isMatchingEcommerceCta("ORDER_NOW"), true);
  assert.equal(isMatchingEcommerceCta("BUY_NOW"), true);
  assert.equal(isMatchingEcommerceCta("GET_OFFER"), true);
  assert.equal(isMatchingEcommerceCta(null, "Shop Now"), true);
  assert.equal(isMatchingEcommerceCta(null, "Acheter"), true);

  // Non-commercial or informational CTAs
  assert.equal(isMatchingEcommerceCta("LEARN_MORE"), false);
  assert.equal(isMatchingEcommerceCta("SIGN_UP"), false);
  assert.equal(isMatchingEcommerceCta("LIKE_PAGE"), false);
  assert.equal(isMatchingEcommerceCta("CONTACT_US"), false);
  assert.equal(isMatchingEcommerceCta(null), false);
  assert.equal(isMatchingEcommerceCta(undefined), false);
});

test("withDistributedScrapeLock executes callable and handles release", async () => {
  let executed = false;
  const result = await withDistributedScrapeLock(
    "test-page-lock-id",
    "Test Page",
    async () => {
      executed = true;
      return "scan_completed_successfully";
    }
  );

  assert.equal(executed, true, "Lock-protected callback should execute");
  assert.equal(result.acquired, true);
  assert.equal(result.result, "scan_completed_successfully");
});
