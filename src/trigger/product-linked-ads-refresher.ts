import { chromium, Browser, BrowserContext, Page } from "playwright";
import { db } from "../../db";
import { ads, adObservations, scrapedProducts } from "../../db/schema";
import { eq } from "drizzle-orm";
import { deleteByPrefix } from "../../lib/cache-service";
import { consolidateRefreshedMedia } from "../../lib/ad-media-utils";

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
          timeout: parseInt(process.env.PAGE_TIMEOUT || "30000", 10),
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
        await page.waitForTimeout(2000);

        // Evaluate DOM for status and media
        const evaluation = await page.evaluate((targetId) => {
          const bodyText = document.body ? document.body.innerText || document.body.textContent || "" : "";

          // Check Rate Limit / CAPTCHA
          if (/confirm it'?s you|security check|enter the code below|unusual activity|prouvez que vous êtes un humain|rate limit exceeded|too many requests|temporarily blocked/i.test(bodyText)) {
            return { isRateLimited: true, isNotFound: false, isActive: false, isInactive: false, cardImages: [], videoPoster: null, videoSrc: null, hasVideoElement: false };
          }

          // Check Not Found / Expired in overall body text (only when no modal is open)
          const zeroAdRegex =
            /no\s+ads?\s+match|no\s+results?\s+found|no\s+active\s+ads|ad\s+isn['’]?t\s+in\s+the\s+ad\s+library|ad\s+is\s+not\s+in\s+the\s+ad\s+library|aucun\s+résultat|sin\s+resultados|keine\s+ergebnisse|this\s+ad\s+has\s+expired|ad\s+not\s+found|ce\s+contenu\s+n'est\s+pas\s+disponible|ne\s+figure\s+pas\s+dans\s+la\s+bibliothèque|الإعلان\s+غير\s+موجود|\b0\s+results\b|~\s?0\s+results/i;

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

            candidateDivs.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);

            for (const candidate of candidateDivs) {
              const cText = candidate.innerText || "";
              if (cText.length > 12000) continue;
              const hasCardLabels = /Sponsored|Sponsorisé|Started running|Lancé le|Active|Inactive|Inactif|Actif|نشط|غير نشط|See ad details/i.test(cText);
              const hasMedia = candidate.querySelector('img[src*="fbcdn"], video') !== null;
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

        // Consolidate media safely using deterministic utility
        const consolidated = consolidateRefreshedMedia({
          existingMediaUrls: ad.mediaUrls,
          existingThumbnailUrl: ad.thumbnailUrl,
          cardImages: evaluation.cardImages,
          videoSrc: evaluation.videoSrc,
          videoPoster: evaluation.videoPoster,
          hasVideoElement: evaluation.hasVideoElement,
          interceptedVideos,
          isNotFound: false,
        });

        if (consolidated.videoRefreshed || consolidated.thumbnailRefreshed) {
          refreshedMediaCount++;
        }

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
            mediaUrls: consolidated.updatedMediaUrls,
            thumbnailUrl: consolidated.updatedThumbnailUrl,
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
          videoRefreshed: consolidated.videoRefreshed,
          thumbnailRefreshed: consolidated.thumbnailRefreshed,
          refreshedVideoUrl: consolidated.discoveredVideoUrl,
          refreshedThumbnailUrl: consolidated.discoveredThumbnailUrl,
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

