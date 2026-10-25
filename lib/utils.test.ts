import test from "node:test";
import assert from "node:assert/strict";
import { stripEmojis } from "./utils";

test("stripEmojis removes common emojis, pictographs, and variation selectors", () => {
  const inputs = [
    { input: "🚨 Brand Went Dark: Nike", expected: "Brand Went Dark: Nike" },
    { input: "👑 Mega-Brand: Adidas (+5 Ads | 55 Total)", expected: "Mega-Brand: Adidas (+5 Ads | 55 Total)" },
    { input: "🚀 Ad Scaling Surge: +10 Ads on Puma!", expected: "Ad Scaling Surge: +10 Ads on Puma!" },
    { input: "⏸️ Account Hold Detected: Reebok", expected: "Account Hold Detected: Reebok" },
    { input: "🟢 Account Hold Lifted: Reebok", expected: "Account Hold Lifted: Reebok" },
    { input: "✨ Ingested 5 New Ad(s): Fila", expected: "Ingested 5 New Ad(s): Fila" },
    { input: "📦 Archived 3 Inactive Ad(s): Fila", expected: "Archived 3 Inactive Ad(s): Fila" },
    { input: "[Shard 1] 🏁 Scan Round Complete", expected: "[Shard 1] Scan Round Complete" },
    { input: "⚡ Apify Spy Sync (20 Brands)", expected: "Apify Spy Sync (20 Brands)" },
    { input: "🌐 Discovery Complete: 5 Brands in TN", expected: "Discovery Complete: 5 Brands in TN" },
    { input: "⚠️ 2 Facebook Pages Found", expected: "2 Facebook Pages Found" },
    { input: "🛑 Meta Ad Library Outage Guard Triggered", expected: "Meta Ad Library Outage Guard Triggered" },
    { input: "⏱️ Apify Polling Timeout", expected: "Apify Polling Timeout" },
    { input: "🛍️ +3 Products", expected: "+3 Products" },
    { input: "🔥 Hot creative", expected: "Hot creative" },
    { input: "Ingested 3 ads • ⚠️ 1 error(s)", expected: "Ingested 3 ads • 1 error(s)" },
  ];

  for (const { input, expected } of inputs) {
    assert.equal(stripEmojis(input), expected);
  }
});

test("stripEmojis handles empty and nullish inputs gracefully", () => {
  assert.equal(stripEmojis(""), "");
  assert.equal(stripEmojis(null), "");
  assert.equal(stripEmojis(undefined), "");
  assert.equal(stripEmojis("   "), "");
});
