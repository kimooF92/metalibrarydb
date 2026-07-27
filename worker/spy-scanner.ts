import { Page, Response } from "playwright";
import { db } from "../db";
import { ads, adObservations, creativeScans, trackedPages } from "../db/schema";
import { eq } from "drizzle-orm";
import { cacheThumbnail } from "./thumbnail-cache";
import { extractAdsFromDOM } from "./dom-scanner";
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
  failureReason?: "captcha" | "rate_limited" | "payload_not_found" | "parse_error" | "timeout";
  outcomeDetails?: string;
}

// Configurable constants
const MAX_SCROLL_ATTEMPTS = 30;
const NO_PROGRESS_CAP = 5;
const SCROLL_WAIT_MS = 1800;
const RESPONSE_TIMEOUT_MS = 30000;

/**
 * Extract normalized ad attributes from Meta GraphQL payload node
 */
function parseAdGraphQLNode(node: any): ExtractedAdData | null {
  try {
    const adArchiveId =
      node.adArchiveID || node.ad_archive_id || node.id || node.adArchiveId;
    if (!adArchiveId) return null;

    const pageId = node.pageID || node.page_id || node.publisherPlatformPageId || "";
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

    if (Array.isArray(snapshot.cards) && snapshot.cards.length > 1) {
      mediaType = "carousel";
      for (const card of snapshot.cards) {
        if (card.resized_image_url) mediaUrls.push(card.resized_image_url);
        if (card.video_hd_url) mediaUrls.push(card.video_hd_url);
      }
      thumbnailUrl = snapshot.cards[0]?.resized_image_url || null;
    } else if (snapshot.videos && snapshot.videos.length > 0) {
      mediaType = "video";
      const video = snapshot.videos[0];
      if (video.video_hd_url) mediaUrls.push(video.video_hd_url);
      if (video.video_sd_url) mediaUrls.push(video.video_sd_url);
      thumbnailUrl = video.video_preview_image_url || video.preview_image_url || null;
    } else if (snapshot.images && snapshot.images.length > 0) {
      mediaType = "image";
      for (const img of snapshot.images) {
        const url = img.resized_image_url || img.original_image_url || img.src;
        if (url) mediaUrls.push(url);
      }
      thumbnailUrl = mediaUrls[0] || null;
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
  if (obj.ad_archive_nodes || obj.results || obj.edges || obj.ads) {
    const list = obj.ad_archive_nodes || obj.results || obj.edges || obj.ads;
    if (Array.isArray(list)) {
      for (const item of list) {
        const targetNode = item.node || item;
        const parsed = parseAdGraphQLNode(targetNode);
        if (parsed) collectedMap.set(parsed.adArchiveId, parsed);
      }
    }
  }

  // Recurse into object properties
  for (const key of Object.keys(obj)) {
    if (key !== "snapshot" && typeof obj[key] === "object") {
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
  creativeScanId: string
): Promise<SpyScanOutcome> {
  const collectedAds = new Map<string, ExtractedAdData>();
  let hasCaptchaOrBlock = false;
  let isRateLimited = false;

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

      const text = await response.text();
      const json = JSON.parse(text);
      if (json.errors && Array.isArray(json.errors)) {
        const hasSecurityErr = json.errors.some((e: any) =>
          /captcha|security check|unusual activity/i.test(e.message || "")
        );
        if (hasSecurityErr) {
          hasCaptchaOrBlock = true;
          return;
        }
      }

      extractAdsFromJSON(json, collectedAds);
    } catch {
      // Ignore non-JSON or response stream read errors
    }
  };

  page.on("response", handleResponse);

  try {
    // Preserve targetUrl's explicit country filter if set (essential for keyword searches like TN/US), otherwise default to country=ALL
    let finalTargetUrl = targetUrl;
    try {
      const parsedUrl = new URL(targetUrl);
      if (!parsedUrl.searchParams.get("country")) {
        parsedUrl.searchParams.set("country", "ALL");
        parsedUrl.searchParams.set("is_targeted_country", "false");
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

    // 3. Scroll loop to trigger infinite loading payloads
    let lastSize = collectedAds.size;
    let noProgressCount = 0;

    for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
      if (hasCaptchaOrBlock) break;
      if (isRateLimited) break;

      // Scroll down deep to trigger GraphQL pagination
      await page.evaluate(() => {
        window.scrollBy(0, 1600);
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(SCROLL_WAIT_MS);

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

    // 4. ALWAYS run DOM deep scan alongside GraphQL extraction to capture all visible cards
    console.log(`[Spy Scanner] GraphQL captured ${collectedAds.size} items. Executing DOM deep scan to merge visible cards...`);
    const domAds = await extractAdsFromDOM(page, trackedPageId);
    let domMergedCount = 0;

    for (const ad of domAds) {
      if (!collectedAds.has(ad.adArchiveId)) {
        collectedAds.set(ad.adArchiveId, ad);
        domMergedCount++;
      } else {
        // Enrich existing GraphQL node with DOM attributes if missing
        const existing = collectedAds.get(ad.adArchiveId)!;
        if (!existing.caption && ad.caption) existing.caption = ad.caption;
        if (!existing.linkUrl && ad.linkUrl) existing.linkUrl = ad.linkUrl;
        if (!existing.thumbnailUrl && ad.thumbnailUrl) existing.thumbnailUrl = ad.thumbnailUrl;
      }
    }
    console.log(`[Spy Scanner] DOM deep scan merged ${domMergedCount} additional unique cards (Total captured: ${collectedAds.size}).`);

    if (collectedAds.size === 0) {
      return {
        status: "failed",
        extractedCount: 0,
        failureReason: "payload_not_found",
        outcomeDetails: "No GraphQL ad payloads or DOM ad cards captured during scan",
      };
    }

    // 4. Save extracted ads and observations transactionally
    const now = new Date();
    let savedCount = 0;

    for (const adData of collectedAds.values()) {
      // Best-effort thumbnail caching
      const { storagePath, publicUrl } = await cacheThumbnail(
        adData.adArchiveId,
        adData.thumbnailUrl
      );

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
          mediaUrls: adData.mediaUrls,
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
            caption: adData.caption,
            title: adData.title,
            ctaText: adData.ctaText,
            linkUrl: adData.linkUrl,
            mediaType: adData.mediaType,
            mediaUrls: adData.mediaUrls,
            thumbnailUrl: publicUrl || adData.thumbnailUrl,
            thumbnailStoragePath: storagePath || ads.thumbnailStoragePath,
            lastSeenAt: now,
            updatedAt: now,
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

    // Update tracked page last_creative_scan
    await db
      .update(trackedPages)
      .set({
        lastCreativeScan: now,
        updatedAt: now,
      })
      .where(eq(trackedPages.id, trackedPageId));

    const finalStatus: "completed" | "partial" =
      noProgressCount >= NO_PROGRESS_CAP ? "completed" : "partial";

    return {
      status: finalStatus,
      extractedCount: savedCount,
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
