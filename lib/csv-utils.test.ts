import test from "node:test";
import assert from "node:assert/strict";
import { formatCsvCell, serializeToCsv } from "./csv-utils";

test("CSV Utilities & CWE-1236 Sanitization Suite", async (t) => {
  await t.test("formatCsvCell handles null and undefined gracefully", () => {
    assert.strictEqual(formatCsvCell(null), "");
    assert.strictEqual(formatCsvCell(undefined), "");
  });

  await t.test("formatCsvCell formats booleans accurately", () => {
    assert.strictEqual(formatCsvCell(true), "true");
    assert.strictEqual(formatCsvCell(false), "false");
  });

  await t.test("formatCsvCell preserves numbers and negative deltas without single-quote prefix", () => {
    assert.strictEqual(formatCsvCell(0), "0");
    assert.strictEqual(formatCsvCell(42), "42");
    assert.strictEqual(formatCsvCell(99.99), "99.99");
    // Critical: Negative numbers must NOT be sanitized as formulas
    assert.strictEqual(formatCsvCell(-5), "-5");
    assert.strictEqual(formatCsvCell(-12.5), "-12.5");
    assert.strictEqual(formatCsvCell(Number.NaN), "");
    assert.strictEqual(formatCsvCell(Infinity), "");
  });

  await t.test("formatCsvCell formats dates as ISO strings", () => {
    const d = new Date("2026-10-24T12:00:00.000Z");
    assert.strictEqual(formatCsvCell(d), "2026-10-24T12:00:00.000Z");
  });

  await t.test("formatCsvCell neutralizes formula injection on strings (CWE-1236)", () => {
    // Formulas starting with =, +, -, @, tab, carriage return
    assert.strictEqual(formatCsvCell("=cmd|' /C calc'!A0"), "\"'=cmd|' /C calc'!A0\"");
    assert.strictEqual(formatCsvCell("@SUM(A1:A10)"), "\"'@SUM(A1:A10)\"");
    assert.strictEqual(formatCsvCell("+123456"), "\"'+123456\"");
    assert.strictEqual(formatCsvCell("-calc"), "\"'-calc\"");
    assert.strictEqual(formatCsvCell("\t=malicious"), "\"'\t=malicious\"");
    // Leading whitespace before dangerous formula character
    assert.strictEqual(formatCsvCell("   =AVERAGE(B1:B2)"), "\"'   =AVERAGE(B1:B2)\"");
  });

  await t.test("formatCsvCell implements RFC 4180 escaping for quotes, commas, and newlines", () => {
    assert.strictEqual(formatCsvCell("Simple Text"), "Simple Text");
    assert.strictEqual(formatCsvCell("Hello, World"), "\"Hello, World\"");
    assert.strictEqual(formatCsvCell('15" Laptop Display'), '"15"" Laptop Display"');
    assert.strictEqual(formatCsvCell("Line 1\nLine 2"), "\"Line 1\nLine 2\"");
    assert.strictEqual(formatCsvCell("Line 1\r\nLine 2"), "\"Line 1\r\nLine 2\"");
  });

  await t.test("formatCsvCell handles Arabic Darija and UTF-8 characters", () => {
    const arabicTitle = "باك 3 قمصان قطنية - توصيل مجاني لكامل تراب الجمهورية";
    assert.strictEqual(formatCsvCell(arabicTitle), arabicTitle);
  });

  await t.test("serializeToCsv prepends UTF-8 BOM and formats headers and rows", () => {
    const headers = ["Brand", "Current Ads", "7d Delta", "Active"];
    const rows = [
      ["Zara TN", 35, 5, true],
      ["Pull & Bear, Sousse", 18, -3, false],
      ["=Dangerous Brand", 10, -1, true],
    ];

    const csv = serializeToCsv(headers, rows);

    // Verify BOM
    assert.ok(csv.startsWith("\uFEFF"), "CSV must start with UTF-8 BOM");

    const raw = csv.slice(1); // Strip BOM
    const lines = raw.split("\r\n");

    assert.strictEqual(lines.length, 4);
    assert.strictEqual(lines[0], "Brand,Current Ads,7d Delta,Active");
    assert.strictEqual(lines[1], "Zara TN,35,5,true");
    assert.strictEqual(lines[2], '"Pull & Bear, Sousse",18,-3,false');
    assert.strictEqual(lines[3], '"\'=Dangerous Brand",10,-1,true');
  });

  await t.test("serializeToCsv handles empty dataset (headers only)", () => {
    const headers = ["id", "title", "price"];
    const csv = serializeToCsv(headers, []);
    assert.ok(csv.startsWith("\uFEFF"));
    const raw = csv.slice(1);
    assert.strictEqual(raw, "id,title,price");
  });
});
