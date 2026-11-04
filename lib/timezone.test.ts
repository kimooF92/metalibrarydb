import { describe, it } from "node:test";
import assert from "node:assert";
import { isValidIanaTimezone, resolveTimezone, getStartOfTodaySql } from "./timezone";

describe("Timezone Resolution & Utilities", () => {
  it("validates legitimate IANA timezones", () => {
    assert.strictEqual(isValidIanaTimezone("Africa/Tunis"), true);
    assert.strictEqual(isValidIanaTimezone("Europe/Paris"), true);
    assert.strictEqual(isValidIanaTimezone("UTC"), true);
    assert.strictEqual(isValidIanaTimezone("America/New_York"), true);
  });

  it("rejects invalid or dangerous timezone strings", () => {
    assert.strictEqual(isValidIanaTimezone(""), false);
    assert.strictEqual(isValidIanaTimezone("Invalid/Zone_Foo"), false);
    assert.strictEqual(isValidIanaTimezone("UTC; DROP TABLE products;--"), false);
    assert.strictEqual(isValidIanaTimezone("null"), false);
  });

  it("prioritizes valid client timezone", () => {
    const tz = resolveTimezone({
      clientTz: "Europe/Paris",
      countryCode: "TN",
    });
    assert.strictEqual(tz, "Europe/Paris");
  });

  it("falls back to workspace country code when client timezone is missing or invalid", () => {
    const tzTn = resolveTimezone({
      clientTz: "invalid",
      countryCode: "TN",
    });
    assert.strictEqual(tzTn, "Africa/Tunis");

    const tzMa = resolveTimezone({
      clientTz: null,
      countryCode: "MA",
    });
    assert.strictEqual(tzMa, "Africa/Casablanca");

    const tzDz = resolveTimezone({
      clientTz: undefined,
      countryCode: "dz",
    });
    assert.strictEqual(tzDz, "Africa/Algiers");
  });

  it("falls back to default Africa/Tunis when neither is provided", () => {
    const tz = resolveTimezone({});
    assert.strictEqual(tz, "Africa/Tunis");
  });

  it("generates SQL chunk without error", () => {
    const sqlChunk = getStartOfTodaySql("Africa/Tunis");
    assert.ok(sqlChunk);
  });
});

