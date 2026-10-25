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
  profilePicUrl?: string | null;
}

export function parseResultCountFromText(bodyText: string): ScanOutcome {
  if (!bodyText) {
    return {
      status: "unclear",
      results: null,
      failureReason: "pattern_not_found",
      note: "Empty body text",
    };
  }

  const hasCaptchaText =
    /confirm it'?s you|security check|enter the code below|unusual activity|prouvez que vous êtes un humain/i.test(
      bodyText
    );

  if (hasCaptchaText) {
    return { status: "failed", results: null, failureReason: "captcha" };
  }

  if (
    /rate limit exceeded/i.test(bodyText) ||
    /too many requests/i.test(bodyText) ||
    /temporarily blocked/i.test(bodyText)
  ) {
    return { status: "failed", results: null, failureReason: "rate_limited" };
  }

  const zeroAdRegex =
    /no\s+ads?\s+match|no\s+results?\s+found|no\s+active\s+ads|ad\s+isn['’]?t\s+in\s+the\s+ad\s+library|ad\s+is\s+not\s+in\s+the\s+ad\s+library|aucun\s+résultat|sin\s+resultados|keine\s+ergebnisse|there\s+are\s+no\s+ads|0\s+matching\s+ads|0\s+ads\s+match|aucun\s+résultat\s+ne\s+correspond|ningún\s+anuncio\s+coincide|keine\s+anzeigen\s+stimmen|this\s+ad\s+has\s+expired|ad\s+not\s+found|ne\s+figure\s+pas\s+dans\s+la\s+bibliothèque|الإعلان\s+غير\s+موجود/i;

  if (
    zeroAdRegex.test(bodyText) ||
    /~\s?0\s+results/i.test(bodyText) ||
    /\b0\s+results\b/i.test(bodyText) ||
    /\b0\s+publicités\b/i.test(bodyText) ||
    /\b0\s+anuncios\b/i.test(bodyText)
  ) {
    return { status: "success", results: 0 };
  }

  // 1. Prioritize authentic Meta Ad Library result counts (always prefixed with '~')
  // e.g. "~209 results", "~190 résultats", "~381 resultados", "~1,200 ads"
  const tildeRegex =
    /~\s*(\d[\d,\.\s\u00A0\u202F]*)\s*(?:results?|résultats?|resultados?|ergebnisse?|ads?|publicités?|anuncios?|anzeigen?)/i;

  const tildeMatch = bodyText.match(tildeRegex);
  if (tildeMatch && tildeMatch[1]) {
    const rawNumberStr = tildeMatch[1]
      .replace(/[\s\u00A0\u202F]/g, "")
      .replace(/[,.]/g, "");

    const parsedNum = parseInt(rawNumberStr, 10);
    if (!isNaN(parsedNum)) {
      return { status: "success", results: parsedNum };
    }
  }

  // 2. Secondary fallback: matches without '~' only if no tilde count was found on page
  const fallbackRegex =
    /(\d[\d,\.\s\u00A0\u202F]*)\s*(?:results?|résultats?|resultados?|ergebnisse?)/i;

  const fallbackMatch = bodyText.match(fallbackRegex);
  if (fallbackMatch && fallbackMatch[1]) {
    const rawNumberStr = fallbackMatch[1]
      .replace(/[\s\u00A0\u202F]/g, "")
      .replace(/[,.]/g, "");

    const parsedNum = parseInt(rawNumberStr, 10);
    if (!isNaN(parsedNum)) {
      return { status: "success", results: parsedNum };
    }
  }

  // 3. Tertiary fallback: explicit "active ads" phrasing
  const secondaryMatch = bodyText.match(/(\d[\d,\.\s]*)\s+active\s+(?:ads?|publicités?|anuncios?)/i);
  if (secondaryMatch && secondaryMatch[1]) {
    const parsedNum = parseInt(secondaryMatch[1].replace(/[\s\u00A0\u202F,.]/g, ""), 10);
    if (!isNaN(parsedNum)) {
      return { status: "success", results: parsedNum };
    }
  }

  return {
    status: "unclear",
    results: null,
    failureReason: "pattern_not_found",
    note: "Visible result count pattern could not be found on page",
  };
}

export interface ScanPageOptions {
  previousCount?: number | null;
  brandName?: string | null;
}

export async function scanMetaAdPage(
  page: Page,
  url: string,
  onProgress?: (step: string, label: string, percent: number) => Promise<void> | void,
  options?: ScanPageOptions
): Promise<ScanOutcome> {
  const timeoutMs = parseInt(process.env.PAGE_TIMEOUT || "30000", 10);

  try {
    // Media blocking guard: abort images, audio, video, web fonts to radically minimize memory footprint
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "imageset"].includes(type)) {
        return route.abort();
      }
      return route.continue();
    }).catch(() => {});

    if (onProgress) await onProgress("navigating", "1. Navigating to Meta Ad Library...", 20);
    await randomDelay(DELAY_CONFIG.beforeNavMin, DELAY_CONFIG.beforeNavMax);

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
    } catch (navError: any) {
      if (navError.name === "TimeoutError") {
        return { status: "failed", results: null, failureReason: "timeout" };
      }
      return { status: "failed", results: null, failureReason: "navigation_error" };
    }

    if (onProgress) await onProgress("settling", "2. Waiting for DOM settle...", 50);

    // Fast-settle: Wait for either the count pattern to render or fallback delay (max 8s)
    try {
      await page.waitForFunction(
        () => {
          const text = document.body?.innerText || "";
          return (
            /~\s*\d+/i.test(text) ||
            /\b\d+\s+results\b/i.test(text) ||
            /no\s+ads?\s+match|no\s+results?\s+found|0\s+matching\s+ads|0\s+results/i.test(text) ||
            /confirm it'?s you|security check|unusual activity/i.test(text) ||
            /rate limit exceeded|too many requests/i.test(text)
          );
        },
        null,
        { timeout: 8000 }
      );
    } catch {
      await randomDelay(DELAY_CONFIG.afterLoadMin, DELAY_CONFIG.afterLoadMax);
    }

    const bodyText = await page.evaluate(() => document.body.innerText);

    const hasCaptchaElement =
      (await page.$('iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha_dialog')) !== null;

    if (hasCaptchaElement) {
      return { status: "failed", results: null, failureReason: "captcha" };
    }

    if (onProgress) await onProgress("extracting", "3. Extracting active ad cards...", 75);
    await randomDelay(
      DELAY_CONFIG.beforeExtractMin,
      DELAY_CONFIG.beforeExtractMax
    );

    const rawOutcome = parseResultCountFromText(bodyText);

    // Extract Meta profile picture / avatar from Meta Ad Library header or ad cards
    let extractedProfilePicUrl: string | null = null;
    try {
      extractedProfilePicUrl = await page.evaluate(() => {
        // 1. Check DOM img elements for Meta avatar / profile picture patterns
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
        for (const img of imgs) {
          const src = img.getAttribute("src") || img.src || "";
          if (
            src.includes("fbcdn.net") &&
            (src.includes("30808-1") ||
              src.includes("18169-1") ||
              src.includes("p148x148") ||
              src.includes("p100x100") ||
              src.includes("p50x50") ||
              src.includes("p60x60") ||
              src.includes("s148x148"))
          ) {
            return src;
          }
        }

        // 2. Scan inline JSON script blocks for page profile picture URLs
        const scripts = Array.from(document.querySelectorAll("script:not([src])"));
        for (const s of scripts) {
          const text = s.textContent || "";
          if (text.includes("profile_picture") || text.includes("page_profile_picture_url")) {
            const match = text.match(/"(?:page_profile_picture_url|profile_picture_url|pageProfilePictureUrl)":\s*"([^"]+)"/i);
            if (match && match[1]) {
              const unescaped = match[1].replace(/\\\//g, "/");
              if (unescaped.startsWith("http") && unescaped.includes("fbcdn.net")) {
                return unescaped;
              }
            }
          }
        }

        // 3. Fallback: check any fbcdn image with dst-jpg
        for (const img of imgs) {
          const src = img.getAttribute("src") || img.src || "";
          if (src.includes("fbcdn.net") && !src.includes("static.xx") && !src.includes("rsrc.php") && src.includes("dst-jpg")) {
            return src;
          }
        }

        return null;
      });
    } catch {}

    if (extractedProfilePicUrl) {
      rawOutcome.profilePicUrl = extractedProfilePicUrl;
    }

    // If result was parsed successfully and previous count is known, check for ambiguity / spikes (+20 ads)
    if (rawOutcome.status === "success" && options?.previousCount !== undefined && options.previousCount !== null) {
      try {
        const { detectAdCountDoubt, resolveAdCountWithSpanJev } = await import("../lib/ad-count-referee");
        const doubt = detectAdCountDoubt({
          scannedCount: rawOutcome.results,
          previousCount: options.previousCount,
          bodyText,
          brandName: options.brandName,
          url,
          hasTilde: bodyText.includes(`~${rawOutcome.results}`) || bodyText.includes(`~ ${rawOutcome.results}`),
        });

        if (doubt.hasDoubt) {
          if (onProgress) await onProgress("refereeing", "3b. Arbitrating ambiguous ad count with Span/Jev...", 85);
          const refereeResult = await resolveAdCountWithSpanJev({
            scannedCount: rawOutcome.results,
            previousCount: options.previousCount,
            bodyText,
            brandName: options.brandName,
            url,
            hasTilde: bodyText.includes(`~${rawOutcome.results}`) || bodyText.includes(`~ ${rawOutcome.results}`),
          });

          if (refereeResult.wasRefereed && refereeResult.resolvedCount !== null) {
            console.log(
              `[Ad Count Referee] ⚖️ Ambiguity resolved by ${refereeResult.modelUsed}: ${rawOutcome.results} ➔ ${refereeResult.resolvedCount} (Confidence: ${refereeResult.confidence}, Reasons: ${refereeResult.doubtReasons.join("; ")})`
            );
            return {
              status: "success",
              results: refereeResult.resolvedCount,
              note: `Refereed by ${refereeResult.modelUsed}: ${refereeResult.doubtReasons.join("; ")}`,
              profilePicUrl: extractedProfilePicUrl,
            };
          }
        }
      } catch (refErr: any) {
        console.warn("[Ad Count Referee] Notice:", refErr?.message || refErr);
      }
    }

    return rawOutcome;
  } catch (err: any) {
    console.error("Scan exception:", err);
    return { status: "failed", results: null, failureReason: "navigation_error" };
  }
}
