import test from "node:test";
import assert from "node:assert/strict";
import {
  scanAdCreatives,
  parseAdGraphQLNode,
  processAdMedia,
} from "./spy-scanner";
import { parseResultCountFromText } from "./scanner";
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

test("parseResultCountFromText 3-tier precedence rules", () => {
  // Case 1: Page has ~37 results AND an individual card that says 'This ad has expired'
  // Must return 37, NOT 0!
  const poisonedBody = `
    Filters: Active status, Country: All
    ~37 results
    Some creative card text...
    This ad has expired
    Another creative card...
  `;
  const res1 = parseResultCountFromText(poisonedBody);
  assert.equal(res1.status, "success");
  assert.equal(res1.results, 37);

  // Case 2: Page explicitly says ~0 results
  const zeroTildeBody = `Filters: Active status\n~0 results\nNo ads to display`;
  const res2 = parseResultCountFromText(zeroTildeBody);
  assert.equal(res2.status, "success");
  assert.equal(res2.results, 0);

  // Case 3: Page explicitly says 0 results
  const zeroHeaderBody = `Search results: 0 results found`;
  const res3 = parseResultCountFromText(zeroHeaderBody);
  assert.equal(res3.status, "success");
  assert.equal(res3.results, 0);

  // Case 4: Page has no count, but says 'No ads match your search criteria'
  const fallbackZeroBody = `Meta Ad Library\nThere are no ads matching your search criteria.`;
  const res4 = parseResultCountFromText(fallbackZeroBody);
  assert.equal(res4.status, "success");
  assert.equal(res4.results, 0);

  // Case 5: French localization with ~190 résultats and an expired blurb
  const frenchBody = `~190 résultats\nCe contenu n'est plus disponible\nCette publicité a expiré`;
  const res5 = parseResultCountFromText(frenchBody);
  assert.equal(res5.status, "success");
  assert.equal(res5.results, 190);
});

test("checkpoint-service persists ads, survives corrupt tail lines, re-hydrates Dates, and cleans up", async () => {
  const fs = await import("node:fs");
  const {
    initScanCheckpoint,
    appendScanCheckpoint,
    readScanCheckpoint,
    cleanupScanCheckpoint,
    getCheckpointPath,
  } = await import("./scanners/checkpoint-service");

  const testScanId = `unit-checkpoint-${Date.now()}`;
  const checkpointFile = initScanCheckpoint(testScanId);

  try {
    const sampleDate = new Date("2026-10-15T12:00:00.000Z");
    appendScanCheckpoint(testScanId, [
      {
        adArchiveId: "ad_001",
        pageId: "123456",
        pageName: "Brand One",
        startedRunningOn: sampleDate,
        caption: "Ad 1 caption",
        title: "Ad 1 title",
        ctaText: "Shop Now",
        linkUrl: "https://example.com/p1",
        mediaType: "image",
        mediaUrls: ["https://cdn.example.com/1.jpg"],
        thumbnailUrl: "https://cdn.example.com/1.jpg",
        duplicationCount: 2,
        collationId: null,
        isActive: true,
      },
    ]);

    // Simulate OOM SIGKILL leaving a truncated/corrupt JSON fragment on the last line
    fs.appendFileSync(checkpointFile, '{"adArchiveId":"ad_002","caption":"truncat', "utf8");

    const { ads, skippedCorruptLines } = readScanCheckpoint(testScanId);
    assert.equal(ads.length, 1);
    assert.equal(skippedCorruptLines, 1);
    assert.equal(ads[0].adArchiveId, "ad_001");
    assert.ok(ads[0].startedRunningOn instanceof Date, "startedRunningOn must be re-hydrated as Date");
    assert.equal(ads[0].startedRunningOn?.toISOString(), sampleDate.toISOString());
  } finally {
    cleanupScanCheckpoint(testScanId);
    assert.equal(fs.existsSync(getCheckpointPath(testScanId)), false, "Checkpoint file must be deleted after cleanup");
  }
});

test("attachMediaAbortRoute aborts binary media, continues API/DOM requests, and detaches safely", async () => {
  const { attachMediaAbortRoute } = await import("./scanners/media-route-guard");

  const captured: { handler: ((route: any) => Promise<void>) | null } = { handler: null };
  let unrouteCalls = 0;

  const mockPage = {
    route: async (url: string, handler: (route: any) => Promise<void>) => {
      assert.equal(url, "**/*");
      captured.handler = handler;
    },
    unroute: async (_url: string, handler: (route: any) => Promise<void>) => {
      assert.equal(handler, captured.handler);
      unrouteCalls++;
    },
    isClosed: () => false,
  } as any;

  const detach = await attachMediaAbortRoute(mockPage);
  assert.ok(captured.handler, "Route handler must be registered");

  const makeMockRoute = (resourceType: string) => {
    let aborted = 0;
    let continued = 0;
    const route = {
      request: () => ({ resourceType: () => resourceType }),
      abort: async () => {
        aborted++;
      },
      continue: async () => {
        continued++;
      },
    };
    return { route, getCounts: () => ({ aborted, continued }) };
  };

  for (const type of ["image", "media", "font", "imageset"]) {
    const mock = makeMockRoute(type);
    await captured.handler(mock.route);
    assert.deepEqual(mock.getCounts(), { aborted: 1, continued: 0 }, `${type} must be aborted`);
  }

  for (const type of ["xhr", "fetch", "document", "script", "stylesheet"]) {
    const mock = makeMockRoute(type);
    await captured.handler(mock.route);
    assert.deepEqual(mock.getCounts(), { aborted: 0, continued: 1 }, `${type} must continue`);
  }

  // Open page: first detach unroutes once, second detach is idempotent
  await detach();
  await detach();
  assert.equal(unrouteCalls, 1, "unroute should be called exactly once when page is open");

  // Closed page: detach must not invoke unroute or throw
  let closedUnrouteCalls = 0;
  const mockClosedPage = {
    route: async () => {},
    unroute: async () => {
      closedUnrouteCalls++;
    },
    isClosed: () => true,
  } as any;
  const detachClosed = await attachMediaAbortRoute(mockClosedPage);
  await detachClosed();
  assert.equal(closedUnrouteCalls, 0, "unroute must be skipped when page.isClosed() is true");

  // Registration failure: non-fatal and safe to detach
  const failingPage = {
    route: async () => {
      throw new Error("Target page crashed");
    },
    unroute: async () => {
      assert.fail("unroute must not be called when registration failed");
    },
    isClosed: () => false,
  } as any;
  const detachFailed = await attachMediaAbortRoute(failingPage);
  await detachFailed();
});
