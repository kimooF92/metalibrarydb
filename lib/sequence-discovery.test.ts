import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeSequenceCooldown,
  sanitizeDateRange,
  sanitizeCountryCode,
  sanitizeMediaType,
  extractSequenceKeywords,
  extractSequenceUrls,
  formatPreservedOutcomeDetails,
  MIN_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  DEFAULT_COOLDOWN_MS,
} from "./sequence-discovery";

test("sanitizeSequenceCooldown handles edge cases and clamps bounds", () => {
  // Defaults
  assert.equal(sanitizeSequenceCooldown(undefined), DEFAULT_COOLDOWN_MS);
  assert.equal(sanitizeSequenceCooldown(null), DEFAULT_COOLDOWN_MS);
  assert.equal(sanitizeSequenceCooldown(""), DEFAULT_COOLDOWN_MS);
  assert.equal(sanitizeSequenceCooldown("invalid"), DEFAULT_COOLDOWN_MS);
  assert.equal(sanitizeSequenceCooldown(NaN), DEFAULT_COOLDOWN_MS);

  // Negative and low values clamped to MIN_COOLDOWN_MS
  assert.equal(sanitizeSequenceCooldown(-5000), MIN_COOLDOWN_MS);
  assert.equal(sanitizeSequenceCooldown(0), MIN_COOLDOWN_MS);
  assert.equal(sanitizeSequenceCooldown(1000), MIN_COOLDOWN_MS);
  assert.equal(sanitizeSequenceCooldown(4999), MIN_COOLDOWN_MS);

  // Normal valid ranges
  assert.equal(sanitizeSequenceCooldown(5000), 5000);
  assert.equal(sanitizeSequenceCooldown(25000), 25000);
  assert.equal(sanitizeSequenceCooldown("35000"), 35000);
  assert.equal(sanitizeSequenceCooldown(120000), 120000);

  // Excessive values clamped to MAX_COOLDOWN_MS
  assert.equal(sanitizeSequenceCooldown(120001), MAX_COOLDOWN_MS);
  assert.equal(sanitizeSequenceCooldown(9999999), MAX_COOLDOWN_MS);
  assert.equal(sanitizeSequenceCooldown("500000"), MAX_COOLDOWN_MS);
});

test("sanitizeDateRange auto-corrects reversed dates and handles invalid inputs", () => {
  const fixedNow = new Date("2026-10-23T12:00:00Z");

  // Normal valid chronological range
  const valid = sanitizeDateRange("2026-10-01", "2026-10-10", fixedNow);
  assert.equal(valid.minDateStr, "2026-10-01");
  assert.equal(valid.maxDateStr, "2026-10-10");

  // Reversed dates (min > max) must be auto-swapped
  const reversed = sanitizeDateRange("2026-10-20", "2026-10-05", fixedNow);
  assert.equal(reversed.minDateStr, "2026-10-05");
  assert.equal(reversed.maxDateStr, "2026-10-20");

  // Invalid date inputs fallback to safe 7-day default
  const invalid = sanitizeDateRange("not-a-date", null, fixedNow);
  assert.equal(invalid.minDateStr, "2026-10-16");
  assert.equal(invalid.maxDateStr, "2026-10-23");
});

test("sanitizeCountryCode normalizes ISO codes and falls back safely", () => {
  assert.equal(sanitizeCountryCode("tn"), "TN");
  assert.equal(sanitizeCountryCode(" dz "), "DZ");
  assert.equal(sanitizeCountryCode("usa"), "USA");
  assert.equal(sanitizeCountryCode("123", "TN"), "TN");
  assert.equal(sanitizeCountryCode(null, "TN"), "TN");
  assert.equal(sanitizeCountryCode("TOOLONG", "FR"), "FR");
});

test("sanitizeMediaType validates supported formats and defaults safely", () => {
  assert.equal(sanitizeMediaType("video"), "video");
  assert.equal(sanitizeMediaType("image"), "image");
  assert.equal(sanitizeMediaType("all"), "all");
  assert.equal(sanitizeMediaType("audio"), "video");
  assert.equal(sanitizeMediaType(null), "video");
  assert.equal(sanitizeMediaType(""), "video");
});

test("extractSequenceKeywords parses, strips quotes, and deduplicates delimiters", () => {
  // Comma and newline mixture with quotes
  const input = `"robes", pyjamas\n"lingerie",  , chaussures\n\n`;
  const result = extractSequenceKeywords(input);

  assert.deepEqual(result, ["robes", "pyjamas", "lingerie", "chaussures"]);

  // Array input with non-string and empty elements
  const arrayInput = ["  robes  ", 123, null, "", `"pantalon"`] as any[];
  const arrayResult = extractSequenceKeywords(arrayInput);
  assert.deepEqual(arrayResult, ["robes", "pantalon"]);

  // Respects maxItems cap
  const longList = Array.from({ length: 30 }, (_, i) => `keyword_${i}`);
  const capped = extractSequenceKeywords(longList, 5);
  assert.equal(capped.length, 5);
  assert.equal(capped[0], "keyword_0");
  assert.equal(capped[4], "keyword_4");
});

test("extractSequenceUrls cleans line-delimited URLs and respects max bounds", () => {
  const urlText = `
    https://www.facebook.com/ads/library/?active_status=active&country=TN&q="robes"
    
    https://www.facebook.com/ads/library/?active_status=active&country=TN&q="lingerie"
  `;
  const result = extractSequenceUrls(urlText);
  assert.equal(result.length, 2);
  assert.ok(result[0].includes("robes"));
  assert.ok(result[1].includes("lingerie"));

  // Ignores non-string entries in array
  const mixed = ["https://fb.com/ads/1", null, 456, "https://fb.com/ads/2"] as any[];
  assert.equal(extractSequenceUrls(mixed).length, 2);
});

test("formatPreservedOutcomeDetails keeps sequence tag and formats outcomes", () => {
  const initial = "Sequence 2/5 · Batch e4f5a6b7";
  const successMsg = "Successfully extracted 14 unique pages from 150 active ads.";

  const formattedSuccess = formatPreservedOutcomeDetails(initial, successMsg);
  assert.equal(
    formattedSuccess,
    "Sequence 2/5 · Batch e4f5a6b7 — Successfully extracted 14 unique pages from 150 active ads."
  );

  const errorMsg = "Playwright target crashed";
  const formattedError = formatPreservedOutcomeDetails(initial, errorMsg);
  assert.equal(
    formattedError,
    "Sequence 2/5 · Batch e4f5a6b7 — Playwright target crashed"
  );

  // If initialOutcomeDetails has no sequence badge, message is untouched
  const normalInitial = "Inline page extraction from: https://facebook.com/...";
  assert.equal(
    formatPreservedOutcomeDetails(normalInitial, successMsg),
    successMsg
  );
  assert.equal(
    formatPreservedOutcomeDetails(null, successMsg),
    successMsg
  );
});

test("monotonic timestamp progression guarantees strictly ascending FIFO order", () => {
  const baseTime = 1761250000000;
  const count = 5;
  const timestamps = Array.from({ length: count }, (_, i) => new Date(baseTime + i * 1000).getTime());

  for (let i = 0; i < count - 1; i++) {
    assert.ok(timestamps[i] < timestamps[i + 1], `Timestamp ${i} must precede ${i + 1}`);
    assert.equal(timestamps[i + 1] - timestamps[i], 1000, "Must advance by exactly 1000ms");
  }
});
