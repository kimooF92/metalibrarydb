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
const NO_PROGRESS_CAP = parseInt(process.env.DISCOVERY_NO_PROGRESS_CAP || "12", 10);
const SCROLL_WAIT_MS = parseInt(process.env.DISCOVERY_SCROLL_WAIT_MS || "6000", 10);
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
    if (!node || typeof node !== "object") return;

    // Recurse into collated_results array if present inside node
    if (Array.isArray(node.collated_results)) {
      for (const item of node.collated_results) {
        parseDiscoveryGraphQLNode(item, collectedPages, scannedAdIds, canonicalPageIds);
      }
      return;
    }

    const targetNode = node.node || node;

    // Recurse into targetNode.collated_results if present
    if (targetNode !== node && Array.isArray(targetNode.collated_results)) {
      for (const item of targetNode.collated_results) {
        parseDiscoveryGraphQLNode(item, collectedPages, scannedAdIds, canonicalPageIds);
      }
      return;
    }

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
 * Traverses JSON object recursively to find ad array nodes and page filter options
 */
function extractDiscoveryFromJSON(
  obj: any,
  collectedPages: Map<string, DiscoveredPageData>,
  scannedAdIds: Set<string>,
  canonicalPageIds: Set<string>,
  feedEndedRef?: { ended: boolean }
) {
  if (!obj || typeof obj !== "object") return;

  // Check for explicit end-of-feed marker from Meta's GraphQL page_info
  if (obj.page_info && obj.page_info.has_next_page === false) {
    if (feedEndedRef) feedEndedRef.ended = true;
  }
  if (obj.paging && obj.paging.has_next_page === false) {
    if (feedEndedRef) feedEndedRef.ended = true;
  }

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

  // Check if current object itself is an ad node
  const targetNode = obj.node || obj;
  if (
    targetNode &&
    typeof targetNode === "object" &&
    (targetNode.adArchiveID || targetNode.ad_archive_id || targetNode.id || targetNode.snapshot || targetNode.collated_results)
  ) {
    parseDiscoveryGraphQLNode(targetNode, collectedPages, scannedAdIds, canonicalPageIds);
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractDiscoveryFromJSON(item, collectedPages, scannedAdIds, canonicalPageIds, feedEndedRef);
    }
    return;
  }

  if (obj.ad_archive_nodes || obj.results || obj.edges || obj.ads || obj.collated_results) {
    const list = obj.ad_archive_nodes || obj.results || obj.edges || obj.ads || obj.collated_results;
    if (Array.isArray(list)) {
      for (const item of list) {
        extractDiscoveryFromJSON(item, collectedPages, scannedAdIds, canonicalPageIds, feedEndedRef);
      }
    }
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "object") {
      extractDiscoveryFromJSON(obj[key], collectedPages, scannedAdIds, canonicalPageIds, feedEndedRef);
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
  const feedEndedRef = { ended: false };
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
        extractDiscoveryFromJSON(jsonObj, collectedPages, scannedAdIds, canonicalPageIds, feedEndedRef);
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
    console.log(`[Discovery Scanner] Waiting for Meta's search query engine to stream GraphQL ad feed & inline HTML payloads...`);
    const initialWaitStart = Date.now();

    // Helper to scan inline script tags embedded in the HTML document
    const scanInlineScripts = async () => {
      try {
        const rawScriptContents = await page.evaluate(() => {
          const scripts = Array.from(document.querySelectorAll('script[type="application/json"], script'));
          return scripts
            .map((s) => s.textContent || "")
            .filter((t) => (t.includes("adArchiveID") || t.includes("ad_archive_id") || t.includes("dynamic_filter_options")) && t.length < 500000);
        });

        for (const content of rawScriptContents) {
          try {
            const parsed = JSON.parse(content);
            extractDiscoveryFromJSON(parsed, collectedPages, scannedAdIds, canonicalPageIds, feedEndedRef);
          } catch {
            // Regex JSON snippet fallback for multi-line scripts
            const jsonMatches = content.match(/\{"adArchiveID":.*?\}/g) || content.match(/\{"ad_archive_id":.*?\}/g);
            if (jsonMatches) {
              for (const jm of jsonMatches) {
                try {
                  const parsed = JSON.parse(jm);
                  extractDiscoveryFromJSON(parsed, collectedPages, scannedAdIds, canonicalPageIds, feedEndedRef);
                } catch {}
              }
            }
          }
        }
      } catch {}
    };

    while (scannedAdIds.size === 0 && Date.now() - initialWaitStart < 15000) {
      await scanInlineScripts();
      if (scannedAdIds.size > 0) break;
      await page.waitForTimeout(1000);
    }
    await scanInlineScripts();

    console.log(`[Discovery Scanner] Initial stream wait complete. Captured ${scannedAdIds.size} ads so far.`);

    // Auto-Refresh Guard: If 0 ads were captured or "No ads match your search criteria" empty state was rendered, refresh page once to bypass false-positive empty state
    if (scannedAdIds.size === 0) {
      const hasEmptyState = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        return /no ads match|aucun résultat|ningún anuncio|keine anzeigen/i.test(text);
      });

      if (hasEmptyState || scannedAdIds.size === 0) {
        console.log(`[Discovery Scanner] 0 ads / Empty state detected on initial load. Reloading page once to force Meta query engine re-evaluation...`);
        await page.reload({ waitUntil: "networkidle", timeout: RESPONSE_TIMEOUT_MS }).catch(() => {});
        await page.waitForTimeout(5000);
        await scanInlineScripts();
        console.log(`[Discovery Scanner] Post-reload stream wait complete. Captured ${scannedAdIds.size} ads so far.`);
      }
    }

    // Initial Trigger Scroll & 10s Pause: Trigger Meta's infinite scroll listener to wake up backend pagination stream
    console.log(`[Discovery Scanner] Executing initial deep trigger scroll & 10s pause to wake up Meta pagination feed...`);
    try {
      await page.mouse.move(960, 600);
      await page.mouse.wheel(0, 3000);
      await page.keyboard.press("PageDown");
      await page.keyboard.press("PageDown");
    } catch {}
    await page.waitForTimeout(10000);
    await scanInlineScripts();
    console.log(`[Discovery Scanner] Post-trigger scroll check. Captured ${scannedAdIds.size} ads so far.`);

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

      // 1. Resolve Inner Scroll Container Metrics & Bounding Box
      const containerInfo = await page
        .evaluate(() => {
          // Strategy A: Ad Card Parent Chain
          const adElement = document.querySelector(
            'a[href*="id="], a[href*="view_all_page_id="], div[class*="x1yztbdb"]'
          );
          let resolvedContainer: Element | null = null;
          let containerType = "WindowRoot";

          if (adElement) {
            let parent = adElement.parentElement;
            while (parent && parent !== document.body) {
              const style = window.getComputedStyle(parent);
              if (
                (style.overflowY === "auto" ||
                  style.overflowY === "scroll" ||
                  style.overflow === "auto" ||
                  style.overflow === "scroll") &&
                parent.scrollHeight > parent.clientHeight
              ) {
                resolvedContainer = parent;
                containerType = "AdCardParentContainer";
                break;
              }
              parent = parent.parentElement;
            }
          }

          // Strategy B: role="feed"
          if (!resolvedContainer) {
            const roleFeed = document.querySelector('div[role="feed"]');
            if (roleFeed) {
              resolvedContainer = roleFeed;
              containerType = "RoleFeedContainer";
            }
          }

          // Strategy C: Any scrollable div with overflowY
          if (!resolvedContainer) {
            const scrollableDivs = Array.from(document.querySelectorAll("div")).filter((div) => {
              const style = window.getComputedStyle(div);
              return (
                (style.overflowY === "auto" || style.overflowY === "scroll") &&
                div.scrollHeight > div.clientHeight + 100
              );
            });
            if (scrollableDivs.length > 0) {
              resolvedContainer = scrollableDivs[0];
              containerType = "OverflowDivContainer";
            }
          }

          const target =
            resolvedContainer || document.scrollingElement || document.documentElement || document.body;
          const rect = target.getBoundingClientRect();

          return {
            containerType,
            scrollTop: target.scrollTop || window.scrollY || 0,
            scrollHeight: target.scrollHeight || document.body?.scrollHeight || 0,
            clientHeight: target.clientHeight || window.innerHeight || 0,
            box: {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              width: rect.width,
              height: rect.height,
            },
          };
        })
        .catch(() => null);

      // 2. Position Playwright mouse over inner container & execute wheel + keypress
      if (containerInfo && containerInfo.box && containerInfo.box.width > 0 && containerInfo.box.height > 0) {
        try {
          const targetX = Math.max(50, Math.min(containerInfo.box.x, 1800));
          const targetY = Math.max(50, Math.min(containerInfo.box.y, 900));
          await page.mouse.move(targetX, targetY);
          await page.mouse.wheel(0, 2500);
          await page.keyboard.press("PageDown");
          await page.keyboard.press("PageDown");
        } catch {}
      } else {
        try {
          await page.mouse.move(960, 600);
          await page.mouse.wheel(0, 2500);
          await page.keyboard.press("PageDown");
          await page.keyboard.press("PageDown");
        } catch {}
      }

      // 3. Fallback evaluate scroll & dispatch scroll events directly on inner container & window
      await page
        .evaluate(() => {
          const adElement = document.querySelector(
            'a[href*="id="], a[href*="view_all_page_id="], div[class*="x1yztbdb"]'
          );
          let target: Element | null = null;

          if (adElement) {
            let parent = adElement.parentElement;
            while (parent && parent !== document.body) {
              const style = window.getComputedStyle(parent);
              if (
                (style.overflowY === "auto" ||
                  style.overflowY === "scroll" ||
                  style.overflow === "auto" ||
                  style.overflow === "scroll") &&
                parent.scrollHeight > parent.clientHeight
              ) {
                target = parent;
                break;
              }
              parent = parent.parentElement;
            }
          }

          if (!target) {
            target =
              document.querySelector('div[role="feed"]') ||
              Array.from(document.querySelectorAll("div")).find((div) => {
                const style = window.getComputedStyle(div);
                return (
                  (style.overflowY === "auto" || style.overflowY === "scroll") &&
                  div.scrollHeight > div.clientHeight + 100
                );
              }) ||
              null;
          }

          if (target) {
            target.scrollTop += 2500;
            target.dispatchEvent(new Event("scroll", { bubbles: true }));
          }

          window.scrollBy(0, 2500);
          if (document.scrollingElement) {
            document.scrollingElement.scrollBy(0, 2500);
          }
          window.dispatchEvent(new Event("scroll", { bubbles: true }));
        })
        .catch(() => {});

      // 4. Adaptive response wait
      const waitStart = Date.now();
      while (!graphqlResponseReceived && Date.now() - waitStart < SCROLL_WAIT_MS) {
        await page.waitForTimeout(300);
      }

      // 5. Inline DOM script tag payload scan on EVERY scroll iteration
      await scanInlineScripts();

      // 6. Measure post-scroll metrics & log detailed container scroll diagnostics
      const postContainerInfo = await page
        .evaluate(() => {
          const adElement = document.querySelector(
            'a[href*="id="], a[href*="view_all_page_id="], div[class*="x1yztbdb"]'
          );
          let target: Element | null = null;
          if (adElement) {
            let parent = adElement.parentElement;
            while (parent && parent !== document.body) {
              const style = window.getComputedStyle(parent);
              if (
                (style.overflowY === "auto" || style.overflowY === "scroll") &&
                parent.scrollHeight > parent.clientHeight
              ) {
                target = parent;
                break;
              }
              parent = parent.parentElement;
            }
          }
          if (!target) {
            target =
              document.querySelector('div[role="feed"]') ||
              Array.from(document.querySelectorAll("div")).find((div) => {
                const style = window.getComputedStyle(div);
                return (
                  (style.overflowY === "auto" || style.overflowY === "scroll") &&
                  div.scrollHeight > div.clientHeight + 100
                );
              }) ||
              null;
          }
          const el = target || document.scrollingElement || document.documentElement || document.body;
          return {
            scrollTop: el.scrollTop || window.scrollY || 0,
            scrollHeight: el.scrollHeight || document.body?.scrollHeight || 0,
          };
        })
        .catch(() => null);

      const scrollMoved = (postContainerInfo?.scrollTop || 0) - (containerInfo?.scrollTop || 0);
      const heightGrew = (postContainerInfo?.scrollHeight || 0) - (containerInfo?.scrollHeight || 0);

      console.log(
        `[Scroll Diagnostic #${i + 1}] ContainerType: ${
          containerInfo?.containerType || "Unknown"
        } | Moved: +${scrollMoved}px (ScrollTop: ${postContainerInfo?.scrollTop || 0}px | ContainerHeight: ${
          postContainerInfo?.scrollHeight || 0
        }px [+${heightGrew}px]) | GraphQL: ${graphqlResponseReceived} | Ads Scanned: ${scannedAdIds.size}`
      );

      // Bounce Nudge: If scroll position was pinned at bottom and height didn't grow, scroll up 500px & back down to trigger IntersectionObserver
      if (scrollMoved <= 0 && heightGrew <= 0) {
        try {
          await page.evaluate(() => {
            window.scrollBy(0, -500);
          });
          await page.waitForTimeout(300);
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
            window.dispatchEvent(new Event("scroll", { bubbles: true }));
          });
        } catch {}
      }

      // Check for explicit GraphQL feed completion (page_info.has_next_page === false)
      if (feedEndedRef.ended) {
        console.log(`[Discovery Scanner] Meta GraphQL feed explicitly confirmed end of feed (has_next_page: false). Ending scan.`);
        break;
      }

      // Check progress: reset progress counter if ad count increased OR container height grew
      const currentAdCount = scannedAdIds.size;
      if (currentAdCount === lastAdCount && heightGrew <= 0) {
        noProgressCount++;
        if (noProgressCount >= NO_PROGRESS_CAP) {
          console.log(`[Discovery Scanner] No new ads and no container growth for ${noProgressCount} consecutive scrolls. Reached feed end.`);
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
