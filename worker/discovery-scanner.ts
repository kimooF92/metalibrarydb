import { Page, Response } from "playwright";
import { db } from "../db";
import { discoveryRuns, discoveredPages, trackedPages } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { resolveDestinationUrl } from "../lib/utils";

export interface DiscoveredPageData {
  pageId: string;
  displayName: string | null;
  matchingAdCount: number;
  sampleAdArchiveIds: Set<string>;
  sampleCtas: Set<string>;
  sampleUrls: Set<string>;
}

export interface DiscoveryScanOutcome {
  status: "completed" | "partial" | "failed";
  totalAdsScanned: number;
  totalPagesDiscovered: number;
  failureReason?: "captcha" | "rate_limited" | "payload_not_found" | "timeout";
  outcomeDetails?: string;
}

// Configurable Constants
const TARGET_MAX_ADS = parseInt(process.env.DISCOVERY_MAX_ADS || "2500", 10);
const MAX_SCROLL_ATTEMPTS = parseInt(process.env.DISCOVERY_MAX_SCROLL_ATTEMPTS || "150", 10);
const STAGE_SCROLL_COUNT = 40;
const STAGE_COOLDOWN_MS = 12000;
const NO_PROGRESS_CAP = parseInt(process.env.DISCOVERY_NO_PROGRESS_CAP || "8", 10);
const SCROLL_WAIT_MS = parseInt(process.env.DISCOVERY_SCROLL_WAIT_MS || "3000", 10);
const RESPONSE_TIMEOUT_MS = parseInt(process.env.PAGE_TIMEOUT || "45000", 10);

// CTA Match Lists
const ALLOWED_CTA_ENUMS = new Set([
  "SHOP_NOW",
  "ORDER_NOW",
  "BUY_NOW",
  "GET_OFFER",
  "SHOP",
  "BUY_TICKETS",
  "PURCHASE",
]);

const DISALLOWED_CTA_ENUMS = new Set([
  "INSTALL_MOBILE_APP",
  "INSTALL_APP",
  "USE_APP",
  "LIKE_PAGE",
  "VISIT_PAGE",
  "LEARN_MORE",
  "SIGN_UP",
  "CONTACT_US",
  "CALL_NOW",
  "SEND_MESSAGE",
  "SEND_WHATSAPP_MESSAGE",
  "PLAY_GAME",
  "LISTEN_NOW",
  "SUBSCRIBE",
  "APPLY_NOW",
  "BOOK_NOW",
]);

const ALLOWED_CTA_REGEX =
  /shop now|order now|buy now|get offer|acheter|commander|commandez|profiter de l'offre|تسوق الآن|تسوق الان|اطلب الآن|اطلب الان|احصل على العرض|شراء الآن|شراء الان/i;

const DISALLOWED_CTA_REGEX =
  /install|visit page|like page|learn more|sign up|contact us|call now|send message|en savoir plus|visiter la page|aimer la page|تعلم المزيد|زيارة الصفحة|إعجاب بالصفحة|اعجاب بالصفحة|تحميل/i;

/**
 * Validates whether an ad node matches the required e-commerce CTAs (Shop Now / Order Now).
 */
function isMatchingEcommerceCta(ctaTypeRaw?: string | null, ctaTextRaw?: string | null): boolean {
  const ctaType = (ctaTypeRaw || "").toUpperCase().trim();
  const ctaText = (ctaTextRaw || "").trim();

  // 1. Explicit Enum Check
  if (ctaType && DISALLOWED_CTA_ENUMS.has(ctaType)) return false;
  if (ctaType && ALLOWED_CTA_ENUMS.has(ctaType)) return true;

  // 2. Text Regex Check
  if (ctaText) {
    if (DISALLOWED_CTA_REGEX.test(ctaText)) return false;
    if (ALLOWED_CTA_REGEX.test(ctaText)) return true;
  }

  // Default: if no CTA text or type matched allowed list, exclude
  return false;
}

/**
 * Extracts page info and CTA data from Meta GraphQL payload node
 */
/**
 * Extracts page info and CTA data from Meta GraphQL payload node
 */
function parseDiscoveryGraphQLNode(
  node: any,
  collectedPages: Map<string, DiscoveredPageData>,
  scannedAdIds: Set<string>,
  canonicalPageIds: Set<string>
) {
  try {
    const targetNode = node.node || node;
    const adArchiveId = String(
      targetNode.adArchiveID || targetNode.ad_archive_id || targetNode.id || targetNode.adArchiveId || ""
    );
    if (!adArchiveId || scannedAdIds.has(adArchiveId)) return;
    scannedAdIds.add(adArchiveId);

    const snapshot = targetNode.snapshot || targetNode;
    const rawPageId = String(
      targetNode.pageID ||
      targetNode.page_id ||
      snapshot.page_id ||
      snapshot.pageID ||
      snapshot.publisher_page_id ||
      ""
    );
    if (!rawPageId || rawPageId === "0") return;

    const pageName =
      targetNode.pageName ||
      targetNode.page_name ||
      snapshot.pageName ||
      snapshot.page_name ||
      targetNode.publisherPlatformPageName ||
      null;

    const ctaType = snapshot.cta_type || snapshot.cta_text || null;
    const ctaText = snapshot.action_link_title || snapshot.cta_text || snapshot.cta_type || null;

    if (!isMatchingEcommerceCta(ctaType, ctaText)) return;

    const rawLinkUrl =
      snapshot.link_url ||
      snapshot.ad_creative_link_url ||
      (Array.isArray(snapshot.cards) ? snapshot.cards[0]?.link_url : null) ||
      null;
    const linkUrl = resolveDestinationUrl(rawLinkUrl);

    // Always use the authentic Page ID from the ad node
    const targetPageId = rawPageId;

    let pageRecord = collectedPages.get(targetPageId);
    if (!pageRecord) {
      pageRecord = {
        pageId: targetPageId,
        displayName: pageName ? String(pageName) : null,
        matchingAdCount: 0,
        sampleAdArchiveIds: new Set(),
        sampleCtas: new Set(),
        sampleUrls: new Set(),
      };
      collectedPages.set(targetPageId, pageRecord);
    }

    if (!pageRecord.displayName && pageName) {
      pageRecord.displayName = String(pageName);
    }

    // Only increment count if it wasn't pre-populated from dynamic_filter_options
    if (canonicalPageIds.size === 0 || !canonicalPageIds.has(targetPageId)) {
      pageRecord.matchingAdCount++;
    }

    if (adArchiveId && pageRecord.sampleAdArchiveIds.size < 5) {
      pageRecord.sampleAdArchiveIds.add(adArchiveId);
    }
    if (ctaText && pageRecord.sampleCtas.size < 5) {
      pageRecord.sampleCtas.add(String(ctaText));
    }
    if (linkUrl && pageRecord.sampleUrls.size < 5) {
      pageRecord.sampleUrls.add(linkUrl);
    }
  } catch {
    // Ignore payload parse errors
  }
}

/**
 * Traverses JSON object recursively to find ad array nodes
 */
function extractDiscoveryFromJSON(
  obj: any,
  collectedPages: Map<string, DiscoveredPageData>,
  scannedAdIds: Set<string>,
  canonicalPageIds: Set<string>
) {
  if (!obj || typeof obj !== "object") return;

  // Parse authoritative Canonical Page IDs from Meta's dynamic filter options first
  if (obj.dynamic_filter_options?.pages && Array.isArray(obj.dynamic_filter_options.pages)) {
    for (const pOpt of obj.dynamic_filter_options.pages) {
      const pageId = String(pOpt.key || pOpt.page_id || "");
      const displayName = pOpt.display_name || pOpt.name || null;
      const count = typeof pOpt.count === "number" ? pOpt.count : 0;

      if (pageId && pageId !== "0") {
        canonicalPageIds.add(pageId);
        let pageRecord = collectedPages.get(pageId);
        if (!pageRecord) {
          pageRecord = {
            pageId,
            displayName: displayName ? String(displayName) : null,
            matchingAdCount: count,
            sampleAdArchiveIds: new Set(),
            sampleCtas: new Set(["Shop Now"]),
            sampleUrls: new Set(),
          };
          collectedPages.set(pageId, pageRecord);
        } else {
          if (!pageRecord.displayName && displayName) pageRecord.displayName = String(displayName);
          if (count > pageRecord.matchingAdCount) pageRecord.matchingAdCount = count;
        }
      }
    }
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === "object" && (item.adArchiveID || item.ad_archive_id || item.snapshot)) {
        parseDiscoveryGraphQLNode(item, collectedPages, scannedAdIds, canonicalPageIds);
      } else {
        extractDiscoveryFromJSON(item, collectedPages, scannedAdIds, canonicalPageIds);
      }
    }
    return;
  }

  if (obj.ad_archive_nodes || obj.results || obj.edges || obj.ads) {
    const list = obj.ad_archive_nodes || obj.results || obj.edges || obj.ads;
    if (Array.isArray(list)) {
      for (const item of list) {
        const targetNode = item.node || item;
        parseDiscoveryGraphQLNode(targetNode, collectedPages, scannedAdIds, canonicalPageIds);
      }
    }
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "object") {
      extractDiscoveryFromJSON(obj[key], collectedPages, scannedAdIds, canonicalPageIds);
    }
  }
}

/**
 * Main Discovery Scanner: Multi-stage deep scroll & page extraction
 */
export async function runDiscoveryScan(
  page: Page,
  runId: string,
  targetUrl: string,
  country: string = "TN"
): Promise<DiscoveryScanOutcome> {
  const collectedPages = new Map<string, DiscoveredPageData>();
  const canonicalPageIds = new Set<string>();
  const scannedAdIds = new Set<string>();
  let hasCaptchaOrBlock = false;
  let isRateLimited = false;
  let graphqlResponseReceived = false;

  const handleResponse = async (response: Response) => {
    try {
      const url = response.url();
      if (!url.includes("/api/graphql/") && !url.includes("graphql")) return;

      if (response.status() === 429) {
        isRateLimited = true;
        return;
      }
      if (response.status() !== 200) return;

      let text = await response.text();
      text = text.replace(/^\s*for\s*\(\s*;\s*;\s*\)\s*;\s*/i, "").trim();

      const parseAndExtract = (jsonObj: any) => {
        if (jsonObj.errors && Array.isArray(jsonObj.errors)) {
          const hasSecurityErr = jsonObj.errors.some((e: any) =>
            /captcha|security check|unusual activity/i.test(e.message || "")
          );
          if (hasSecurityErr) {
            hasCaptchaOrBlock = true;
            return;
          }
        }
        extractDiscoveryFromJSON(jsonObj, collectedPages, scannedAdIds, canonicalPageIds);
        graphqlResponseReceived = true;
      };

      try {
        const json = JSON.parse(text);
        parseAndExtract(json);
      } catch {
        const lines = text.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            parseAndExtract(json);
          } catch {
            // ignore non-JSON chunk
          }
        }
      }
    } catch {
      // Stream error ignore
    }
  };

  page.on("response", handleResponse);

  try {
    // 1. Update run status to running
    const now = new Date();
    await db
      .update(discoveryRuns)
      .set({ status: "running", startedAt: now })
      .where(eq(discoveryRuns.id, runId));

    let cleanTargetUrl = targetUrl;
    try {
      // Prevent double encoding of zero-width joiner query parameter
      cleanTargetUrl = targetUrl.replace(/q=%E2%80%8D/gi, "q=" + encodeURIComponent("\u200D"));
    } catch {}

    console.log(`[Discovery Scanner] Navigating to broad search URL: ${cleanTargetUrl}`);

    await page.goto(cleanTargetUrl, {
      waitUntil: "networkidle",
      timeout: RESPONSE_TIMEOUT_MS,
    });

    // 15-second Initial Rendering Pause: Meta zero-width joiner & multi-filter search queries take 10-15s for backend response streaming
    console.log(`[Discovery Scanner] Waiting 15s for Meta's complex search query engine to stream initial GraphQL ad feed...`);
    const initialWaitStart = Date.now();
    while (scannedAdIds.size === 0 && Date.now() - initialWaitStart < 15000) {
      await page.waitForTimeout(1000);
    }
    console.log(`[Discovery Scanner] Initial stream wait complete. Captured ${scannedAdIds.size} ads so far.`);

    // Check for CAPTCHA
    const isRealCaptcha = await page.evaluate(() => {
      const bodyText = document.body?.innerText || "";
      const hasCaptchaIframe = !!document.querySelector(
        'iframe[src*="captcha"], iframe[src*="recaptcha"], #captcha_dialog'
      );
      const hasChallengeHeading =
        /security check|confirm it'?s you|unusual activity/i.test(document.title || "") ||
        (/security check|confirm it'?s you/i.test(bodyText) && !bodyText.includes("Ad Library"));

      return hasCaptchaIframe || hasChallengeHeading;
    });

    if (isRealCaptcha) {
      await db
        .update(discoveryRuns)
        .set({
          status: "failed",
          failureReason: "captcha",
          outcomeDetails: "CAPTCHA challenge detected on navigation",
          finishedAt: new Date(),
        })
        .where(eq(discoveryRuns.id, runId));

      return {
        status: "failed",
        totalAdsScanned: 0,
        totalPagesDiscovered: 0,
        failureReason: "captcha",
        outcomeDetails: "CAPTCHA challenge detected on navigation",
      };
    }

    // 2. Multi-Stage Deep Scroll Loop
    let lastAdCount = scannedAdIds.size;
    let noProgressCount = 0;

    for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
      if (hasCaptchaOrBlock || isRateLimited) break;
      if (scannedAdIds.size >= TARGET_MAX_ADS) {
        console.log(`[Discovery Scanner] Reached target ad capacity (${scannedAdIds.size}/${TARGET_MAX_ADS} ads). Ending scan.`);
        break;
      }

      graphqlResponseReceived = false;

      // Scroll container + window
      await page.evaluate(() => {
        const feedContainer =
          document.querySelector('div[role="feed"]') ||
          Array.from(document.querySelectorAll("div")).find((div) => {
            const style = window.getComputedStyle(div);
            return (
              (style.overflowY === "auto" || style.overflowY === "scroll") &&
              div.scrollHeight > div.clientHeight + 200
            );
          });

        if (feedContainer) {
          feedContainer.scrollBy(0, 1800);
          feedContainer.scrollTop = feedContainer.scrollHeight;
        }

        window.scrollBy(0, 1800);
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Adaptive response wait
      const waitStart = Date.now();
      while (!graphqlResponseReceived && Date.now() - waitStart < SCROLL_WAIT_MS) {
        await page.waitForTimeout(300);
      }

      // Check progress
      const currentAdCount = scannedAdIds.size;
      if (currentAdCount === lastAdCount) {
        noProgressCount++;
        if (noProgressCount >= NO_PROGRESS_CAP) {
          console.log(`[Discovery Scanner] No new ads for ${noProgressCount} consecutive scrolls. Reached feed end.`);
          break;
        }
      } else {
        noProgressCount = 0;
        lastAdCount = currentAdCount;
      }

      // Anti-Detection Cooldown Pause every STAGE_SCROLL_COUNT iterations
      if ((i + 1) % STAGE_SCROLL_COUNT === 0 && i < MAX_SCROLL_ATTEMPTS - 1) {
        console.log(
          `[Discovery Scanner] Completed scroll stage (${i + 1}/${MAX_SCROLL_ATTEMPTS}). Pausing ${
            STAGE_COOLDOWN_MS / 1000
          }s for anti-detection cooldown... (Discovered: ${collectedPages.size} pages from ${scannedAdIds.size} ads)`
        );
        await page.waitForTimeout(STAGE_COOLDOWN_MS);
      }
    }

    if (isRateLimited) {
      console.warn("[Discovery Scanner] Rate limit 429 detected during deep scroll.");
    }

    // DOM Diagnostic Report when 0 ads are captured
    if (scannedAdIds.size === 0) {
      try {
        const domDiagnostic = await page.evaluate(() => {
          const title = document.title || "";
          const url = document.location.href || "";
          const bodyText = (document.body?.innerText || "").slice(0, 1500);

          const headings = Array.from(document.querySelectorAll("h1, h2, h3, div[role='heading']"))
            .map((h) => h.textContent?.trim())
            .filter(Boolean)
            .slice(0, 10);

          const feedElement = !!document.querySelector('div[role="feed"]');
          const adLinksCount = document.querySelectorAll('a[href*="id="], a[href*="view_all_page_id="]').length;
          const filterPills = Array.from(document.querySelectorAll('div[role="button"], span, button'))
            .map((el) => el.textContent?.trim())
            .filter(
              (t) =>
                t &&
                (t.includes("Language") ||
                  t.includes("Platform") ||
                  t.includes("Country") ||
                  t.includes("Media") ||
                  t.includes("Arabic") ||
                  t.includes("Tunisia") ||
                  t.includes("Video"))
            )
            .slice(0, 10);

          return {
            title,
            url,
            feedElement,
            adLinksCount,
            headings,
            filterPills,
            bodySnippet: bodyText.replace(/\s+/g, " ").slice(0, 500),
          };
        });

        console.log("==================================================");
        console.log("[DOM DIAGNOSTIC REPORT] 0 Ads Captured. DOM Snapshot:");
        console.log(` - Page Title: ${domDiagnostic.title}`);
        console.log(` - Current URL: ${domDiagnostic.url}`);
        console.log(` - Feed Container Found: ${domDiagnostic.feedElement}`);
        console.log(` - Ad / Page Links Count: ${domDiagnostic.adLinksCount}`);
        console.log(` - Visible Headings: ${JSON.stringify(domDiagnostic.headings)}`);
        console.log(` - Filter Pills Rendered: ${JSON.stringify(domDiagnostic.filterPills)}`);
        console.log(` - Body Text Snippet: "${domDiagnostic.bodySnippet}"`);
        console.log("==================================================");
      } catch (domDiagErr) {
        console.warn("[DOM DIAGNOSTIC] Failed to extract DOM report:", domDiagErr);
      }
    }

    // 3. Fallback: Extract DOM links ONLY if GraphQL payload capture was blocked and zero pages were collected
    if (collectedPages.size === 0) {
      try {
        const domPageLinks = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href*="view_all_page_id="]'));
          return links.map((link) => {
            const href = (link as HTMLAnchorElement).href;
            const match = href.match(/view_all_page_id=(\d+)/);
            const pageId = match ? match[1] : null;
            const pageName = link.textContent?.trim() || null;
            return { pageId, pageName };
          });
        });

        for (const item of domPageLinks) {
          if (item.pageId && !collectedPages.has(item.pageId)) {
            collectedPages.set(item.pageId, {
              pageId: item.pageId,
              displayName: item.pageName,
              matchingAdCount: 1,
              sampleAdArchiveIds: new Set(),
              sampleCtas: new Set(["Shop Now"]),
              sampleUrls: new Set(),
            });
          }
        }
      } catch {
        // DOM link extraction fallback error ignore
      }
    }

    // 4. Save Discovered Pages to Database (Cross-Scan Memory: check tracked & previously ignored pages)
    const finishedAt = new Date();
    const existingTracked = await db.query.trackedPages.findMany({
      columns: { id: true, pageId: true, url: true },
    });
    const trackedPageMap = new Map<string, string>(); // pageId or url -> trackedPages.id
    for (const tp of existingTracked) {
      if (tp.pageId) trackedPageMap.set(tp.pageId, tp.id);
      if (tp.url) {
        const match = tp.url.match(/view_all_page_id=(\d+)/);
        if (match) trackedPageMap.set(match[1], tp.id);
      }
    }

    const previouslyIgnored = await db.query.discoveredPages.findMany({
      where: eq(discoveredPages.status, "ignored"),
      columns: { pageId: true },
    });
    const ignoredPageSet = new Set(previouslyIgnored.map((p) => p.pageId));

    let savedPagesCount = 0;
    const pageEntries = Array.from(collectedPages.values());

    for (const pageData of pageEntries) {
      const existingTrackedId = trackedPageMap.get(pageData.pageId) || null;
      const isIgnored = ignoredPageSet.has(pageData.pageId);
      const initialStatus = existingTrackedId ? "imported" : isIgnored ? "ignored" : "discovered";

      await db
        .insert(discoveredPages)
        .values({
          runId,
          pageId: pageData.pageId,
          displayName: pageData.displayName,
          country,
          matchingAdCount: pageData.matchingAdCount,
          sampleAdArchiveIds: Array.from(pageData.sampleAdArchiveIds),
          sampleCtas: Array.from(pageData.sampleCtas),
          sampleUrls: Array.from(pageData.sampleUrls),
          status: initialStatus,
          trackedPageId: existingTrackedId,
          createdAt: finishedAt,
          updatedAt: finishedAt,
        })
        .onConflictDoUpdate({
          target: [discoveredPages.runId, discoveredPages.pageId],
          set: {
            displayName: pageData.displayName || discoveredPages.displayName,
            matchingAdCount: pageData.matchingAdCount,
            sampleAdArchiveIds: Array.from(pageData.sampleAdArchiveIds),
            sampleCtas: Array.from(pageData.sampleCtas),
            sampleUrls: Array.from(pageData.sampleUrls),
            status: initialStatus,
            trackedPageId: existingTrackedId,
            updatedAt: finishedAt,
          },
        });
      savedPagesCount++;
    }

    const finalStatus =
      savedPagesCount === 0 && scannedAdIds.size === 0
        ? "failed"
        : scannedAdIds.size >= TARGET_MAX_ADS || noProgressCount >= NO_PROGRESS_CAP || savedPagesCount > 0
        ? "completed"
        : "partial";

    await db
      .update(discoveryRuns)
      .set({
        status: finalStatus,
        totalAdsScanned: scannedAdIds.size,
        totalPagesDiscovered: savedPagesCount,
        outcomeDetails: `Successfully extracted ${savedPagesCount} unique pages from ${scannedAdIds.size} active ads.`,
        finishedAt,
      })
      .where(eq(discoveryRuns.id, runId));

    console.log(
      `[Discovery Scanner] Scan complete (${finalStatus}). Scanned: ${scannedAdIds.size} ads | Discovered: ${savedPagesCount} unique pages.`
    );

    return {
      status: finalStatus,
      totalAdsScanned: scannedAdIds.size,
      totalPagesDiscovered: savedPagesCount,
      outcomeDetails: `Extracted ${savedPagesCount} unique pages from ${scannedAdIds.size} active ads.`,
    };
  } catch (err: any) {
    await db
      .update(discoveryRuns)
      .set({
        status: "failed",
        failureReason: "timeout",
        outcomeDetails: err.message || "Discovery scan failed unexpectedly",
        finishedAt: new Date(),
      })
      .where(eq(discoveryRuns.id, runId));

    return {
      status: "failed",
      totalAdsScanned: scannedAdIds.size,
      totalPagesDiscovered: collectedPages.size,
      failureReason: "timeout",
      outcomeDetails: err.message || "Discovery scan failed",
    };
  } finally {
    page.off("response", handleResponse);
  }
}
