import { Page, Response } from "playwright";
import { db } from "../../db";
import { ads, adObservations, trackedPages, scanHistory, brandDomains } from "../../db/schema";
import { eq, sql, and, desc, ne, isNull, or } from "drizzle-orm";
import { checkAndRecordBreakout } from "../../lib/breakout-detector";
import { extractAdsFromDOM, extractPageIdsFromPage } from "../dom-scanner";
import { extractMedia, extractPageInfo } from "../../lib/apify-ingest";
import { parseResultCountFromText } from "../scanner";
import { resolveDestinationUrl } from "../../lib/utils";
import { linkAndAutoScrapeProduct } from "../../lib/product-ingest";
import { selectBestProductCandidateUrl } from "../../lib/discovery-product-selector";
import { processAdMedia } from "./media-pipeline";
import { ExtractedAdData, SpyScanOutcome } from "./scanner-types";

export type { ExtractedAdData, SpyScanOutcome };

// Configurable constants
const MAX_SCROLL_ATTEMPTS = parseInt(process.env.SPY_MAX_SCROLL_ATTEMPTS || "50", 10);
const NO_PROGRESS_CAP = parseInt(process.env.SPY_NO_PROGRESS_CAP || "6", 10);
const SCROLL_WAIT_MS = parseInt(process.env.SPY_SCROLL_WAIT_MS || "3000", 10);
const RESPONSE_TIMEOUT_MS = parseInt(process.env.PAGE_TIMEOUT || "30000", 10);

/**
 * Extract normalized ad attributes from Meta GraphQL payload node
 */
export function parseAdGraphQLNode(node: any): ExtractedAdData | null {
  try {
    const adArchiveId =
      node.adArchiveID || node.ad_archive_id || node.id || node.adArchiveId;
    if (!adArchiveId) return null;

    const pageInfo = extractPageInfo(node);
    const pageId = pageInfo.pageId || (node.pageID && String(node.pageID) !== "0" && !String(node.pageID).includes("-") ? String(node.pageID) : "");
    const pageName = pageInfo.pageName || node.publisherPlatformPageName || null;

    // Started running date parsing
    let startedRunningOn: Date | null = null;
    const startDateRaw = node.startDate || node.start_date || node.startDateFormatted;
    if (startDateRaw) {
      const parsed = new Date(typeof startDateRaw === "number" ? startDateRaw * 1000 : startDateRaw);
      if (!isNaN(parsed.getTime())) {
        startedRunningOn = parsed;
      }
    }

    // Creative body & copy
    const snapshot = node.snapshot || node;
    const caption =
      snapshot.body?.markup?.text ||
      snapshot.body?.text ||
      snapshot.ad_creative_body ||
      (Array.isArray(snapshot.cards) ? snapshot.cards[0]?.body : null) ||
      null;

    const title =
      snapshot.title ||
      snapshot.ad_creative_link_title ||
      (Array.isArray(snapshot.cards) ? snapshot.cards[0]?.title : null) ||
      null;

    const ctaText =
      snapshot.cta_type ||
      snapshot.cta_text ||
      snapshot.action_link_title ||
      null;

    const cards = Array.isArray(snapshot.cards) ? snapshot.cards : [];
    const primaryCardUrl = cards[0]?.link_url ? resolveDestinationUrl(cards[0].link_url) : null;
    const topLevelUrl = (snapshot.link_url || snapshot.ad_creative_link_url)
      ? resolveDestinationUrl(snapshot.link_url || snapshot.ad_creative_link_url)
      : null;

    // Prioritize deep product-page candidate across primary card and top-level URL
    let effectiveLinkUrl: string | null = null;
    const directCandidates = [primaryCardUrl, topLevelUrl].filter(Boolean) as string[];
    if (directCandidates.length > 0) {
      const bestCandidate = selectBestProductCandidateUrl(directCandidates);
      effectiveLinkUrl = bestCandidate?.url || topLevelUrl || primaryCardUrl;
    }

    const isSocialOrMissing =
      !effectiveLinkUrl ||
      effectiveLinkUrl.includes("wa.me") ||
      effectiveLinkUrl.includes("whatsapp.com") ||
      effectiveLinkUrl.includes("m.me") ||
      effectiveLinkUrl.includes("facebook.com");

    if (isSocialOrMissing && caption) {
      const rawMatches = caption.match(/https?:\/\/[^\s"'<>)\]]+/gi) || [];
      if (rawMatches.length > 0) {
        const candidate = selectBestProductCandidateUrl(rawMatches);
        if (candidate && candidate.source === "product_page") {
          effectiveLinkUrl = candidate.url;
        }
      }
    }

    const secondaryProductUrls: string[] = [];
    if (cards.length > 1) {
      for (let i = 1; i < cards.length; i++) {
        const secondaryRawUrl = cards[i]?.link_url;
        const secondaryResolved = resolveDestinationUrl(secondaryRawUrl);
        if (secondaryResolved) {
          const candidate = selectBestProductCandidateUrl([secondaryResolved]);
          if (candidate && candidate.source === "product_page") {
            secondaryProductUrls.push(candidate.url);
          }
        }
      }
    }

    // Extract comprehensive media (Images, Videos, Carousels, Thumbnails)
    const { mediaType, mediaUrls, thumbnailUrl } = extractMedia(node);

    // Duplication / collation count
    const collationCount =
      node.collationCount || node.collation_count || node.duplicateCount || 1;
    const collationId = node.collationID || node.collation_id || null;
    const isActive = node.isActive ?? node.is_active ?? true;

    return {
      adArchiveId: String(adArchiveId),
      pageId: String(pageId),
      pageName: pageName ? String(pageName) : null,
      startedRunningOn,
      caption: caption ? String(caption) : null,
      title: title ? String(title) : null,
      ctaText: ctaText ? String(ctaText) : null,
      linkUrl: effectiveLinkUrl ? String(effectiveLinkUrl) : null,
      mediaType,
      mediaUrls,
      thumbnailUrl: thumbnailUrl ? String(thumbnailUrl) : null,
      profilePicUrl: pageInfo.profilePicUrl || null,
      duplicationCount: typeof collationCount === "number" ? collationCount : 1,
      collationId: collationId ? String(collationId) : null,
      isActive: Boolean(isActive),
      secondaryProductUrls,
    };
  } catch {
    return null;
  }
}

/**
 * Traverse JSON object recursively to find ad array nodes
 */
function extractAdsFromJSON(obj: any, collectedMap: Map<string, ExtractedAdData>) {
  if (!obj || typeof obj !== "object") return;

  // Pattern A: AdArchiveSearchResults / ad_archive_nodes / results
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === "object" && (item.adArchiveID || item.ad_archive_id || item.snapshot)) {
        const parsed = parseAdGraphQLNode(item);
        if (parsed) collectedMap.set(parsed.adArchiveId, parsed);
      } else {
        extractAdsFromJSON(item, collectedMap);
      }
    }
    return;
  }

  // Check specific keys
  if (obj.ad_archive_nodes || obj.results || obj.edges || obj.ads || obj.collated_results) {
    const list = obj.ad_archive_nodes || obj.results || obj.edges || obj.ads || obj.collated_results;
    if (Array.isArray(list)) {
      for (const item of list) {
        const targetNode = item.node || item;
        if (targetNode && typeof targetNode === "object" && Array.isArray(targetNode.collated_results)) {
          for (const subItem of targetNode.collated_results) {
            const parsed = parseAdGraphQLNode(subItem);
            if (parsed) collectedMap.set(parsed.adArchiveId, parsed);
          }
        } else {
          const parsed = parseAdGraphQLNode(targetNode);
          if (parsed) collectedMap.set(parsed.adArchiveId, parsed);
        }
      }
    }
  }

  // Recurse into object properties (allow full traversal)
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "object") {
      extractAdsFromJSON(obj[key], collectedMap);
    }
  }
}

/**
 * Main function: Run an Ad Spy Extraction Scan using GraphQL Response Interception
 */
export async function scanAdCreatives(
  page: Page,
  trackedPageId: string,
  targetUrl: string,
  creativeScanId: string,
  country: string = "ALL"
): Promise<SpyScanOutcome> {
  const pageRecord = await db.query.trackedPages.findFirst({
    where: eq(trackedPages.id, trackedPageId),
  });
  const collectedAds = new Map<string, ExtractedAdData>();
  const canonicalPageIdsFromFilter = new Map<string, string>(); // pageId -> displayName
  let hasCaptchaOrBlock = false;
  let isRateLimited = false;
  let graphqlResponseReceived = false;

  // Derive normalized domain segments from the search query
  let queryDomainSegments: string[] = [];
  try {
    const parsedTargetUrl = new URL(targetUrl.match(/^https?:\/\//i) ? targetUrl : `https://${targetUrl}`);
    const rawQ = parsedTargetUrl.searchParams.get("q") || "";
    const cleanQ = rawQ.replace(/^"|"$/g, "").trim().toLowerCase();
    if (cleanQ) {
      const STOP_WORDS = new Set(["shop", "store", "converty", "com", "tn", "net", "org", "online", "site", "page", "official", "buy", "deal", "deals"]);
      queryDomainSegments = cleanQ.split(/[.\-_]/).filter((s) => s.length > 2 && !STOP_WORDS.has(s));
    }
  } catch {
    // ignore URL parse errors
  }

  // 1. Response Listener for Meta GraphQL responses
  const handleResponse = async (response: Response) => {
    try {
      const url = response.url();
      if (!url.includes("/api/graphql/") && !url.includes("graphql")) return;

      const status = response.status();
      if (status === 429) {
        isRateLimited = true;
        return;
      }

      if (status !== 200) return;

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
        extractAdsFromJSON(jsonObj, collectedAds);
        graphqlResponseReceived = true;

        const extractFilterPages = (o: any) => {
          if (!o || typeof o !== "object") return;
          if (o.dynamic_filter_options?.pages && Array.isArray(o.dynamic_filter_options.pages)) {
            const allCandidates: Array<{ pageId: string; displayName: string; count: number }> = [];

            for (const pOpt of o.dynamic_filter_options.pages) {
              const pageId = String(pOpt.key || pOpt.page_id || "");
              const displayName = String(pOpt.display_name || pOpt.name || "");
              const count = typeof pOpt.count === "number" ? pOpt.count : 0;
              if (pageId && pageId !== "0") {
                allCandidates.push({ pageId, displayName, count });
              }
            }

            let matched = allCandidates;
            if (queryDomainSegments.length > 0) {
              const domainBase = queryDomainSegments[0];

              const brandMatches = allCandidates.filter(({ displayName }) => {
                const norm = displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
                return (
                  norm.includes(domainBase) ||
                  domainBase.includes(norm) ||
                  (norm.length >= 3 && domainBase.length >= 3 && norm.slice(0, 3) === domainBase.slice(0, 3))
                );
              });

              if (brandMatches.length > 0) {
                brandMatches.sort((a, b) => {
                  const aNorm = a.displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const bNorm = b.displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const aExact = aNorm === domainBase || aNorm.startsWith(domainBase) ? 2 : 1;
                  const bExact = bNorm === domainBase || bNorm.startsWith(domainBase) ? 2 : 1;
                  if (aExact !== bExact) return bExact - aExact;
                  return b.count - a.count;
                });
                matched = [brandMatches[0]];
              }
            }

            for (const { pageId, displayName } of matched) {
              canonicalPageIdsFromFilter.set(pageId, displayName || pageId);
            }
          }
          for (const key of Object.keys(o)) {
            if (typeof o[key] === "object") extractFilterPages(o[key]);
          }
        };
        extractFilterPages(jsonObj);
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
      // response text read error
    }
  };

  page.on("response", handleResponse);

  try {
    console.log(`[Spy Scanner] Navigating to: ${targetUrl}`);
    const navStartTime = Date.now();
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: RESPONSE_TIMEOUT_MS,
    });

    const isDirectPageSearch = targetUrl.includes("view_all_page_id=") || targetUrl.includes("search_type=page");
    const initialWaitTime = isDirectPageSearch ? 3500 : 7000;
    await page.waitForTimeout(initialWaitTime);

    // Check page state for authentic CAPTCHA / Security Check challenges
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
      return {
        status: "failed",
        extractedCount: 0,
        failureReason: "captcha",
        outcomeDetails: "Meta Ad Library presented a security CAPTCHA block during navigation",
      };
    }

    if (isRateLimited) {
      return {
        status: "failed",
        extractedCount: 0,
        failureReason: "rate_limited",
        outcomeDetails: "HTTP 429 Rate Limit returned by Meta GraphQL endpoint",
      };
    }

    // Attempt to extract result count header from DOM
    let totalTargetAds: number | null = null;
    try {
      const bodyText = await page.innerText("body");
      const parsedCount = parseResultCountFromText(bodyText);
      if (parsedCount.results !== null && parsedCount.results > 0) {
        totalTargetAds = parsedCount.results;
        console.log(`[Spy Scanner] 🎯 Target total ad count from DOM: ~${totalTargetAds} ads`);
      }
    } catch {
      // non-fatal count read error
    }

    // 2. Scroll Loop to trigger GraphQL pagination
    let scrollAttempts = 0;
    let noProgressCount = 0;
    let lastCollectedCount = collectedAds.size;
    const scrollCap = totalTargetAds !== null ? Math.min(MAX_SCROLL_ATTEMPTS, Math.max(5, Math.ceil(totalTargetAds / 12) + 3)) : MAX_SCROLL_ATTEMPTS;

    console.log(`[Spy Scanner] Beginning scroll loop (max ${scrollCap} attempts, no progress limit: ${NO_PROGRESS_CAP})...`);

    while (scrollAttempts < scrollCap && noProgressCount < NO_PROGRESS_CAP) {
      scrollAttempts++;

      await page.evaluate(() => {
        window.scrollBy({
          top: window.innerHeight * 1.8,
          behavior: "smooth",
        });
      });

      await page.waitForTimeout(SCROLL_WAIT_MS);

      const currentCount = collectedAds.size;
      if (currentCount > lastCollectedCount) {
        const added = currentCount - lastCollectedCount;
        console.log(`[Spy Scanner] Scroll #${scrollAttempts}: +${added} ad(s) captured (total: ${currentCount})`);
        lastCollectedCount = currentCount;
        noProgressCount = 0;
      } else {
        noProgressCount++;
      }

      if (totalTargetAds !== null && currentCount >= totalTargetAds) {
        console.log(`[Spy Scanner] Reached target ad count (${currentCount}/${totalTargetAds}). Stopping scroll.`);
        break;
      }
    }

    console.log(`[Spy Scanner] Scroll loop completed: ${collectedAds.size} ad creatives captured in ${scrollAttempts} scrolls.`);

    // 3. Fallback: If no GraphQL ads were captured, scrape from DOM elements
    const trackedPageRecord = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, trackedPageId),
      columns: { pageId: true, displayName: true, searchType: true, landingPage: true, country: true, workspaceId: true, profilePicUrl: true, brandDomainId: true },
    });
    const fallbackNumericPageId = (trackedPageRecord?.pageId && trackedPageRecord.pageId !== "0" && !trackedPageRecord.pageId.includes("-"))
      ? trackedPageRecord.pageId
      : "0";

    if (collectedAds.size === 0) {
      console.log("[Spy Scanner] No GraphQL ad payloads captured. Attempting DOM element extraction fallback...");
      const domAds = await extractAdsFromDOM(page, fallbackNumericPageId);
      for (const domAd of domAds) {
        collectedAds.set(domAd.adArchiveId, domAd);
      }
      console.log(`[Spy Scanner] DOM extraction recovered ${domAds.length} ad(s).`);
    }

    const extractedPageIdsSet = new Set<string>();
    for (const adData of collectedAds.values()) {
      if (adData.pageId && adData.pageId !== "0" && adData.pageId.trim() !== "") {
        extractedPageIdsSet.add(adData.pageId.trim());
      }
    }

    const pageInfos = await extractPageIdsFromPage(page).catch(() => []);
    for (const pInfo of pageInfos) {
      if (pInfo.pageId && pInfo.pageId !== "0") {
        extractedPageIdsSet.add(pInfo.pageId.trim());
      }
    }

    for (const pageId of canonicalPageIdsFromFilter.keys()) {
      extractedPageIdsSet.add(pageId);
    }

    const extractedPageIds: string[] = Array.from(extractedPageIdsSet);

    const now = new Date();

    if (collectedAds.size === 0) {
      return {
        status: "failed",
        extractedCount: 0,
        extractedPageIds,
        failureReason: "payload_not_found",
        outcomeDetails: "No GraphQL ad payloads or DOM ad cards captured during scan",
      };
    }

    // Close heavy browser tab to release RAM
    console.log(`[Spy Scanner] 🧹 Closing heavy Facebook browser tab to free RAM before frame extraction...`);
    await page.close().catch(() => {});

    // 4. Save extracted ads and observations transactionally
    let savedCount = 0;
    let newProductsCount = 0;
    const savedAdIds: string[] = [];

    for (const adData of collectedAds.values()) {
      const mediaResult = await processAdMedia(adData);

      // Upsert canonical ad record
      const [upsertedAd] = await db
        .insert(ads)
        .values({
          adArchiveId: adData.adArchiveId,
          pageId: (adData.pageId && !adData.pageId.includes("-")) ? adData.pageId : (extractedPageIds[0] || "0"),
          pageName: adData.pageName,
          startedRunningOn: adData.startedRunningOn,
          caption: adData.caption,
          title: adData.title,
          ctaText: adData.ctaText,
          linkUrl: adData.linkUrl,
          mediaType: adData.mediaType,
          mediaUrls: mediaResult.finalMediaUrls,
          thumbnailUrl: mediaResult.finalThumbnailUrl,
          thumbnailStoragePath: mediaResult.storagePath,
          mediaHash: mediaResult.mediaHash,
          perceptualHash: mediaResult.perceptualHash,
          firstSeenAt: now,
          lastSeenAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: ads.adArchiveId,
          set: {
            pageName: adData.pageName,
            ...(adData.startedRunningOn ? { startedRunningOn: adData.startedRunningOn } : {}),
            caption: adData.caption,
            title: adData.title,
            ctaText: adData.ctaText,
            linkUrl: adData.linkUrl,
            mediaType: adData.mediaType,
            mediaUrls: mediaResult.finalMediaUrls,
            thumbnailUrl: sql`CASE 
              WHEN ${ads.thumbnailUrl} LIKE '%b2%' OR ${ads.thumbnailUrl} LIKE '%backblazeb2%' THEN ${ads.thumbnailUrl}
              ELSE COALESCE(${mediaResult.finalThumbnailUrl}, ${ads.thumbnailUrl})
            END`,
            thumbnailStoragePath: sql`COALESCE(${mediaResult.storagePath}, ${ads.thumbnailStoragePath})`,
            ...(mediaResult.mediaHash ? { mediaHash: mediaResult.mediaHash } : {}),
            ...(mediaResult.perceptualHash ? { perceptualHash: mediaResult.perceptualHash } : {}),
            lastSeenAt: now,
            updatedAt: now,
            isArchived: false,
            archivedAt: null,
          },
        })
        .returning({ id: ads.id });

      if (upsertedAd) {
        savedAdIds.push(upsertedAd.id);

        let priorDuplication: number | undefined = undefined;
        try {
          const priorObs = await db.query.adObservations.findFirst({
            where: and(
              eq(adObservations.adId, upsertedAd.id),
              ne(adObservations.creativeScanId, creativeScanId)
            ),
            orderBy: [desc(adObservations.observedAt)],
          });
          if (priorObs) {
            priorDuplication = priorObs.duplicationCount;
          }
        } catch {}

        await db.insert(adObservations).values({
          creativeScanId,
          adId: upsertedAd.id,
          trackedPageId,
          isActive: adData.isActive,
          duplicationCount: adData.duplicationCount,
          collationId: adData.collationId,
          observedAt: now,
        });

        if (adData.duplicationCount >= 3) {
          checkAndRecordBreakout({
            adId: upsertedAd.id,
            adArchiveId: adData.adArchiveId,
            pageId: adData.pageId || (extractedPageIds[0] ?? ""),
            brandName: adData.pageName || "Brand",
            trackedPageId,
            currentDuplication: adData.duplicationCount,
            prevDuplication: priorDuplication,
            startedRunningOn: adData.startedRunningOn,
            firstSeenAt: now,
            lastSeenAt: now,
            mediaType: adData.mediaType,
            linkUrl: adData.linkUrl,
            isActive: adData.isActive,
          }).catch((err) => console.warn("[Worker Spy Scanner] Breakout check error:", err));
        }

        if (adData.linkUrl) {
          try {
            const prodRes = await linkAndAutoScrapeProduct({
              adId: upsertedAd.id,
              linkUrl: adData.linkUrl,
              pageId: (adData.pageId && !adData.pageId.includes("-")) ? adData.pageId : (extractedPageIds[0] && !extractedPageIds[0].includes("-") ? extractedPageIds[0] : null),
              adCopy: adData.caption,
              workspaceId: pageRecord?.workspaceId || null,
            });
            if (prodRes?.isNew) {
              newProductsCount++;
            }
          } catch (e: any) {
            console.warn(`[Worker Spy Scanner] Auto-scrape product warning:`, e.message);
          }
        }

        savedCount++;
      }
    }

    const finalStatus: "completed" | "partial" =
      noProgressCount >= NO_PROGRESS_CAP ? "completed" : "partial";

    if (savedCount > 0 && finalStatus === "completed") {
      const currentlyObservedArchiveIds = new Set(
        Array.from(collectedAds.values()).map((a) => a.adArchiveId)
      );
      const { reconcileArchivedAds } = await import("../../lib/ad-reconciliation");
      await reconcileArchivedAds(trackedPageId, creativeScanId, currentlyObservedArchiveIds, now, {
        isFullScan: true,
      });
    }

    let resolvedPageId = (trackedPageRecord?.pageId && /^\d{6,25}$/.test(trackedPageRecord.pageId.trim()))
      ? trackedPageRecord.pageId.trim()
      : null;

    let resolvedPageName: string | null = null;

    if (!resolvedPageId) {
      for (const [pId, pName] of canonicalPageIdsFromFilter.entries()) {
        if (/^\d{6,25}$/.test(pId.trim())) {
          resolvedPageId = pId.trim();
          resolvedPageName = pName;
          break;
        }
      }

      if (!resolvedPageId) {
        for (const pId of extractedPageIds) {
          if (/^\d{6,25}$/.test(pId.trim())) {
            resolvedPageId = pId.trim();
            break;
          }
        }
      }

      if (!resolvedPageId) {
        for (const ad of collectedAds.values()) {
          if (ad.pageId && /^\d{6,25}$/.test(ad.pageId.trim())) {
            resolvedPageId = ad.pageId.trim();
            resolvedPageName = ad.pageName;
            break;
          }
        }
      }
    }

    let resolvedProfilePicUrl: string | null = null;
    for (const ad of collectedAds.values()) {
      if (ad.profilePicUrl) {
        resolvedProfilePicUrl = ad.profilePicUrl;
        break;
      }
    }

    const pageCountry = (trackedPageRecord as any)?.country || country || "ALL";
    const shouldUpdateProfilePic =
      Boolean(resolvedProfilePicUrl) &&
      resolvedProfilePicUrl !== trackedPageRecord?.profilePicUrl &&
      (!trackedPageRecord?.profilePicUrl ||
        trackedPageRecord.profilePicUrl.includes("fbcdn.net") ||
        trackedPageRecord.profilePicUrl.includes("facebook.com"));

    const pageUpdates: any = {
      status: "success",
      lastCreativeScan: now,
      lastSuccessAt: now,
      ...(shouldUpdateProfilePic ? { profilePicUrl: resolvedProfilePicUrl } : {}),
      updatedAt: now,
    };

    if (shouldUpdateProfilePic && trackedPageRecord?.brandDomainId) {
      try {
        await db
          .update(brandDomains)
          .set({ profilePicUrl: resolvedProfilePicUrl, updatedAt: now })
          .where(
            and(
              eq(brandDomains.id, trackedPageRecord.brandDomainId),
              or(
                isNull(brandDomains.profilePicUrl),
                eq(brandDomains.profilePicUrl, ""),
                sql`${brandDomains.profilePicUrl} LIKE '%fbcdn.net%'`,
                sql`${brandDomains.profilePicUrl} LIKE '%facebook.com%'`
              )
            )
          );
      } catch {}
    }

    if (resolvedPageId && resolvedPageId !== "0") {
      let targetDomain: string | null = null;
      const rawCandidates = [
        (trackedPageRecord as any)?.landingPage,
        trackedPageRecord?.displayName,
        (trackedPageRecord as any)?.url,
      ].filter(Boolean);

      const { extractStoreDomain } = await import("../../lib/url-parser");
      for (const candidate of rawCandidates) {
        const extracted = extractStoreDomain(candidate);
        if (extracted) {
          targetDomain = extracted;
          break;
        }
      }

      if (targetDomain) {
        try {
          const { getOrCreateBrandDomain, linkPageToDomain } = await import("../../lib/domain-portfolio");
          const bDomain = await getOrCreateBrandDomain(targetDomain, trackedPageRecord?.displayName, trackedPageRecord?.workspaceId);

          if (trackedPageRecord?.searchType !== "page") {
            pageUpdates.pageRole = "satellite";
            pageUpdates.brandDomainId = bDomain.id;
            pageUpdates.canonicalDomain = bDomain.domain;

            const existingSister = await db.query.trackedPages.findFirst({
              where: eq(trackedPages.pageId, resolvedPageId),
            });

            if (!existingSister) {
              const newPageUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${resolvedPageId}&search_type=page&media_type=all`;
              await db.insert(trackedPages).values({
                url: newPageUrl,
                pageId: resolvedPageId,
                displayName: resolvedPageName || `Page ${resolvedPageId}`,
                searchType: "page",
                country: pageCountry,
                brandDomainId: bDomain.id,
                workspaceId: bDomain.workspaceId ?? trackedPageRecord?.workspaceId,
                pageRole: "primary",
                canonicalDomain: bDomain.domain,
                status: "success",
                currentResults: savedAdIds.length,
                lastChecked: now,
                lastSuccessAt: now,
                lastCreativeScan: now,
              });
            } else {
              await linkPageToDomain(existingSister.id, bDomain.id, "primary", { forceReassign: false });
            }
          } else {
            await linkPageToDomain(trackedPageId, bDomain.id, "primary", { forceReassign: false });
          }
        } catch (domainErr) {
          console.warn("[Spy Scanner] Non-fatal error managing brand domain portfolio:", domainErr);
        }
      } else if (!trackedPageRecord?.pageId || trackedPageRecord.pageId === "0") {
        pageUpdates.pageId = resolvedPageId;
        pageUpdates.searchType = "page";
        pageUpdates.url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${resolvedPageId}&search_type=page&media_type=all`;
        if (resolvedPageName && (!trackedPageRecord?.displayName || trackedPageRecord.displayName.startsWith("http"))) {
          pageUpdates.displayName = resolvedPageName;
        }
      }

      if (savedAdIds.length > 0) {
        try {
          await db.execute(sql`
            UPDATE ads
            SET page_id = ${resolvedPageId},
                page_name = COALESCE(NULLIF(${resolvedPageName || null}, ''), page_name),
                updated_at = NOW()
            WHERE id IN (${sql.join(savedAdIds.map((id) => sql`${id}`), sql`, `)})
              AND (page_id = '0' OR page_id IS NULL OR page_id = '')
          `);
        } catch (adErr) {
          console.warn("[Spy Scanner] Non-fatal error backfilling ads with resolvedPageId:", adErr);
        }
      }

      if (targetDomain && targetDomain.includes(".")) {
        try {
          await db.execute(sql`
            UPDATE scraped_products
            SET page_id = COALESCE(page_id, ${resolvedPageId}),
                workspace_id = COALESCE(${pageRecord?.workspaceId || null}, workspace_id),
                brand_domain_id = COALESCE(${pageRecord?.brandDomainId || null}, brand_domain_id),
                updated_at = NOW()
            WHERE (lower(domain) = ${targetDomain.toLowerCase().trim()} OR url ILIKE ${`%${targetDomain.trim()}%`})
              AND (page_id IS NULL OR page_id = '0' OR workspace_id IS NULL OR workspace_id != ${pageRecord?.workspaceId || null})
          `);
        } catch (prodErr) {
          console.warn("[Spy Scanner] Non-fatal error backfilling scraped_products:", prodErr);
        }
      }

      if (pageRecord?.workspaceId && resolvedPageId) {
        try {
          await db.execute(sql`
            UPDATE scraped_products
            SET workspace_id = ${pageRecord.workspaceId},
                brand_domain_id = COALESCE(${pageRecord.brandDomainId || null}, brand_domain_id),
                updated_at = NOW()
            WHERE page_id = ${resolvedPageId}
              AND (workspace_id IS NULL OR workspace_id != ${pageRecord.workspaceId})
          `);
        } catch (prodErr) {
          console.warn("[Spy Scanner] Non-fatal error syncing scraped_products workspace_id by resolvedPageId:", prodErr);
        }
      }
    }

    await db
      .update(trackedPages)
      .set(pageUpdates)
      .where(eq(trackedPages.id, trackedPageId));

    return {
      status: finalStatus,
      extractedCount: savedCount,
      newProductsCount,
      extractedPageIds,
      outcomeDetails: `Successfully extracted and normalized ${savedCount} ad creatives${newProductsCount > 0 ? ` and ${newProductsCount} new product(s)` : ""}.`,
    };
  } catch (err: any) {
    const isTimeout =
      err?.name === "TimeoutError" ||
      /timeout|timed\s*out/i.test(err?.message || "");
    const failureReason = isTimeout ? "timeout" : "parse_error";

    return {
      status: "failed",
      extractedCount: collectedAds.size,
      newProductsCount: 0,
      failureReason,
      outcomeDetails: err.message || "Creative scan failed",
    };
  } finally {
    page.off("response", handleResponse);
  }
}
