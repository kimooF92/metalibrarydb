import { Page } from "playwright";
import { randomDelay, DELAY_CONFIG } from "./throttle";

export interface ScanOutcome {
  status: "success" | "failed" | "unclear";
  results: number | null;
  failureReason?:
    | "timeout"
    | "navigation_error"
    | "pattern_not_found"
    | "captcha"
    | "rate_limited";
  note?: string;
}

export async function scanMetaAdPage(
  page: Page,
  url: string
): Promise<ScanOutcome> {
  const timeoutMs = parseInt(process.env.PAGE_TIMEOUT || "30000", 10);

  try {
    // 1. Random pre-navigation delay
    await randomDelay(DELAY_CONFIG.beforeNavMin, DELAY_CONFIG.beforeNavMax);

    // 2. Navigate to target URL
    try {
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: timeoutMs,
      });
    } catch (navError: any) {
      if (navError.name === "TimeoutError") {
        return { status: "failed", results: null, failureReason: "timeout" };
      }
      return { status: "failed", results: null, failureReason: "navigation_error" };
    }

    // 3. Post-load delay
    await randomDelay(DELAY_CONFIG.afterLoadMin, DELAY_CONFIG.afterLoadMax);

    // 4. Check for body innerText and actual CAPTCHA / rate-limiting elements
    const bodyText = await page.evaluate(() => document.body.innerText);

    const hasCaptchaElement =
      (await page.$('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha_dialog')) !== null;
    const hasCaptchaText =
      /confirm it'?s you|security check|enter the code below|unusual activity|prouvez que vous êtes un humain/i.test(
        bodyText
      );

    if (hasCaptchaElement || hasCaptchaText) {
      return { status: "failed", results: null, failureReason: "captcha" };
    }

    if (
      /rate limit exceeded/i.test(bodyText) ||
      /too many requests/i.test(bodyText) ||
      /temporarily blocked/i.test(bodyText)
    ) {
      return { status: "failed", results: null, failureReason: "rate_limited" };
    }

    // 5. Pre-extraction delay
    await randomDelay(
      DELAY_CONFIG.beforeExtractMin,
      DELAY_CONFIG.beforeExtractMax
    );

    // 6. Extract result text using pattern matching (PRD §6)
    // Check explicit "0 ads" / "no results" patterns first (English, French, Spanish, German)
    const zeroAdRegex =
      /no\s+ads?\s+match|no\s+results?\s+found|no\s+active\s+ads|aucun\s+résultat|sin\s+resultados|keine\s+ergebnisse|there\s+are\s+no\s+ads|0\s+matching\s+ads|0\s+ads\s+match|aucun\s+résultat\s+ne\s+correspond|ningún\s+anuncio\s+coincide|keine\s+anzeigen\s+stimmen/i;

    if (
      zeroAdRegex.test(bodyText) ||
      /~\s?0\s+results/i.test(bodyText) ||
      /\b0\s+results\b/i.test(bodyText) ||
      /\b0\s+publicités\b/i.test(bodyText) ||
      /\b0\s+anuncios\b/i.test(bodyText)
    ) {
      return { status: "success", results: 0 };
    }

    // Pattern matching supporting English, French, Spanish, German result texts
    const multiLangRegex =
      /(\~?\s?\d[\d,\.\s\u00A0\u202F]*)\s*(?:results?|résultats?|resultados?|ergebnisse?|ads?|publicités?|anuncios?|anzeigen?)/i;

    const match = bodyText.match(multiLangRegex);

    if (match && match[1]) {
      // Clean string (remove '~', spaces, non-breaking spaces, commas, dots)
      const rawNumberStr = match[1]
        .replace(/[\~\s\u00A0\u202F]/g, "")
        .replace(/[,.]/g, "");

      const parsedNum = parseInt(rawNumberStr, 10);

      if (!isNaN(parsedNum)) {
        return { status: "success", results: parsedNum };
      }
    }

    // Secondary check: look for standalone number near result heading
    const secondaryMatch = bodyText.match(/(\d[\d,\.\s]*)\s+(?:active\s+)?(?:ads?|publicités?|anuncios?)/i);
    if (secondaryMatch && secondaryMatch[1]) {
      const parsedNum = parseInt(secondaryMatch[1].replace(/[\~\s\u00A0\u202F,.]/g, ""), 10);
      if (!isNaN(parsedNum)) {
        return { status: "success", results: parsedNum };
      }
    }

    // If pattern not found, return 'unclear' status rather than hard failure or false 0
    return {
      status: "unclear",
      results: null,
      failureReason: "pattern_not_found",
      note: "Visible result count pattern could not be found on page",
    };
  } catch (err: any) {
    console.error("Scan exception:", err);
    return { status: "failed", results: null, failureReason: "navigation_error" };
  }
}
