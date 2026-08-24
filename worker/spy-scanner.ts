import { Page, Response } from "playwright";
import { db } from "../db";
import { ads, adObservations, creativeScans, trackedPages, scanHistory } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { cacheThumbnail } from "./thumbnail-cache";
import { extractAdsFromDOM, extractPageIdsFromPage } from "./dom-scanner";
import { uploadMediaFromUrlToB2, uploadMediaWithHashing, uploadStoryboardFrames, isB2Configured } from "../lib/b2-storage";
import { extractStoryboardFrames } from "../lib/video-storyboard";
import { extractMedia } from "../lib/apify-ingest";
import { parseResultCountFromText } from "./scanner";
import { resolveDestinationUrl } from "../lib/utils";
import { linkAndAutoScrapeProduct } from "../lib/product-ingest";

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

    // 3. Query tracked page record to get the official numeric pageId if present
    const trackedPageRecord = await db.query.trackedPages.findFirst({
      where: eq(trackedPages.id, trackedPageId),
      columns: { pageId: true, displayName: true, searchType: true },
    });
    const fallbackNumericPageId = (trackedPageRecord?.pageId && trackedPageRecord.pageId !== "0" && !trackedPageRecord.pageId.includes("-"))
      ? trackedPageRecord.pageId
      : "0";

    // Scroll loop to trigger infinite loading payloads
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
        const tempDomAds = await extractAdsFromDOM(page, fallbackNumericPageId);
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

    // 4. Fallback DOM deep scan only if GraphQL captured 0 items
    if (collectedAds.size === 0) {
      console.log(`[Spy Scanner] GraphQL captured 0 items. Executing DOM deep scan fallback...`);
      const domAds = await extractAdsFromDOM(page, fallbackNumericPageId);
      for (const ad of domAds) {
        if (!collectedAds.has(ad.adArchiveId)) {
          collectedAds.set(ad.adArchiveId, ad);
        }
      }
    } else {
      console.log(`[Spy Scanner] ⚡ GraphQL successfully captured ${collectedAds.size} items directly! Skipping redundant DOM scan.`);
    }

    // Collect unique Facebook Page IDs found during scan (from GraphQL ads & deep DOM inspection)
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

      // Close heavy browser page now that scraping is finished
      await page.close().catch(() => {});

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

    // Close the heavy Facebook Ad Library browser tab immediately to release 1.5GB+ RAM
    console.log(`[Spy Scanner] 🧹 Closing heavy Facebook browser tab to free RAM before frame extraction...`);
    await page.close().catch(() => {});

    // 4. Save extracted ads and observations transactionally
    let savedCount = 0;

    for (const adData of collectedAds.values()) {
      let finalMediaUrls = adData.mediaUrls || [];
      let finalThumbnailUrl = adData.thumbnailUrl;
      let storagePath: string | null = null;
      let mediaHash: string | null = null;
      let perceptualHash: string | null = null;
      let storyboardUrls: string[] | null = null;

      if (isB2Configured()) {
        // 1. Best-effort B2 thumbnail caching & perceptual hash
        if (finalThumbnailUrl) {
          try {
            const res = await uploadMediaWithHashing(finalThumbnailUrl, "thumbnails", `${adData.adArchiveId}_thumb`);
            if (res && res.url) {
              finalThumbnailUrl = res.url;
              storagePath = `b2/thumbnails/${adData.adArchiveId}.jpg`;
              mediaHash = res.mediaHash;
              perceptualHash = res.perceptualHash;
            }
          } catch (e: any) {
            console.warn(`[Spy Scanner] Thumbnail B2 upload error for ${adData.adArchiveId}:`, e.message);
          }
        }

        // 2. Best-effort B2 media caching for all types (video, image, carousel slides)
        if (finalMediaUrls.length > 0) {
          const isVid = adData.mediaType === "video" || finalMediaUrls.some((u) => u.includes(".mp4"));
          const firstVid = finalMediaUrls.find((u) => u.includes(".mp4") || u.includes("/videos/"));

          // 2a. Extract 5-shot storyboard frames for video ad hover scrubbing
          if (isVid && firstVid) {
            try {
              const frames = await extractStoryboardFrames(firstVid, 5);
              if (frames.length > 0) {
                const uploaded = await uploadStoryboardFrames(frames, adData.adArchiveId);
                if (uploaded.length > 0) {
                  storyboardUrls = uploaded;
                }
              }
            } catch (e: any) {
              console.warn(`[Spy Scanner] Storyboard extraction error for ${adData.adArchiveId}:`, e.message);
            }
          }

          const b2MediaUrls = await Promise.all(
            finalMediaUrls.map(async (url, idx) => {
              if (url.includes("backblazeb2.com") || url.includes("/api/spy/b2-media") || url.includes("files.catbox.moe")) return url;
              const isUrlVid = adData.mediaType === "video" || url.includes(".mp4");
              
              // Skip uploading heavy full MP4 to storage to save 99.8% bandwidth & storage
              if (isUrlVid) return url;

              // Upload image assets & carousel slides
              try {
                const res = await uploadMediaWithHashing(url, "images", `${adData.adArchiveId}_${idx}`);
                if (res && res.url) {
                  if (!mediaHash) mediaHash = res.mediaHash;
                  if (!perceptualHash) perceptualHash = res.perceptualHash;
                  return res.url;
                }
              } catch (e: any) {
                console.warn(`[Spy Scanner] Media upload error for ${adData.adArchiveId}_${idx}:`, e.message);
              }
              return url;
            })
          );
          finalMediaUrls = b2MediaUrls;

          // If thumbnail was missing or null, pick first image URL (never an MP4 video)
          if (!finalThumbnailUrl && finalMediaUrls.length > 0) {
            const firstImage = finalMediaUrls.find((u) => !u.includes(".mp4") && !u.includes("/videos/"));
            if (firstImage) {
              finalThumbnailUrl = firstImage;
            }
          }
        }
      } else {
        // Fallback to Supabase thumbnail caching if B2 not configured
        const cached = await cacheThumbnail(
          adData.adArchiveId,
          adData.thumbnailUrl
        );
        if (cached.publicUrl) {
          finalThumbnailUrl = cached.publicUrl;
          storagePath = cached.storagePath;
        }
      }

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
          mediaUrls: finalMediaUrls,
          thumbnailUrl: finalThumbnailUrl,
          thumbnailStoragePath: storagePath,
          storyboardUrls: storyboardUrls,
          mediaHash,
          perceptualHash,
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
            thumbnailUrl: finalThumbnailUrl || ads.thumbnailUrl,
            thumbnailStoragePath: storagePath || ads.thumbnailStoragePath,
            ...(storyboardUrls && storyboardUrls.length > 0 ? { storyboardUrls } : {}),
            ...(mediaHash ? { mediaHash } : {}),
            ...(perceptualHash ? { perceptualHash } : {}),
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

        // Automated Product Landing Page Extraction & Background Scraper Trigger
        if (adData.linkUrl) {
          linkAndAutoScrapeProduct({
            adId: upsertedAd.id,
            linkUrl: adData.linkUrl,
            pageId: trackedPageId,
            adCopy: adData.caption,
          }).catch((e) => console.warn(`[Worker Spy Scanner] Auto-scrape product warning:`, e.message));
        }

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
      await reconcileArchivedAds(trackedPageId, creativeScanId, currentlyObservedArchiveIds, now, {
        isFullScan: true,
      });
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

