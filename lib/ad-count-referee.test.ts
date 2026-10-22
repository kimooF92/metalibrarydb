import test from "node:test";
import assert from "node:assert/strict";
import {
  detectAdCountDoubt,
  harvestAdCountCandidates,
  resolveAdCountWithSpanJev,
} from "./ad-count-referee";

test("harvestAdCountCandidates extracts counts with ~ and context", () => {
  const body = "TB SHOP\nPage ID: 183958198135625\nAds\nFilter: All Ads\n~209 results\nAd card 1";
  const candidates = harvestAdCountCandidates(body);

  assert.ok(candidates.length > 0);
  const tildeCandidate = candidates.find((c) => c.hasTilde);
  assert.ok(tildeCandidate);
  assert.equal(tildeCandidate.count, 209);
});

test("detectAdCountDoubt flags sudden spike of +20 or more ads (spike_20_plus)", () => {
  const doubt = detectAdCountDoubt({
    scannedCount: 35,
    previousCount: 10,
    hasTilde: true,
  });

  assert.equal(doubt.hasDoubt, true);
  assert.ok(doubt.doubtTypes.includes("spike_20_plus"));
  assert.ok(doubt.reasons[0].includes("+25 new ads"));
});

test("detectAdCountDoubt passes normal clean incremental changes (e.g. +3 ads)", () => {
  const doubt = detectAdCountDoubt({
    scannedCount: 15,
    previousCount: 12,
    hasTilde: true,
  });

  assert.equal(doubt.hasDoubt, false);
  assert.equal(doubt.reasons.length, 0);
});

test("detectAdCountDoubt flags sudden drop to 0 on active brand (drop_to_zero)", () => {
  const doubt = detectAdCountDoubt({
    scannedCount: 0,
    previousCount: 45,
    hasTilde: true,
  });

  assert.equal(doubt.hasDoubt, true);
  assert.ok(doubt.doubtTypes.includes("drop_to_zero"));
});

test("detectAdCountDoubt flags missing authentic Meta '~' prefix (missing_tilde)", () => {
  const doubt = detectAdCountDoubt({
    scannedCount: 18,
    previousCount: 15,
    hasTilde: false,
  });

  assert.equal(doubt.hasDoubt, true);
  assert.ok(doubt.doubtTypes.includes("missing_tilde"));
});

test("detectAdCountDoubt flags dramatic cliff drop >= 50% on high volume brand (cliff_drop)", () => {
  const doubt = detectAdCountDoubt({
    scannedCount: 12,
    previousCount: 80,
    hasTilde: true,
  });

  assert.equal(doubt.hasDoubt, true);
  assert.ok(doubt.doubtTypes.includes("cliff_drop"));
});

test("detectAdCountDoubt flags micro-brand explosive jumps (micro_explosion)", () => {
  const doubt = detectAdCountDoubt({
    scannedCount: 18,
    previousCount: 2,
    hasTilde: true,
  });

  assert.equal(doubt.hasDoubt, true);
  assert.ok(doubt.doubtTypes.includes("micro_explosion") || doubt.doubtTypes.includes("spike_20_plus"));
});

test("detectAdCountDoubt flags Meta search suggestion / fallback brand redirect (suggested_search)", () => {
  const doubt = detectAdCountDoubt({
    scannedCount: 15,
    previousCount: 15,
    hasTilde: true,
    bodyText: "Showing results for Nike instead (~1,500 results)",
  });

  assert.equal(doubt.hasDoubt, true);
  assert.ok(doubt.doubtTypes.includes("suggested_search"));
});

test("detectAdCountDoubt flags out-of-bounds anomaly (out_of_bounds)", () => {
  const doubt = detectAdCountDoubt({
    scannedCount: 183958198135625,
    hasTilde: false,
  });

  assert.equal(doubt.hasDoubt, true);
  assert.ok(doubt.doubtTypes.includes("out_of_bounds"));
});

test("resolveAdCountWithSpanJev fast paths clean scans without doubt ($0 tokens)", async () => {
  const result = await resolveAdCountWithSpanJev({
    scannedCount: 15,
    previousCount: 14,
    hasTilde: true,
  });

  assert.equal(result.wasRefereed, false);
  assert.equal(result.resolvedCount, 15);
  assert.equal(result.confidence, 1.0);
});

test("resolveAdCountWithSpanJev resolves single tilde candidate when multiple numbers exist", async () => {
  const result = await resolveAdCountWithSpanJev({
    scannedCount: 183958198135625,
    previousCount: 200,
    hasTilde: false,
    bodyText: "Page ID: 183958198135625\nAds\n~209 results",
  });

  assert.equal(result.wasRefereed, true);
  assert.equal(result.resolvedCount, 209);
});

test("harvestAdCountCandidates extracts and ranks multiple conflicting numbers correctly", () => {
  const bodyText = `
    Meta Ad Library
    Search: Brand TN
    Filters: Tunisia · All ads
    ~23 results for Brand TN
    Related Advertisers:
    ~185 results for Fashion
    10 ads per page
  `;

  const candidates = harvestAdCountCandidates(bodyText);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].hasTilde, true);
  assert.equal(candidates[1].hasTilde, true);
  assert.equal(candidates[2].hasTilde, false);

  const counts = candidates.map(c => c.count);
  assert.ok(counts.includes(23));
  assert.ok(counts.includes(185));
  assert.ok(counts.includes(10));
});

test("detectAdCountDoubt triggers multiple_candidates when DOM contains conflicting counts", () => {
  const bodyText = `
    Advertiser: Boro Shop
    ~16 résultats pour Boro Shop
    Recherche élargie : ~78 résultats
  `;

  const doubt = detectAdCountDoubt({
    scannedCount: 78,
    previousCount: 14,
    bodyText,
    brandName: "Boro Shop",
    hasTilde: true,
  });

  assert.equal(doubt.hasDoubt, true);
  assert.ok(doubt.doubtTypes.includes("multiple_candidates"));
  assert.ok(doubt.doubtTypes.includes("spike_20_plus"));
});

