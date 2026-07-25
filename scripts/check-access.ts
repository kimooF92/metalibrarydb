import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getBrowserSession, closeBrowserSession } from "../worker/browser";

const TEST_URL =
  process.argv[2] && process.argv[2].startsWith("http")
    ? process.argv[2]
    : "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=nike&search_type=keyword_exact_phrase";

async function checkAccess() {
  console.log("🔍 Meta Ad Library — Access Check");
  console.log("   URL:", TEST_URL);
  console.log("   Testing connection...\n");

  const { page } = await getBrowserSession();

  try {
    await page.goto(TEST_URL, { waitUntil: "networkidle", timeout: 30000 });
    const bodyText = await page.evaluate(() => document.body.innerText);

    const hasCaptcha =
      (await page.$('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha_dialog')) !== null ||
      /confirm it'?s you|security check|unusual activity/i.test(bodyText);

    const isRateLimited =
      /rate limit exceeded|too many requests|temporarily blocked/i.test(bodyText);

    const resultPattern = /[\d,~]+\s+(results?|ads?)/i;
    const hasResults = resultPattern.test(bodyText);

    if (hasResults) {
      console.log("✅ ACCESS OK — Meta Ad Library is responding normally.");
      console.log("   Result pattern found. Safe to start a scan session.");
    } else if (hasCaptcha) {
      console.log("⚠️  CAPTCHA DETECTED — Meta has flagged this session.");
      console.log("   Do not start a scan session. Wait and try again later.");
    } else if (isRateLimited) {
      console.log("🚫 RATE LIMITED — Too many requests from this IP/session.");
      console.log("   Wait at least 30 minutes before trying again.");
    } else {
      console.log("❓ UNCLEAR — Page loaded but no result pattern found.");
      console.log("   May be a layout change or geo-restriction. Check browser manually.");
    }
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      console.log("❌ TIMEOUT — Meta Ad Library did not respond in 30 seconds.");
      console.log("   Possible network block or ISP restriction.");
    } else {
      console.log("❌ ERROR —", err.message);
    }
  } finally {
    await closeBrowserSession();
  }
}

checkAccess().catch(console.error);
