import { chromium, Browser, BrowserContext, Page } from "playwright";
import { db } from "../../db";
import { ads, adObservations, scrapedProducts } from "../../db/schema";
import { eq } from "drizzle-orm";
import { deleteByPrefix } from "../../lib/cache-service";

export interface RecheckProductLinkedAdsOptions {
  productId: string;
  force?: boolean;
}

export interface SingleAdRecheckResult {
  adId: string;
  adArchiveId: string;
  previousStatus: "active" | "inactive";
  currentStatus: "active" | "inactive" | "not_found" | "rate_limited" | "error";
  isActive: boolean;
  isArchived: boolean;
  videoRefreshed: boolean;
  thumbnailRefreshed: boolean;
  refreshedVideoUrl?: string | null;
  refreshedThumbnailUrl?: string | null;
  error?: string;
}

export interface RecheckProductLinkedAdsResult {
  success: boolean;
  productId: string;
  productTitle: string | null;
  totalLinkedAds: number;
  checkedCount: number;
  activeCount: number;
  inactiveCount: number;
  notFoundCount: number;
  rateLimitedCount: number;
  errorCount: number;
  refreshedMediaCount: number;
  updatedAds: SingleAdRecheckResult[];
  message: string;
  error?: string;
}

/**
 * Checks and refreshes all linked ads for a given product.
 * Launches a single Playwright instance and inspects each ad archive ID directly.
 * Runs in Trigger.dev Cloud container with $0 Apify credits.
 */
export async function recheckProductLinkedAds(
  options: RecheckProductLinkedAdsOptions
): Promise<RecheckProductLinkedAdsResult> {
  const { productId, force } = options;

  if (!productId) {
    return {
      success: false,
      productId: "",
      productTitle: null,
      totalLinkedAds: 0,
      checkedCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      notFoundCount: 0,
      rateLimitedCount: 0,
      errorCount: 0,
      refreshedMediaCount: 0,
      updatedAds: [],
      message: "Missing product ID",
      error: "Missing product ID",
    };
  }

  // 1. Fetch target product with strict lean projection (Rule 1: no SELECT *)
  const [product] = await db
    .select({
      id: scrapedProducts.id,
      title: scrapedProducts.title,
    })
    .from(scrapedProducts)
    .where(eq(scrapedProducts.id, productId))
    .limit(1);

  if (!product) {
    return {
      success: false,
      productId,
      productTitle: null,
      totalLinkedAds: 0,
      checkedCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      notFoundCount: 0,
      rateLimitedCount: 0,
      errorCount: 0,
      refreshedMediaCount: 0,
      updatedAds: [],
      message: "Product not found in database",
      error: "Product not found",
    };
  }

  // 2. Fetch linked ads with strict column projection (isolate & truncate heavy columns)
  const linkedAds = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      mediaUrls: ads.mediaUrls,
      thumbnailUrl: ads.thumbnailUrl,
      mediaType: ads.mediaType,
      isArchived: ads.isArchived,
      archivedAt: ads.archivedAt,
      lastSeenAt: ads.lastSeenAt,
    })
    .from(ads)
    .where(eq(ads.productId, productId));

  if (linkedAds.length === 0) {
    return {
      success: true,
      productId,
      productTitle: product.title,
      totalLinkedAds: 0,
      checkedCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      notFoundCount: 0,
      rateLimitedCount: 0,
      errorCount: 0,
      refreshedMediaCount: 0,
      updatedAds: [],
      message: "No linked ads found for this product.",
    };
  }

  // Filter ads with valid archive ID, bounded to max 12 ads to keep execution within serverless/Trigger budgets
  const adsToCheck = linkedAds
    .filter((a) => a.adArchiveId && a.adArchiveId.trim().length > 0)
    .slice(0, 12);

  const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  let activeCount = 0;
  let inactiveCount = 0;
  let notFoundCount = 0;
  let rateLimitedCount = 0;
  let errorCount = 0;
  let refreshedMediaCount = 0;
  const updatedAds: SingleAdRecheckResult[] = [];
  const now = new Date();

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

    for (const ad of adsToCheck) {
      const archiveId = ad.adArchiveId!;
      const previousStatus: "active" | "inactive" = ad.isArchived ? "inactive" : "active";
      const adArchiveUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${archiveId}`;

      let page: Page | null = null;
      const interceptedVideos: string[] = [];
      const interceptedImages: string[] = [];

      try {
        page = await context.newPage();

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

        await page.goto(adArchiveUrl, {
          waitUntil: "domcontentloaded",
          timeout: parseInt(process.env.PAGE_TIMEOUT || "22000", 10),
        });

        // Wait for Meta hydration
        await page.waitForTimeout(2500);

        // Evaluate DOM for status and media
        const evaluation = await page.evaluate((targetId) => {
          const bodyText = document.body ? document.body.innerText || document.body.textContent || "" : "";

          // Check Rate Limit / CAPTCHA
          if (/confirm it'?s you|security check|enter the code below|unusual activity|prouvez que vous êtes un humain/i.test(bodyText)) {
            return { isRateLimited: true, isNotFound: false, isActive: false, isInactive: false, cardImages: [], videoPoster: null, videoSrc: null };
          }

          // Check Not Found / Expired
          const zeroAdRegex =
            /no\s+ads?\s+match|no\s+results?\s+found|no\s+active\s+ads|ad\s+isn['’]?t\s+in\s+the\s+ad\s+library|ad\s+is\s+not\s+in\s+the\s+ad\s+library|aucun\s+résultat|sin\s+resultados|keine\s+ergebnisse|this\s+ad\s+has\s+expired|ad\s+not\s+found|ce\s+contenu\s+n'est\s+pas\s+disponible|ne\s+figure\s+pas\s+dans\s+la\s+bibliothèque|الإعلان\s+غير\s+موجود/i;

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

          // Extract creative images (filtering out avatars)
          const allImgs = Array.from(cardScope.querySelectorAll('img[src*="fbcdn.net"], img[src*="scontent"]')) as HTMLImageElement[];
          const cardImages = allImgs
            .map((img) => img.src)
            .filter((src) => {
              if (!src || src.includes("rsrc.php")) return false;
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
          rateLimitedCount++;
          updatedAds.push({
            adId: ad.id,
            adArchiveId: archiveId,
            previousStatus,
            currentStatus: "rate_limited",
            isActive: !ad.isArchived,
            isArchived: Boolean(ad.isArchived),
            videoRefreshed: false,
            thumbnailRefreshed: false,
            error: "Rate limited or CAPTCHA encountered",
          });
          continue;
        }

        if (evaluation.isNotFound) {
          notFoundCount++;
          inactiveCount++;

          await db
            .update(adObservations)
            .set({ isActive: false, observedAt: now })
            .where(eq(adObservations.adId, ad.id));

          await db
            .update(ads)
            .set({
              isArchived: true,
              archivedAt: ad.archivedAt || now,
              lastSeenAt: now,
              updatedAt: now,
            })
            .where(eq(ads.id, ad.id));

          updatedAds.push({
            adId: ad.id,
            adArchiveId: archiveId,
            previousStatus,
            currentStatus: "not_found",
            isActive: false,
            isArchived: true,
            videoRefreshed: false,
            thumbnailRefreshed: false,
          });
          continue;
        }

        const isAdActive = evaluation.isActive && !evaluation.isInactive;
        if (isAdActive) {
          activeCount++;
        } else {
          inactiveCount++;
        }

        // Consolidate media
        let discoveredVideoUrl: string | null = evaluation.videoSrc || null;
        if (!discoveredVideoUrl && interceptedVideos.length > 0) {
          discoveredVideoUrl = interceptedVideos[interceptedVideos.length - 1];
        }

        let discoveredThumbnailUrl: string | null = evaluation.videoPoster || null;
        if (!discoveredThumbnailUrl && evaluation.cardImages.length > 0) {
          discoveredThumbnailUrl = evaluation.cardImages[0];
        } else if (!discoveredThumbnailUrl && interceptedImages.length > 0) {
          discoveredThumbnailUrl =
            interceptedImages.find((u) => u.includes("600x600") || u.includes("1080x1080")) || interceptedImages[0];
        }

        const discoveredImages = evaluation.cardImages.length > 0 ? evaluation.cardImages : interceptedImages.slice(0, 5);

        const videoRefreshed = Boolean(discoveredVideoUrl && discoveredVideoUrl !== ad.mediaUrls?.[0]);
        const thumbnailRefreshed = Boolean(discoveredThumbnailUrl && discoveredThumbnailUrl !== ad.thumbnailUrl);

        if (videoRefreshed || thumbnailRefreshed) {
          refreshedMediaCount++;
        }

        const updatedMediaUrls = discoveredVideoUrl
          ? [discoveredVideoUrl, ...(ad.mediaUrls?.filter((u) => u !== discoveredVideoUrl) || [])]
          : discoveredImages.length > 0
          ? discoveredImages
          : ad.mediaUrls || [];

        // Update adObservations and ads table
        await db
          .update(adObservations)
          .set({
            isActive: isAdActive,
            observedAt: now,
          })
          .where(eq(adObservations.adId, ad.id));

        await db
          .update(ads)
          .set({
            mediaUrls: updatedMediaUrls,
            thumbnailUrl: discoveredThumbnailUrl || ad.thumbnailUrl,
            updatedAt: now,
            isArchived: !isAdActive,
            archivedAt: isAdActive ? null : (ad.archivedAt || now),
            lastSeenAt: isAdActive ? now : ad.lastSeenAt,
          })
          .where(eq(ads.id, ad.id));

        updatedAds.push({
          adId: ad.id,
          adArchiveId: archiveId,
          previousStatus,
          currentStatus: isAdActive ? "active" : "inactive",
          isActive: isAdActive,
          isArchived: !isAdActive,
          videoRefreshed,
          thumbnailRefreshed,
          refreshedVideoUrl: discoveredVideoUrl,
          refreshedThumbnailUrl: discoveredThumbnailUrl,
        });
      } catch (singleErr: any) {
        errorCount++;
        updatedAds.push({
          adId: ad.id,
          adArchiveId: archiveId,
          previousStatus,
          currentStatus: "error",
          isActive: !ad.isArchived,
          isArchived: Boolean(ad.isArchived),
          videoRefreshed: false,
          thumbnailRefreshed: false,
          error: singleErr?.message || "Inspection error",
        });
      } finally {
        if (page && !page.isClosed()) {
          await page.close().catch(() => {});
        }
      }

      // Small throttling delay between ads to prevent Meta blocks
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    // Touch product updatedAt
    await db
      .update(scrapedProducts)
      .set({ updatedAt: now })
      .where(eq(scrapedProducts.id, productId))
      .catch(() => {});

    // Invalidate product & ad caches (Upstash Redis)
    await Promise.allSettled([
      deleteByPrefix("cache:spy_ads:"),
      deleteByPrefix(`cache:product:${productId}`),
      deleteByPrefix("cache:products:"),
      deleteByPrefix("cache:fresh_winners:"),
      deleteByPrefix("cache:stats:"),
    ]);

    return {
      success: true,
      productId,
      productTitle: product.title,
      totalLinkedAds: linkedAds.length,
      checkedCount: updatedAds.length,
      activeCount,
      inactiveCount,
      notFoundCount,
      rateLimitedCount,
      errorCount,
      refreshedMediaCount,
      updatedAds,
      message: `Verified ${updatedAds.length} linked ads (${activeCount} active, ${inactiveCount} inactive/ended).`,
    };
  } catch (err: any) {
    console.error(`[Recheck Product Linked Ads Error for ${productId}]:`, err);
    return {
      success: false,
      productId,
      productTitle: product.title,
      totalLinkedAds: linkedAds.length,
      checkedCount: updatedAds.length,
      activeCount,
      inactiveCount,
      notFoundCount,
      rateLimitedCount,
      errorCount,
      refreshedMediaCount,
      updatedAds,
      message: err?.message || "Failed to recheck product linked ads",
      error: err?.message || "Execution failure",
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

