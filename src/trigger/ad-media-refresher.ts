import { chromium, Browser, BrowserContext, Page } from "playwright";
import { db } from "../../db";
import { ads, adObservations } from "../../db/schema";
import { eq } from "drizzle-orm";
import { deleteByPrefix } from "../../lib/cache-service";

export interface RefreshAdMediaOptions {
  adId?: string;
  adArchiveId?: string;
  force?: boolean;
}

export interface RefreshAdMediaResult {
  success: boolean;
  adId?: string;
  adArchiveId?: string;
  isActive?: boolean;
  isArchived?: boolean;
  mediaUrls?: string[];
  thumbnailUrl?: string | null;
  refreshedVideoUrl?: string | null;
  refreshedThumbnailUrl?: string | null;
  message?: string;
  error?: string;
}

/**
 * Core engine to refresh single ad media and active status via Playwright.
 * Runs inside Trigger.dev Cloud container with dedicated Playwright Chromium.
 */
export async function refreshSingleAdMedia(
  options: RefreshAdMediaOptions
): Promise<RefreshAdMediaResult> {
  const { adId, adArchiveId: inputArchiveId, force } = options;

  if (!adId && !inputArchiveId) {
    return { success: false, error: "Missing adId or adArchiveId" };
  }

  // 1. Fetch target ad record with strict projection
  const [adRecord] = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      mediaUrls: ads.mediaUrls,
      thumbnailUrl: ads.thumbnailUrl,
      mediaType: ads.mediaType,
      pageId: ads.pageId,
      pageName: ads.pageName,
      isArchived: ads.isArchived,
      lastSeenAt: ads.lastSeenAt,
    })
    .from(ads)
    .where(adId ? eq(ads.id, adId) : eq(ads.adArchiveId, inputArchiveId!))
    .limit(1);

  if (!adRecord) {
    return { success: false, error: "Ad not found in database" };
  }

  const archiveId = adRecord.adArchiveId || inputArchiveId;
  if (!archiveId) {
    return { success: false, error: "Ad lacks archive ID" };
  }

  const adArchiveUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${archiveId}`;

  // 2. Check if media is already permanently preserved on Backblaze B2
  const b2Endpoint = process.env.B2_ENDPOINT || "backblazeb2.com";
  const hasB2Video = adRecord.mediaUrls?.some((u) => u.includes(b2Endpoint) || u.includes("b2/"));
  const hasB2Thumb = adRecord.thumbnailUrl?.includes(b2Endpoint) || adRecord.thumbnailUrl?.includes("b2/");

  if (hasB2Video && hasB2Thumb && !force) {
    const [obs] = await db
      .select({ isActive: adObservations.isActive })
      .from(adObservations)
      .where(eq(adObservations.adId, adRecord.id))
      .limit(1);

    const isActiveState = obs?.isActive !== null && obs?.isActive !== undefined ? Boolean(obs.isActive) : true;
    return {
      success: true,
      adId: adRecord.id,
      adArchiveId: archiveId,
      isActive: isActiveState,
      mediaUrls: adRecord.mediaUrls || [],
      thumbnailUrl: adRecord.thumbnailUrl,
      message: "Media is permanently preserved in Backblaze B2 storage.",
    };
  }

  // 3. Launch headless Playwright session
  const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({
      headless: isHeadless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--disable-blink-features=AutomationControlled",
        "--disable-extensions",
        "--mute-audio",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });

    context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
      },
      proxy: process.env.SCRAPING_PROXY_URL ? { server: process.env.SCRAPING_PROXY_URL } : undefined,
    });

    page = await context.newPage();

    const interceptedVideos: string[] = [];
    const interceptedImages: string[] = [];

    // Intercept network media streams
    page.on("response", async (response) => {
      try {
        const resUrl = response.url();
        const contentType = response.headers()["content-type"] || "";

        if (resUrl.includes("fbcdn.net") || resUrl.includes("facebook.com")) {
          if (resUrl.includes(".mp4") || contentType.includes("video/mp4")) {
            interceptedVideos.push(resUrl);
          } else if (
            (resUrl.includes(".jpg") || resUrl.includes(".png") || contentType.includes("image/")) &&
            !resUrl.includes("rsrc.php")
          ) {
            interceptedImages.push(resUrl);
          }
        }
      } catch {}
    });

    console.log(`[Ad Media Refresher] Opening Meta Ad Library: ${adArchiveUrl}`);
    await page.goto(adArchiveUrl, {
      waitUntil: "domcontentloaded",
      timeout: parseInt(process.env.PAGE_TIMEOUT || "30000", 10),
    });

    // Wait for Meta hydration
    await page.waitForTimeout(3500);

    // 4. Evaluate page DOM for status and media elements
    const evaluation = await page.evaluate((targetId) => {
      const bodyText = document.body ? document.body.innerText || document.body.textContent || "" : "";

      // Check Rate Limit / CAPTCHA
      if (/confirm it'?s you|security check|enter the code below|unusual activity|prouvez que vous êtes un humain/i.test(bodyText)) {
        return { isRateLimited: true, isNotFound: false, isActive: false, isInactive: false, cardImages: [], videoPoster: null, videoSrc: null };
      }

      // Check Not Found / Expired
      const zeroAdRegex =
        /no\s+ads?\s+match|no\s+results?\s+found|no\s+active\s+ads|ad\s+isn['’]?t\s+in\s+the\s+ad\s+library|ad\s+is\s+not\s+in\s+the\s+ad\s+library|aucun\s+résultat|sin\s+resultados|keine\s+ergebnisse|this\s+ad\s+has\s+expired|ad\s+not\s+found|ce\s+contenu\s+n'est\s+pas\s+disponible/i;

      if (zeroAdRegex.test(bodyText) || /\b0\s+results\b/i.test(bodyText)) {
        return { isRateLimited: false, isNotFound: true, isActive: false, isInactive: true, cardImages: [], videoPoster: null, videoSrc: null };
      }

      // Find ad card container
      const allDivs = Array.from(document.querySelectorAll("div"));
      const candidateDivs = allDivs.filter((div) => {
        const text = div.textContent || "";
        return text.includes(targetId);
      });

      let targetCard: HTMLDivElement | null = null;
      for (const candidate of candidateDivs) {
        const cText = candidate.textContent || "";
        if (cText.length > 12000) continue;
        const hasCardLabels = /Sponsored|Sponsorisé|Started running|Lancé le|Active|Inactive|Inactif|Actif|نشط|غير نشط/i.test(cText);
        const hasMedia = candidate.querySelector('img[src*="fbcdn"], video') !== null;
        if (hasCardLabels || hasMedia) {
          targetCard = candidate as HTMLDivElement;
          break;
        }
      }

      if (!targetCard && candidateDivs.length > 0) {
        targetCard = (candidateDivs.find((d) => (d.textContent || "").length >= 80) || candidateDivs[0]) as HTMLDivElement;
      }

      const cardScope = targetCard || document.body;
      const cardText = cardScope.innerText || cardScope.textContent || "";

      const isInactive = /Inactive|Inactif|Inactivo|Inaktiv|غير نشط/i.test(cardText);
      const isActive = !isInactive && /Active|Actif|Activo|Aktiv|نشط|Started running|Lancé le/i.test(cardText);

      // Extract creative images (filter out avatars like /t39.30808-1/ and tiny icons)
      const allImgs = Array.from(cardScope.querySelectorAll('img[src*="fbcdn.net"], img[src*="scontent"]')) as HTMLImageElement[];
      const cardImages = allImgs
        .map((img) => img.src)
        .filter((src) => {
          if (!src || src.includes("rsrc.php")) return false;
          // Filter out profile avatar thumbnails
          if (src.includes("/t39.30808-1/") || src.includes("s148x148") || src.includes("s50x50")) return false;
          return true;
        });

      // Extract video element info
      const videoEl = cardScope.querySelector("video") as HTMLVideoElement | null;
      const videoPoster = videoEl ? videoEl.getAttribute("poster") : null;
      const videoSrc = videoEl && videoEl.src && videoEl.src.startsWith("http") && !videoEl.src.startsWith("blob:") ? videoEl.src : null;

      return {
        isRateLimited: false,
        isNotFound: false,
        isActive,
        isInactive,
        cardImages,
        videoPoster,
        videoSrc,
      };
    }, archiveId);

    if (evaluation.isRateLimited) {
      return {
        success: false,
        adId: adRecord.id,
        adArchiveId: archiveId,
        error: "Rate limited or CAPTCHA required by Meta",
      };
    }

    const isAdActive = evaluation.isActive && !evaluation.isInactive && !evaluation.isNotFound;

    // 5. Consolidate media URLs
    let discoveredVideoUrl: string | null = evaluation.videoSrc || null;
    if (!discoveredVideoUrl && interceptedVideos.length > 0) {
      // Pick the most recent video MP4 stream
      discoveredVideoUrl = interceptedVideos[interceptedVideos.length - 1];
    }

    let discoveredThumbnailUrl: string | null = evaluation.videoPoster || null;
    if (!discoveredThumbnailUrl && evaluation.cardImages.length > 0) {
      discoveredThumbnailUrl = evaluation.cardImages[0];
    } else if (!discoveredThumbnailUrl && interceptedImages.length > 0) {
      discoveredThumbnailUrl = interceptedImages.find((u) => u.includes("600x600") || u.includes("1080x1080")) || interceptedImages[0];
    }

    const discoveredImages = evaluation.cardImages.length > 0 ? evaluation.cardImages : interceptedImages.slice(0, 5);

    // 6. Direct media URLs (B2 storage disabled to conserve storage quota)
    const finalVideoUrl = discoveredVideoUrl;
    const finalThumbnailUrl = discoveredThumbnailUrl;

    // 7. Update Database: adObservations and ads table
    await db
      .update(adObservations)
      .set({
        isActive: isAdActive,
        observedAt: new Date(),
      })
      .where(eq(adObservations.adId, adRecord.id));

    const updatedMediaUrls = finalVideoUrl
      ? [finalVideoUrl, ...(adRecord.mediaUrls?.filter((u) => u !== finalVideoUrl) || [])]
      : discoveredImages.length > 0
      ? discoveredImages
      : adRecord.mediaUrls || [];

    await db
      .update(ads)
      .set({
        mediaUrls: updatedMediaUrls,
        thumbnailUrl: finalThumbnailUrl || adRecord.thumbnailUrl,
        updatedAt: new Date(),
        ...(isAdActive
          ? {
              isArchived: false,
              archivedAt: null,
              lastSeenAt: new Date(),
            }
          : {}),
      })
      .where(eq(ads.id, adRecord.id));

    // Non-blocking Redis cache invalidation
    deleteByPrefix("cache:spy_ads:").catch(() => {});

    return {
      success: true,
      adId: adRecord.id,
      adArchiveId: archiveId,
      isActive: isAdActive,
      isArchived: isAdActive ? false : Boolean(adRecord.isArchived),
      mediaUrls: updatedMediaUrls,
      thumbnailUrl: finalThumbnailUrl || adRecord.thumbnailUrl,
      refreshedVideoUrl: finalVideoUrl,
      refreshedThumbnailUrl: finalThumbnailUrl,
      message: isAdActive
        ? "Media refreshed and ad is actively running on Meta."
        : "Media refreshed. Meta confirms ad has ended (inactive).",
    };
  } catch (err: any) {
    console.error(`[Ad Media Refresher Error for ${archiveId}]:`, err);
    return {
      success: false,
      adId: adRecord.id,
      adArchiveId: archiveId,
      error: err?.message || "Failed to refresh ad media",
    };
  } finally {
    if (page && !page.isClosed()) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

