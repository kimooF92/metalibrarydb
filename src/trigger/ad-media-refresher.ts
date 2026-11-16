import { chromium, Browser, BrowserContext, Page } from "playwright";
import { db } from "../../db";
import { ads, adObservations } from "../../db/schema";
import { eq } from "drizzle-orm";
import { deleteByPrefix } from "../../lib/cache-service";
import {
  consolidateRefreshedMedia,
  isZeroAdResultText,
  isRateLimitedText,
  isInactiveCardText,
  isActiveCardText,
} from "../../lib/ad-media-utils";

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
      archivedAt: ads.archivedAt,
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
    const launchOptions: any = {
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
    };
    if (process.env.CHROME_CHANNEL) {
      launchOptions.channel = process.env.CHROME_CHANNEL;
    } else if (process.platform === "win32") {
      launchOptions.channel = "chrome";
    }

    browser = await chromium.launch(launchOptions);

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
      timeout: parseInt(process.env.PAGE_TIMEOUT || "45000", 10),
    });

    // Wait for Meta hydration / secondary navigation
    try {
      await page.waitForFunction(
        () => {
          const text = document.body ? document.body.innerText || "" : "";
          return (
            text.includes("Lien vers la publicité") ||
            text.includes("Cette publicité provient") ||
            text.includes("This ad has multiple versions") ||
            text.includes("Link to ad") ||
            text.includes("Library ID") ||
            text.includes("ID dans la bibliothèque") ||
            text.includes("0 results") ||
            text.includes("aucun résultat") ||
            text.includes("security check") ||
            text.includes("confirm it's you")
          );
        },
        { timeout: 15000 }
      );
    } catch {
      await page.waitForTimeout(5000);
    }
    // Buffer for video element and media elements to mount in the DOM
    await page.waitForTimeout(2000);

    // 4. Evaluate page DOM for status and media elements
    const evaluation = await page.evaluate((targetId) => {
      const bodyText = document.body ? document.body.innerText || document.body.textContent || "" : "";

      // Check Rate Limit / CAPTCHA
      if (/confirm it'?s you|security check|enter the code below|unusual activity|prouvez que vous êtes un humain|rate limit exceeded|too many requests|temporarily blocked/i.test(bodyText)) {
        return { isRateLimited: true, isNotFound: false, isActive: false, isInactive: false, cardImages: [], videoPoster: null, videoSrc: null, hasVideoElement: false };
      }

      // Check Not Found / Expired (only when no modal is open)
      const zeroAdRegex =
        /no\s+ads?\s+match|no\s+results?\s+found|no\s+active\s+ads|ad\s+isn['’]?t\s+in\s+the\s+ad\s+library|ad\s+is\s+not\s+in\s+the\s+ad\s+library|aucun\s+résultat|sin\s+resultados|keine\s+ergebnisse|there\s+are\s+no\s+ads|0\s+matching\s+ads|0\s+ads\s+match|aucun\s+résultat\s+ne\s+correspond|ningún\s+anuncio\s+coincide|keine\s+anzeigen\s+stimmen|this\s+ad\s+has\s+expired|ad\s+not\s+found|ce\s+contenu\s+n'est\s+pas\s+disponible|ne\s+figure\s+pas\s+dans\s+la\s+bibliothèque|الإعلان\s+غير\s+موجود|\b0\s+results\b|~\s?0\s+results/i;

      if (zeroAdRegex.test(bodyText) && !bodyText.includes("Lien vers la publicité") && !bodyText.includes("Cette publicité provient")) {
        return { isRateLimited: false, isNotFound: true, isActive: false, isInactive: true, cardImages: [], videoPoster: null, videoSrc: null, hasVideoElement: false };
      }

      let targetCard: HTMLElement | null = null;
      const allDivs = Array.from(document.querySelectorAll("div"));

      // 1. PRIORITY: Modal Dialog (Meta opens a dialog when loading ?id=...)
      const modalContainers = allDivs.filter((d) => {
        const text = d.innerText || "";
        return (
          (text.includes("Lien vers la publicité") ||
            text.includes("Cette publicité provient d’une URL") ||
            text.includes("This ad has multiple versions") ||
            text.includes("Link to ad")) &&
          (text.includes(targetId) ||
            text.includes("ID dans la bibliothèque") ||
            text.includes("Library ID"))
        );
      });

      if (modalContainers.length > 0) {
        modalContainers.sort((a, b) => (b.innerText || "").length - (a.innerText || "").length);
        targetCard = modalContainers[0];
      }

      // 2. FALLBACK: Ad card container strictly containing targetId in visible text
      if (!targetCard) {
        const idRegex = new RegExp(`(?:Library ID|ID dans la bibliothèque|Identifiant|Identificador|معرّف المكتبة|ID)\\s*[:\\s]\\s*${targetId}\\b`, "i");

        const candidateDivs = allDivs.filter((div) => {
          // innerText excludes <script>, <style>, <noscript>
          const visibleText = div.innerText || "";
          return idRegex.test(visibleText) || visibleText.includes(targetId);
        });

        if (candidateDivs.length === 0) {
          // Target archive ID is not rendered in visible DOM (ad expired or removed, or page redirected to brand library)
          return { isRateLimited: false, isNotFound: true, isActive: false, isInactive: true, cardImages: [], videoPoster: null, videoSrc: null, hasVideoElement: false };
        }

        // Sort candidate divs by innerText length ASC to find the closest wrapper
        candidateDivs.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);

        for (const candidate of candidateDivs) {
          const cText = candidate.innerText || "";
          if (cText.length > 12000) continue;
          const hasCardLabels = /Sponsored|Sponsorisé|Started running|Lancé le|Active|Inactive|Inactif|Actif|نشط|غير نشط|See ad details/i.test(cText);
          const hasMedia = candidate.querySelector('img[src*="fbcdn"], img[src*="scontent"], video') !== null;
          if (hasCardLabels || hasMedia) {
            targetCard = candidate as HTMLDivElement;
            break;
          }
        }

        if (!targetCard) {
          targetCard = (candidateDivs.find((d) => (d.innerText || "").length >= 80) || candidateDivs[0]) as HTMLDivElement;
        }
      }

      if (!targetCard) {
        // Strictly prevent falling back to document.body!
        return { isRateLimited: false, isNotFound: true, isActive: false, isInactive: true, cardImages: [], videoPoster: null, videoSrc: null, hasVideoElement: false };
      }

      const cardText = targetCard.innerText || targetCard.textContent || "";

      const isInactive = /Inactive|Inactif|Inactivo|Inaktiv|غير نشط/i.test(cardText);
      const isActive = !isInactive && /Active|Actif|Activo|Aktiv|نشط|Started running|Lancé le|En cours|Diffusé/i.test(cardText);

      // Extract creative images strictly from targetCard
      const allImgs = Array.from(targetCard.querySelectorAll('img[src*="fbcdn.net"], img[src*="scontent"], img[src*="cdninstagram"]')) as HTMLImageElement[];
      const cardImages: string[] = [];

      for (const img of allImgs) {
        const src = img.currentSrc || img.src || "";
        if (!src || src.includes("rsrc.php") || src.startsWith("data:")) continue;
        // Filter out profile avatar thumbnails and icons
        if (/\/t39\.30808-1\/|s148x148|s50x50|s60x60|s100x100|_s\d+x\d+|_p\d+x\d+|\/profile\/|\/avatar\/|emoji/i.test(src)) continue;
        const isHeaderImg = !!img.closest('a[href*="facebook.com/"]') && !img.closest('div[class*="creative"]');
        if (isHeaderImg) continue;
        if (!cardImages.includes(src)) {
          cardImages.push(src);
        }
      }

      // Check background-image elements within targetCard
      const bgEls = Array.from(targetCard.querySelectorAll<HTMLElement>('div[style*="background-image"], span[style*="background-image"]'));
      for (const el of bgEls) {
        const style = el.getAttribute("style") || "";
        const bgMatch = style.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/i);
        if (bgMatch && bgMatch[1]) {
          const bgUrl = bgMatch[1];
          if ((bgUrl.includes("scontent") || bgUrl.includes("fbcdn") || bgUrl.includes("cdninstagram")) &&
              !/\/t39\.30808-1\/|s148x148|s50x50|_s\d+x\d+|_p\d+x\d+|\/profile\/|\/avatar\//i.test(bgUrl)) {
            if (!cardImages.includes(bgUrl)) {
              cardImages.push(bgUrl);
            }
          }
        }
      }

      // Extract video element info strictly from targetCard
      const videoEl = targetCard.querySelector("video") as HTMLVideoElement | null;
      const hasVideoElement = Boolean(videoEl);
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
        hasVideoElement,
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

    if (evaluation.isNotFound) {
      const now = new Date();
      await db
        .update(adObservations)
        .set({
          isActive: false,
          observedAt: now,
        })
        .where(eq(adObservations.adId, adRecord.id));

      await db
        .update(ads)
        .set({
          isArchived: true,
          archivedAt: adRecord.archivedAt || now,
          updatedAt: now,
        })
        .where(eq(ads.id, adRecord.id));

      deleteByPrefix("cache:spy_ads:").catch(() => {});

      return {
        success: true,
        adId: adRecord.id,
        adArchiveId: archiveId,
        isActive: false,
        isArchived: true,
        mediaUrls: adRecord.mediaUrls || [],
        thumbnailUrl: adRecord.thumbnailUrl,
        refreshedVideoUrl: null,
        refreshedThumbnailUrl: null,
        message: "Meta confirms ad has ended or is no longer available in the Ad Library.",
      };
    }

    const isAdActive = evaluation.isActive && !evaluation.isInactive;

    // 5. Consolidate media URLs safely using deterministic utility
    const consolidated = consolidateRefreshedMedia({
      existingMediaUrls: adRecord.mediaUrls,
      existingThumbnailUrl: adRecord.thumbnailUrl,
      cardImages: evaluation.cardImages,
      videoSrc: evaluation.videoSrc,
      videoPoster: evaluation.videoPoster,
      hasVideoElement: evaluation.hasVideoElement,
      interceptedVideos,
      isNotFound: false,
    });

    const now = new Date();

    // 6. Update Database: adObservations and ads table
    await db
      .update(adObservations)
      .set({
        isActive: isAdActive,
        observedAt: now,
      })
      .where(eq(adObservations.adId, adRecord.id));

    await db
      .update(ads)
      .set({
        mediaUrls: consolidated.updatedMediaUrls,
        thumbnailUrl: consolidated.updatedThumbnailUrl,
        updatedAt: now,
        isArchived: !isAdActive,
        archivedAt: isAdActive ? null : (adRecord.archivedAt || now),
        lastSeenAt: isAdActive ? now : adRecord.lastSeenAt,
      })
      .where(eq(ads.id, adRecord.id));

    // Non-blocking Redis cache invalidation
    deleteByPrefix("cache:spy_ads:").catch(() => {});

    return {
      success: true,
      adId: adRecord.id,
      adArchiveId: archiveId,
      isActive: isAdActive,
      isArchived: !isAdActive,
      mediaUrls: consolidated.updatedMediaUrls,
      thumbnailUrl: consolidated.updatedThumbnailUrl,
      refreshedVideoUrl: consolidated.discoveredVideoUrl,
      refreshedThumbnailUrl: consolidated.discoveredThumbnailUrl,
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

