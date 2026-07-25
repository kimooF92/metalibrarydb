import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getBrowserSession, closeBrowserSession } from "../worker/browser";

export type AccessCheckResult =
  | "WORKING_NORMALLY"
  | "CAPTCHA_CHALLENGE_PRESENT"
  | "NETWORK_BLOCK_OR_TIMEOUT"
  | "REGIONAL_GATING";

export async function checkMetaAdLibraryAccess(
  testUrl = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL"
): Promise<{ status: AccessCheckResult; message: string }> {
  console.log("==========================================");
  console.log(" Meta Ad Library — Network Access Check  ");
  console.log("==========================================");

  let page;
  try {
    const session = await getBrowserSession();
    page = session.page;

    console.log(`[Check] Navigating to: ${testUrl}`);
    await page.goto(testUrl, { waitUntil: "networkidle", timeout: 25000 });

    const content = await page.content();
    const bodyText = await page.evaluate(() => document.body.innerText);

    // 1. Check CAPTCHA / Challenge
    if (
      content.includes("captcha") ||
      content.includes("security_check") ||
      bodyText.includes("Confirm it's you") ||
      bodyText.includes("Enter the code")
    ) {
      console.warn("❌ [CAPTCHA Detected] Security challenge active. Do not start scan session.");
      return {
        status: "CAPTCHA_CHALLENGE_PRESENT",
        message: "CAPTCHA or security challenge detected on Meta Ad Library.",
      };
    }

    // 2. Check Regional Gating
    if (
      bodyText.includes("not available in your region") ||
      bodyText.includes("restricted in your country")
    ) {
      console.warn("⚠️ [Regional Gating] Ad Library is legally gated in current IP location.");
      return {
        status: "REGIONAL_GATING",
        message: "Meta Ad Library reports regional/location gating.",
      };
    }

    // 3. Check Result pattern or Ad Library UI header
    if (
      /results?/i.test(bodyText) ||
      /Ad Library/i.test(bodyText) ||
      /Search ads/i.test(bodyText)
    ) {
      console.log("✅ [Access Normal] Meta Ad Library is reachable and loaded successfully.");
      return {
        status: "WORKING_NORMALLY",
        message: "Meta Ad Library is reachable and operating normally.",
      };
    }

    console.warn("⚠️ [Pattern Missing] Page loaded but unexpected content layout.");
    return {
      status: "CAPTCHA_CHALLENGE_PRESENT",
      message: "Page loaded but Ad Library elements were not recognized.",
    };
  } catch (err: any) {
    console.error("❌ [Network Error/Timeout]", err.message);
    return {
      status: "NETWORK_BLOCK_OR_TIMEOUT",
      message: `Network error or timeout: ${err.message}`,
    };
  } finally {
    await closeBrowserSession();
  }
}

// Execute directly if run via CLI
if (require.main === module) {
  checkMetaAdLibraryAccess().then((res) => {
    console.log("Access Check Result:", res);
    process.exit(res.status === "WORKING_NORMALLY" ? 0 : 1);
  });
}
