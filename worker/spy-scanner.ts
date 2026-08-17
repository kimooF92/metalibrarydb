import { Page, Response } from "playwright";
import { db } from "../db";
import { ads, adObservations, creativeScans, trackedPages, scanHistory } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { cacheThumbnail } from "./thumbnail-cache";
import { extractAdsFromDOM, extractPageIdsFromPage } from "./dom-scanner";
import { uploadMediaFromUrlToB2, isB2Configured } from "../lib/b2-storage";
import { parseResultCountFromText } from "./scanner";
import { resolveDestinationUrl } from "../lib/utils";

export interface ExtractedAdData {
  adArchiveId: string;
  pageId: string;
  pageName: string | null;
  startedRunningOn: Date | null;
  caption: string | null;
  title: string | null;
  ctaText: string | null;
  linkUrl: string | null;
  mediaType: "image" | "video" | "carousel" | "unknown";
  mediaUrls: string[];
  thumbnailUrl: string | null;
  duplicationCount: number;
  collationId: string | null;
  isActive: boolean;
}

export interface SpyScanOutcome {
  status: "completed" | "partial" | "failed";
  extractedCount: number;
  extractedPageIds?: string[];
  failureReason?: "captcha" | "rate_limited" | "payload_not_found" | "parse_error" | "timeout";
  outcomeDetails?: string;
}

// Configurable constants
const MAX_SCROLL_ATTEMPTS = parseInt(process.env.SPY_MAX_SCROLL_ATTEMPTS || "50", 10);
const NO_PROGRESS_CAP = parseInt(process.env.SPY_NO_PROGRESS_CAP || "6", 10);
const SCROLL_WAIT_MS = parseInt(process.env.SPY_SCROLL_WAIT_MS || "3000", 10);
const RESPONSE_TIMEOUT_MS = parseInt(process.env.PAGE_TIMEOUT || "30000", 10);

/**
 * Extract normalized ad attributes from Meta GraphQL payload node
 */
function parseAdGraphQLNode(node: any): ExtractedAdData | null {
  try {
    const adArchiveId =
      node.adArchiveID || node.ad_archive_id || node.id || node.adArchiveId;
    if (!adArchiveId) return null;

    const pageId = node.pageID || node.page_id || "";
    const pageName = node.pageName || node.page_name || node.publisherPlatformPageName || null;

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

    const rawLinkUrl =
      snapshot.link_url ||
      snapshot.ad_creative_link_url ||
      (Array.isArray(snapshot.cards) ? snapshot.cards[0]?.link_url : null) ||
      null;
    const linkUrl = resolveDestinationUrl(rawLinkUrl);

    // Media type & URLs
    let mediaType: "image" | "video" | "carousel" | "unknown" = "unknown";
    const mediaUrls: string[] = [];
    let thumbnailUrl: string | null = null;

    const cards = Array.isArray(snapshot.cards) ? snapshot.cards : [];

    if (cards.length > 1) {
      mediaType = "carousel";
      for (const card of cards) {
        const imgUrl = card.resized_image_url || card.original_image_url || (Array.isArray(card.images) ? card.images[0]?.resized_image_url || card.images[0]?.original_image_url : null);
        if (imgUrl) mediaUrls.push(imgUrl);
        const vidUrl = card.video_hd_url || card.video_sd_url;
        if (vidUrl) mediaUrls.push(vidUrl);
      }
      thumbnailUrl = cards[0]?.resized_image_url || cards[0]?.original_image_url || cards[0]?.video_preview_image_url || null;
    } else if (cards.length === 1) {
      const card = cards[0];
      const cardVideos = Array.isArray(card.videos) ? card.videos : (card.video_hd_url || card.video_sd_url) ? [card] : [];
      const cardImages = Array.isArray(card.images) ? card.images : (card.resized_image_url || card.original_image_url) ? [card] : [];

      if (cardVideos.length > 0) {
        mediaType = "video";
        for (const v of cardVideos) {
          if (v.video_hd_url) mediaUrls.push(v.video_hd_url);
          if (v.video_sd_url) mediaUrls.push(v.video_sd_url);
          if (v.src) mediaUrls.push(v.src);
        }
        thumbnailUrl = card.video_preview_image_url || card.preview_image_url || card.resized_image_url || null;
      } else if (cardImages.length > 0) {
        mediaType = "image";
        for (const img of cardImages) {
          const url = img.resized_image_url || img.original_image_url || img.src;
          if (url) mediaUrls.push(url);
        }
        thumbnailUrl = card.resized_image_url || card.original_image_url || mediaUrls[0] || null;
      }
    }

    // Fallback if cards array was empty or didn't yield media: check root snapshot properties
    if (mediaUrls.length === 0) {
      if (Array.isArray(snapshot.videos) && snapshot.videos.length > 0) {
        mediaType = "video";
        for (const video of snapshot.videos) {
          if (video.video_hd_url) mediaUrls.push(video.video_hd_url);
          if (video.video_sd_url) mediaUrls.push(video.video_sd_url);
          if (!thumbnailUrl) thumbnailUrl = video.video_preview_image_url || video.preview_image_url || null;
        }
      } else if (Array.isArray(snapshot.images) && snapshot.images.length > 0) {
        mediaType = "image";
        for (const img of snapshot.images) {
          const url = img.resized_image_url || img.original_image_url || img.src;
          if (url) mediaUrls.push(url);
        }
        if (!thumbnailUrl) thumbnailUrl = mediaUrls[0] || null;
      } else if (snapshot.resized_image_url || snapshot.original_image_url) {
        mediaType = "image";
        const url = snapshot.resized_image_url || snapshot.original_image_url;
        mediaUrls.push(url);
        if (!thumbnailUrl) thumbnailUrl = url;
      } else if (snapshot.video_hd_url || snapshot.video_sd_url || snapshot.video_preview_image_url) {
        mediaType = "video";
        if (snapshot.video_hd_url) mediaUrls.push(snapshot.video_hd_url);
        if (snapshot.video_sd_url) mediaUrls.push(snapshot.video_sd_url);
        if (!thumbnailUrl) thumbnailUrl = snapshot.video_preview_image_url || null;
      }
    }

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
      linkUrl: linkUrl ? String(linkUrl) : null,
      mediaType,
      mediaUrls,
      thumbnailUrl: thumbnailUrl ? String(thumbnailUrl) : null,
      duplicationCount: typeof collationCount === "number" ? collationCount : 1,
      collationId: collationId ? String(collationId) : null,
      isActive: Boolean(isActive),
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
  country: string = "TN"
): Promise<SpyScanOutcome> {
  const collectedAds = new Map<string, ExtractedAdData>();
  const canonicalPageIdsFromFilter = new Map<string, string>(); // pageId -> displayName
  let hasCaptchaOrBlock = false;
  let isRateLimited = false;
  let graphqlResponseReceived = false;

  // Derive normalized domain segments from the search query (e.g. "oslo.tn" -> ["oslo"], "shop-lbaraka.converty.shop" -> ["lbaraka"])
  let queryDomainSegments: string[] = [];
  try {
    const parsedTargetUrl = new URL(targetUrl.match(/^https?:\/\//i) ? targetUrl : `https://${targetUrl}`);
    const rawQ = parsedTargetUrl.searchParams.get("q") || "";
    // Strip surrounding quotes, then split on dots/dashes
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

        // Also extract canonical Page IDs from dynamic_filter_options.pages, filtered to match search domain
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
              const domainBase = queryDomainSegments[0]; // primary segment e.g. "avino", "oslo"

              const brandMatches = allCandidates.filter(({ displayName }) => {
                const norm = displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
                return (
                  norm.includes(domainBase) ||
                  domainBase.includes(norm) ||
                  (norm.length >= 3 && domainBase.length >= 3 && norm.slice(0, 3) === domainBase.slice(0, 3))
                );
              });

              if (brandMatches.length > 0) {
                // Sort by exact match priority and active ad count
                brandMatches.sort((a, b) => {
                  const aNorm = a.displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const bNorm = b.displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const aExact = aNorm === domainBase || aNorm.startsWith(domainBase) ? 2 : 1;
                  const bExact = bNorm === domainBase || bNorm.startsWith(domainBase) ? 2 : 1;
                  if (aExact !== bExact) return bExact - aExact;
                  return b.count - a.count;
                });

                // Pick top primary match for canonical resolution
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
        // Multi-line NDJSON fallback
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
      // Ignore non-JSON or response stream read errors
    }
  };

  page.on("response", handleResponse);

  try {
    // Ensure effective country parameter is set (replace country=ALL with tracked country or TN default)
    let finalTargetUrl = targetUrl;
    try {
      const parsedUrl = new URL(targetUrl.match(/^https?:\/\//i) ? targetUrl : `https://${targetUrl}`);
      if (!parsedUrl.searchParams.get("view_all_page_id") && !parsedUrl.searchParams.get("id")) {
        console.warn(`[Spy Scanner] Target URL does not contain explicit view_all_page_id parameter: "${targetUrl}"`);
      }
      const currentCountry = parsedUrl.searchParams.get("country");
      const effectiveCountry = country && country !== "ALL" ? country : "TN";

      if (!currentCountry || currentCountry === "ALL") {
        parsedUrl.searchParams.set("country", effectiveCountry);
        if (!currentCountry) {
          parsedUrl.searchParams.set("is_targeted_country", "false");
        }
        finalTargetUrl = parsedUrl.toString();
      }
    } catch {
      // keep original targetUrl fallback
    }

    await page.goto(finalTargetUrl, {
      waitUntil: "networkidle",
      timeout: RESPONSE_TIMEOUT_MS,
    });

    // Check page state for real CAPTCHA / Security Check challenges
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
        outcomeDetails: "CAPTCHA challenge detected on navigation",
      };
    }

    // 2. Pre-scan live result count update before creative extraction
    try {
      const bodyText = await page.evaluate(() => document.body?.innerText || "");
      const parsedOutcome = parseResultCountFromText(bodyText);

      if (parsedOutcome.status === "success" && parsedOutcome.results !== null) {
        const liveResults = parsedOutcome.results;
        const now = new Date();
        const lastScan = await db.query.scanHistory.findFirst({
          where: eq(scanHistory.trackedPageId, trackedPageId),
          orderBy: [sql`${scanHistory.checkedAt} desc`],
        });

        let difference: number | null = null;
        if (lastScan?.results !== null && lastScan?.results !== undefined) {
          difference = liveResults - lastScan.results;
        }

        await db.insert(scanHistory).values({
          trackedPageId,
          results: liveResults,
          difference,
          checkedAt: now,
          status: "success",
        });

        await db
          .update(trackedPages)
          .set({
            currentResults: liveResults,
            lastChecked: now,
            lastSuccessAt: now,
            updatedAt: now,
          })
          .where(eq(trackedPages.id, trackedPageId));

        console.log(
          `[Spy Scanner] Pre-scan live result count updated: ${liveResults} (difference: ${difference ?? "N/A"})`
        );
      }
    } catch (countErr) {
      console.warn("[Spy Scanner] Pre-scan live result count extraction failed, continuing creative extraction:", countErr);
    }

    // 3. Scroll loop to trigger infinite loading payloads
    let lastSize = collectedAds.size;
    let noProgressCount = 0;

    for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
      if (hasCaptchaOrBlock) break;
      if (isRateLimited) break;

      graphqlResponseReceived = false;

      // Scroll down container & window to trigger GraphQL pagination
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
          feedContainer.scrollBy(0, 1600);
          feedContainer.scrollTop = feedContainer.scrollHeight;
        }

        window.scrollBy(0, 1600);
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Adaptive response-aware polling wait
      const waitStart = Date.now();
      while (!graphqlResponseReceived && Date.now() - waitStart < SCROLL_WAIT_MS) {
        await page.waitForTimeout(300);
      }

      // Interleaved DOM extraction every 5 scroll iterations to catch virtualized cards
      if (i % 5 === 4) {
        const tempDomAds = await extractAdsFromDOM(page, trackedPageId);
        for (const ad of tempDomAds) {
          if (!collectedAds.has(ad.adArchiveId)) {
            collectedAds.set(ad.adArchiveId, ad);
          }
        }
      }

      const currentSize = collectedAds.size;
      if (currentSize === lastSize) {
        noProgressCount++;
        if (noProgressCount >= NO_PROGRESS_CAP) break; // No new ads coming in
      } else {
        noProgressCount = 0;
        lastSize = currentSize;
      }
    }

    if (isRateLimited) {
      return {
        status: "failed",
        extractedCount: collectedAds.size,
        failureReason: "rate_limited",
        outcomeDetails: "Rate limited by Meta (HTTP 429)",
      };
    }

    // 4. ALWAYS run final DOM deep scan alongside GraphQL extraction to capture all visible cards
    console.log(`[Spy Scanner] GraphQL captured ${collectedAds.size} items. Executing final DOM deep scan to merge visible cards...`);
    const domAds = await extractAdsFromDOM(page, trackedPageId);
    let domMergedCount = 0;

    for (const ad of domAds) {
      if (!collectedAds.has(ad.adArchiveId)) {
        collectedAds.set(ad.adArchiveId, ad);
        domMergedCount++;
      } else {
        // Enrich existing GraphQL node with DOM attributes if missing
        const isLogoUrl = (url: string | null) =>
          url ? /_s60x60|_s50x50|_s100x100|_p60x60|_p50x50|s60x60|p60x60|s50x50|s100x100/i.test(url) || url.includes("profile") || url.includes("avatar") : false;

        const existing = collectedAds.get(ad.adArchiveId)!;
        if (!existing.caption && ad.caption) existing.caption = ad.caption;
        if (!existing.linkUrl && ad.linkUrl) existing.linkUrl = ad.linkUrl;
        if ((!existing.thumbnailUrl || isLogoUrl(existing.thumbnailUrl)) && ad.thumbnailUrl && !isLogoUrl(ad.thumbnailUrl)) {
          existing.thumbnailUrl = ad.thumbnailUrl;
        }
      }
    }
    // Collect unique Facebook Page IDs found during scan (from GraphQL ads & deep DOM inspection)
    const extractedPageIdsSet = new Set<string>();
    for (const adData of collectedAds.values()) {
      if (adData.pageId && adData.pageId !== "0" && adData.pageId.trim() !== "") {
        extractedPageIdsSet.add(adData.pageId.trim());
      }
    }

    const pageInfos = await extractPageIdsFromPage(page);
    for (const pInfo of pageInfos) {
      if (pInfo.pageId && pInfo.pageId !== "0") {
        extractedPageIdsSet.add(pInfo.pageId.trim());
      }
    }

    // Add canonical Page IDs from dynamic_filter_options.pages (most authoritative source)
    for (const pageId of canonicalPageIdsFromFilter.keys()) {
      extractedPageIdsSet.add(pageId);
    }

    const now = new Date();
    const extractedPageIds = Array.from(extractedPageIdsSet);

    if (collectedAds.size === 0) {
      // Check if DOM explicitly loaded and indicates a verified zero state (e.g. "0 results" or "no active ads")
      const isVerifiedZeroState = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        return (
          /0 results|no ads match|no active ads|0 total ads/i.test(text) &&
          !/security check|confirm it'?s you/i.test(text)
        );
      });

      if (isVerifiedZeroState) {
        console.log(`[Spy Scanner] 🟢 Verified ZERO active ads for tracked page ${trackedPageId}. Running reconciliation...`);
        const { reconcileArchivedAds } = await import("../lib/ad-reconciliation");
        await reconcileArchivedAds(trackedPageId, creativeScanId, new Set(), now, { isVerifiedZeroState: true });

        await db
          .update(trackedPages)
          .set({ lastCreativeScan: now, updatedAt: now })
          .where(eq(trackedPages.id, trackedPageId));

        return {
          status: "completed",
          extractedCount: 0,
          extractedPageIds,
          outcomeDetails: "Verified 0 active ads on page. Completed full scan and archival reconciliation.",
        };
      }

      if (extractedPageIds.length > 0) {
        const names = extractedPageIds.map(id => canonicalPageIdsFromFilter.get(id) || id).join(", ");
        console.log(`[Spy Scanner] 0 ad payloads but resolved ${extractedPageIds.length} canonical Page ID(s) from dynamic filter: ${names}`);
      }
      return {
        status: "failed",
        extractedCount: 0,
        extractedPageIds,
        failureReason: "payload_not_found",
        outcomeDetails: "No GraphQL ad payloads or DOM ad cards captured during scan",
      };
    }

    // 4. Save extracted ads and observations transactionally
    let savedCount = 0;

    for (const adData of collectedAds.values()) {
      // Best-effort thumbnail caching (prioritizes B2)
      const { storagePath, publicUrl } = await cacheThumbnail(
        adData.adArchiveId,
        adData.thumbnailUrl
      );

      // Best-effort B2 video caching if configured
      let finalMediaUrls = adData.mediaUrls || [];
      if (isB2Configured() && adData.mediaType === "video" && finalMediaUrls.length > 0) {
        const b2VideoUrls = await Promise.all(
          finalMediaUrls.map(async (url, idx) => {
            if (url.includes("backblazeb2.com") || url.includes("/api/spy/b2-media")) return url;
            const b2Url = await uploadMediaFromUrlToB2(url, "videos", `${adData.adArchiveId}_${idx}`);
            return b2Url || url;
          })
        );
        finalMediaUrls = b2VideoUrls;
      }

      // Upsert canonical ad record
      const [upsertedAd] = await db
        .insert(ads)
        .values({
          adArchiveId: adData.adArchiveId,
          pageId: adData.pageId,
          pageName: adData.pageName,
          startedRunningOn: adData.startedRunningOn,
          caption: adData.caption,
          title: adData.title,
          ctaText: adData.ctaText,
          linkUrl: adData.linkUrl,
          mediaType: adData.mediaType,
          mediaUrls: finalMediaUrls,
          thumbnailUrl: publicUrl || adData.thumbnailUrl,
          thumbnailStoragePath: storagePath,
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
            mediaUrls: finalMediaUrls,
            thumbnailUrl: publicUrl || adData.thumbnailUrl,
            thumbnailStoragePath: storagePath || ads.thumbnailStoragePath,
            lastSeenAt: now,
            updatedAt: now,
            isArchived: false,
            archivedAt: null,
          },
        })
        .returning();

      // Insert ad observation snapshot for this scan
      if (upsertedAd) {
        await db.insert(adObservations).values({
          creativeScanId,
          adId: upsertedAd.id,
          trackedPageId,
          isActive: adData.isActive,
          duplicationCount: adData.duplicationCount,
          collationId: adData.collationId,
          observedAt: now,
        });
        savedCount++;
      }
    }

    const finalStatus: "completed" | "partial" =
      noProgressCount >= NO_PROGRESS_CAP ? "completed" : "partial";

    // Reconcile missing ads ONLY on completed full page scans to prevent partial scan data corruption
    if (savedCount > 0 && finalStatus === "completed") {
      const currentlyObservedArchiveIds = new Set(
        Array.from(collectedAds.values()).map((a) => a.adArchiveId)
      );
      const { reconcileArchivedAds } = await import("../lib/ad-reconciliation");
      await reconcileArchivedAds(trackedPageId, creativeScanId, currentlyObservedArchiveIds, now);
    }

    // Update tracked page last_creative_scan
    await db
      .update(trackedPages)
      .set({
        lastCreativeScan: now,
        updatedAt: now,
      })
      .where(eq(trackedPages.id, trackedPageId));

    return {
      status: finalStatus,
      extractedCount: savedCount,
      extractedPageIds,
      outcomeDetails: `Successfully extracted and normalized ${savedCount} ad creatives.`,
    };
  } catch (err: any) {
    return {
      status: "failed",
      extractedCount: collectedAds.size,
      failureReason: "timeout",
      outcomeDetails: err.message || "Creative scan failed",
    };
  } finally {
    page.off("response", handleResponse);
  }
}

