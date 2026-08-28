import { Page } from "playwright";
import { db } from "../db";
import { ads, scrapedProducts } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomDelay, DELAY_CONFIG } from "./throttle";

export interface SingleAdStatusResult {
  adArchiveId: string;
  status: "active" | "inactive" | "not_found" | "rate_limited" | "error";
  reason?: string;
  checkedAt: Date;
}

export interface VerifyProductResult {
  productId: string;
  productTitle: string | null;
  productUrl: string;
  totalLinkedAds: number;
  activeAdsBefore: number;
  checkedAdsCount: number;
  activeCount: number;
  inactiveCount: number;
  notFoundCount: number;
  errorCount: number;
  skipped: boolean;
  skipReason?: string;
  updatedAds: Array<{
    adArchiveId: string;
    previousStatus: "active" | "inactive";
    currentStatus: "active" | "inactive" | "not_found" | "error";
  }>;
}

/**
 * Checks a single Meta Ad status by directly navigating to its unique Ad Archive URL.
 * URL Format: https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=<adArchiveId>
 */
export async function checkSingleAdStatus(
  page: Page,
  adArchiveId: string
): Promise<SingleAdStatusResult> {
  const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${adArchiveId}`;
  const now = new Date();

  try {
    await randomDelay(1000, 2000);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: parseInt(process.env.PAGE_TIMEOUT || "30000", 10),
    });

    // Wait for content to render (either the card or zero-state message)
    await page.waitForTimeout(2500);

    const evaluation = await page.evaluate((targetId) => {
      const bodyText = document.body ? document.body.innerText || document.body.textContent || "" : "";

      // 1. Check for Rate limit / CAPTCHA
      if (
        /confirm it'?s you|security check|enter the code below|unusual activity|prouvez que vous êtes un humain/i.test(bodyText)
      ) {
        return { status: "rate_limited", reason: "CAPTCHA required" };
      }

      if (
        /rate limit exceeded|too many requests|temporarily blocked/i.test(bodyText)
      ) {
        return { status: "rate_limited", reason: "Rate limited" };
      }

      // 2. Check for Zero-state / Expired / 404 on the overall page
      const zeroAdRegex =
        /no\s+ads?\s+match|no\s+results?\s+found|no\s+active\s+ads|ad\s+isn['’]?t\s+in\s+the\s+ad\s+library|ad\s+is\s+not\s+in\s+the\s+ad\s+library|aucun\s+résultat|sin\s+resultados|keine\s+ergebnisse|there\s+are\s+no\s+ads|0\s+matching\s+ads|0\s+ads\s+match|aucun\s+résultat\s+ne\s+correspond|ningún\s+anuncio\s+coincide|keine\s+anzeigen\s+stimmen|this\s+ad\s+has\s+expired|ad\s+not\s+found|ce\s+contenu\s+n'est\s+pas\s+disponible|ne\s+figure\s+pas\s+dans\s+la\s+bibliothèque|الإعلان\s+غير\s+موجود/i;

      if (zeroAdRegex.test(bodyText) || /\b0\s+results\b/i.test(bodyText) || /~\s?0\s+results/i.test(bodyText)) {
        return { status: "not_found", reason: "Ad not found, expired, or not in Ad Library" };
      }

      // 3. Find target Ad Card container strictly containing the target ID
      // When Meta Ad Library receives an expired/deleted ad ID, it redirects to the brand's general page
      // which contains OTHER active ads. We MUST verify that THIS SPECIFIC adArchiveId is rendered.
      const allDivs = Array.from(document.querySelectorAll("div"));
      const matchingDivs = allDivs.filter((d) => (d.textContent || "").includes(targetId));

      if (matchingDivs.length === 0) {
        // The specific ad ID does not exist on the rendered page (expired, deleted, or removed)
        return {
          status: "not_found",
          reason: `Ad Archive ID ${targetId} is not present in rendered results (expired/removed)`,
        };
      }

      // Sort to find smallest container containing the target ID
      matchingDivs.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
      const targetCard = matchingDivs[0];
      const cardText = targetCard.innerText || targetCard.textContent || "";

      // 4. Check for Inactive badge (multilingual) strictly inside this ad's card
      const isInactive =
        /\b(Inactive|Inactif|غير نشط|Inactivo|Inaktiv)\b/i.test(cardText);

      // 5. Check for Active badge (multilingual) strictly inside this ad's card
      const isActive =
        /\b(Active|Actif|نشط|Activo|Aktiv)\b/i.test(cardText);

      if (isInactive) {
        return { status: "inactive", reason: "Ad card marked Inactive" };
      }

      if (isActive) {
        return { status: "active", reason: "Ad card marked Active" };
      }

      // If we see library ID or started running info on THIS SPECIFIC CARD without inactive flag, treat as active
      if (cardText.includes(targetId) && /Started running|Lancé le|En cours|Diffusé|Sponsored|Sponsorisé/i.test(cardText)) {
        return { status: "active", reason: "Ad found running" };
      }

      return { status: "not_found", reason: "Target ad card structure expired/unavailable" };
    }, adArchiveId);

    return {
      adArchiveId,
      status: evaluation.status as any,
      reason: evaluation.reason,
      checkedAt: now,
    };
  } catch (err: any) {
    return {
      adArchiveId,
      status: "error",
      reason: err?.message || "Navigation timeout or network error",
      checkedAt: now,
    };
  }
}

/**
 * Verifies all active ads for a given favorite product.
 * Automatically skips if the product has 0 active ads in the database.
 */
export async function verifyProductFavoriteAds(
  page: Page,
  productId: string,
  options: { forceAll?: boolean } = {}
): Promise<VerifyProductResult> {
  const now = new Date();

  const product = await db.query.scrapedProducts.findFirst({
    where: eq(scrapedProducts.id, productId),
  });

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  // 1. Fetch all ads linked to this product
  const allLinkedAds = await db.query.ads.findMany({
    where: eq(ads.productId, productId),
  });

  const activeAds = allLinkedAds.filter((a) => !a.isArchived);

  // 2. Skip rule: If all ads are already archived/inactive and forceAll is not enabled
  if (activeAds.length === 0 && !options.forceAll) {
    return {
      productId: product.id,
      productTitle: product.title,
      productUrl: product.url,
      totalLinkedAds: allLinkedAds.length,
      activeAdsBefore: 0,
      checkedAdsCount: 0,
      activeCount: 0,
      inactiveCount: allLinkedAds.length,
      notFoundCount: 0,
      errorCount: 0,
      skipped: true,
      skipReason: "All linked ads are already archived/inactive in database",
      updatedAds: [],
    };
  }

  const adsToCheck = options.forceAll ? allLinkedAds : activeAds;
  const updatedAds: VerifyProductResult["updatedAds"] = [];

  let activeCount = 0;
  let inactiveCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  for (const ad of adsToCheck) {
    const previousStatus = ad.isArchived ? "inactive" : "active";
    const result = await checkSingleAdStatus(page, ad.adArchiveId);

    if (result.status === "active") {
      activeCount++;
      await db
        .update(ads)
        .set({
          isArchived: false,
          archivedAt: null,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(ads.id, ad.id));

      updatedAds.push({
        adArchiveId: ad.adArchiveId,
        previousStatus,
        currentStatus: "active",
      });
    } else if (result.status === "inactive" || result.status === "not_found") {
      if (result.status === "inactive") inactiveCount++;
      else notFoundCount++;

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
        adArchiveId: ad.adArchiveId,
        previousStatus,
        currentStatus: result.status,
      });
    } else {
      errorCount++;
      updatedAds.push({
        adArchiveId: ad.adArchiveId,
        previousStatus,
        currentStatus: "error",
      });
    }

    // Friendly delay between individual ad checks
    await randomDelay(1500, 3000);
  }

  // Update product's last scraped timestamp
  await db
    .update(scrapedProducts)
    .set({ updatedAt: now })
    .where(eq(scrapedProducts.id, product.id));

  return {
    productId: product.id,
    productTitle: product.title,
    productUrl: product.url,
    totalLinkedAds: allLinkedAds.length,
    activeAdsBefore: activeAds.length,
    checkedAdsCount: adsToCheck.length,
    activeCount,
    inactiveCount,
    notFoundCount,
    errorCount,
    skipped: false,
    updatedAds,
  };
}
