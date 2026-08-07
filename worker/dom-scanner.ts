import { Page } from "playwright";
import { ExtractedAdData } from "./spy-scanner";
import { resolveDestinationUrl } from "../lib/utils";

/**
 * Robust date parser function for Meta Ad Library across English, French, Arabic, Spanish, German.
 */
export function extractDateFromCardText(cardText: string): Date | null {
  if (!cardText) return null;

  // 1. Match Month Day, Year (e.g. Mar 11, 2026 or March 11, 2026)
  const monthDayYear = cardText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
  if (monthDayYear) {
    const parsed = new Date(`${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // 2. Match Day Month Year (e.g. 4 juil 2026, 11 Mar 2026, 4. Jul. 2026)
  const dayMonthYear = cardText.match(/\b(\d{1,2})\.?\s+(janv|janvier|févr|février|mars|avril|avr|mai|juin|juil|juillet|août|sept|septembre|oct|octobre|nov|novembre|déc|décembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})/i);
  if (dayMonthYear) {
    let monthStr = dayMonthYear[2].toLowerCase();
    monthStr = monthStr.replace(/janv\.?|janvier/i, "Jan")
                       .replace(/févr\.?|février/i, "Feb")
                       .replace(/mars/i, "Mar")
                       .replace(/avril|avr\.?/i, "Apr")
                       .replace(/mai/i, "May")
                       .replace(/juin/i, "Jun")
                       .replace(/juil\.?|juillet/i, "Jul")
                       .replace(/août/i, "Aug")
                       .replace(/sept\.?|septembre/i, "Sep")
                       .replace(/oct\.?|octobre/i, "Oct")
                       .replace(/nov\.?|novembre/i, "Nov")
                       .replace(/déc\.?|décembre/i, "Dec");
    const parsed = new Date(`${dayMonthYear[1]} ${monthStr} ${dayMonthYear[3]}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // 3. Match Numeric Date (e.g. 2026-07-04 or 04/07/2026)
  const numericDate = cardText.match(/\b(\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2}|\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4})\b/);
  if (numericDate) {
    const parsed = new Date(numericDate[1]);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

export interface ExtractedPageIdInfo {
  pageId: string;
  pageName: string | null;
}

/**
 * Deep Page ID Extractor: Scans DOM anchor tags, script tags, and inline HTML to extract Meta Page IDs.
 */
export async function extractPageIdsFromPage(page: Page): Promise<ExtractedPageIdInfo[]> {
  try {
    const pageInfos = await page.evaluate(() => {
      const resultsMap = new Map<string, string | null>();

      // 1. Extract from anchor tags
      const allAnchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href*="page_id"], a[href*="facebook.com/"]')
      );
      for (const a of allAnchors) {
        const href = a.href || "";
        const match =
          href.match(/(?:view_all_page_id|page_id)=(\d{10,20})/i) ||
          href.match(/facebook\.com\/(\d{10,20})(?:[\/?#]|$)/i);
        if (match && match[1] && match[1] !== "0") {
          const pageId = match[1];
          const pageName = a.textContent?.trim() || null;
          if (!resultsMap.has(pageId) || (pageName && !resultsMap.get(pageId))) {
            resultsMap.set(pageId, pageName);
          }
        }
      }

      // 2. Extract from script tags & document innerHTML
      const scriptTexts = Array.from(document.querySelectorAll("script")).map((s) => s.textContent || "");
      const fullText = scriptTexts.join("\n") + "\n" + (document.body?.innerHTML || "");

      const pageIdRegex = /"(?:view_all_page_id|page_id|publisherPlatformPageId|pageID)"\s*:\s*"?(\d{10,20})"?/gi;
      let match: RegExpExecArray | null;

      while ((match = pageIdRegex.exec(fullText)) !== null) {
        const pageId = match[1];
        if (pageId && pageId !== "0" && !resultsMap.has(pageId)) {
          resultsMap.set(pageId, null);
        }
      }

      return Array.from(resultsMap.entries()).map(([pageId, pageName]) => ({ pageId, pageName }));
    });

    return pageInfos;
  } catch {
    return [];
  }
}

/**
 * Deep DOM Scanner: Extracts visible ad cards directly from rendered page DOM elements
 * across all languages (English, French, Arabic, Spanish, German).
 */
export async function extractAdsFromDOM(page: Page, defaultPageId: string): Promise<ExtractedAdData[]> {
  try {
    const rawAds = await page.evaluate((fallbackPageId) => {
      const results: any[] = [];
      const seenArchiveIds = new Set<string>();

      const allDivs = Array.from(document.querySelectorAll("div"));

      for (const card of allDivs) {
        try {
          const cardText = card.textContent || "";

          // Extract 14-16 digit Meta Archive ID
          const idMatch =
            cardText.match(/(?:Library ID|ID dans la bibliothèque|Identifiant|Identificador|معرّف المكتبة|ID)\s*[:\s]\s*(\d{14,16})/i) ||
            cardText.match(/\b(\d{14,16})\b/);

          if (!idMatch) continue;

          const adArchiveId = idMatch[1];
          if (seenArchiveIds.has(adArchiveId)) continue;

          // Check that this div is a outer card container with content
          const hasContent =
            card.querySelector('img[src*="fbcdn"], img[src*="scontent"], video, a[href*="l.facebook.com"], a[href*="http"], div[style*="white-space"]') !== null ||
            cardText.includes("Sponsored") ||
            cardText.includes("Sponsorisé") ||
            cardText.includes("See ad details") ||
            cardText.includes("Voir les détails");

          if (!hasContent) continue;
          if (cardText.length > 8000) continue; // skip giant body wrappers

          // Ensure it doesn't contain multiple ad card IDs
          const allIdsInCard = (cardText.match(/\b\d{14,16}\b/g) || []);
          const uniqueIdsInCard = new Set(allIdsInCard);
          if (uniqueIdsInCard.size > 2) continue;

          seenArchiveIds.add(adArchiveId);

          // 1. Page Name
          const pageNameEl = card.querySelector('a[href*="facebook.com/"] span, a[href*="facebook.com/"]');
          const pageName = pageNameEl ? pageNameEl.textContent?.trim() || null : null;

          // 2. Caption / Body copy
          const bodyEl =
            card.querySelector('div[style*="white-space: pre-wrap"]') ||
            card.querySelector('div[class*="_4ik4 _4ik5"]') ||
            card.querySelector('div[class*="x2b8fe0"]');
          const caption = bodyEl ? bodyEl.textContent?.trim() || null : null;

          // 3. Media (Images / Video / Carousel)
          const isLogoUrl = (url: string) =>
            /_s60x60|_s50x50|_s100x100|_p60x60|_p50x50|s60x60|p60x60|s50x50|s100x100/i.test(url) ||
            url.includes("profile") ||
            url.includes("avatar");

          const imgs = Array.from(card.querySelectorAll<HTMLImageElement>("img")).filter((img) => {
            if (!img.src || img.src.includes("data:image")) return false;
            if (!img.src.includes("scontent") && !img.src.includes("fbcdn")) return false;
            if (isLogoUrl(img.src)) return false;

            const alt = (img.alt || "").toLowerCase();
            if (alt.includes("profile") || alt.includes("logo") || alt.includes("avatar")) return false;

            const isHeaderImg =
              !!img.closest('a[href*="facebook.com/"]') ||
              !!img.closest('div[class*="header"]') ||
              !!img.closest('div[role="header"]');
            const width = img.width || img.clientWidth || img.naturalWidth || 0;
            const height = img.height || img.clientHeight || img.naturalHeight || 0;

            if (isHeaderImg) return false;
            if (width > 0 && width <= 120 && height > 0 && height <= 120) return false;

            return true;
          });

          const videoEl = card.querySelector<HTMLVideoElement>("video");

          let mediaType: "image" | "video" | "carousel" | "unknown" = "unknown";
          const mediaUrls: string[] = [];
          let thumbnailUrl: string | null = null;

          if (videoEl) {
            mediaType = "video";
            if (videoEl.src) mediaUrls.push(videoEl.src);
            if (videoEl.poster && !isLogoUrl(videoEl.poster)) thumbnailUrl = videoEl.poster;
          } else if (imgs.length > 1) {
            mediaType = "carousel";
            for (const img of imgs) mediaUrls.push(img.src);
            thumbnailUrl = imgs[0]?.src || null;
          } else if (imgs.length >= 1) {
            mediaType = "image";
            mediaUrls.push(imgs[0].src);
            thumbnailUrl = imgs[0].src;
          }

          // 4. CTA link & text
          const linkEl = card.querySelector<HTMLAnchorElement>('a[href*="l.facebook.com"], a[data-lynx-mode], a[target="_blank"]:not([href*="facebook.com"])');
          const linkUrl = linkEl ? linkEl.href : null;

          const ctaEl = card.querySelector('div[class*="x1h4wwuj"], span[class*="x1h4wwuj"]');
          const ctaText = linkEl ? linkEl.textContent?.trim() || null : ctaEl ? ctaEl.textContent?.trim() || null : null;

          // 5. Duplication / Collation Count (multilingual)
          const dupMatch = cardText.match(/(\d+)\s+(?:ads?|إعلانات|publicités|anuncios)\s+(?:use this creative|تستخدم هذا الإعلان|utilisent cette|usan este)/i);
          const duplicationCount = dupMatch ? parseInt(dupMatch[1], 10) : 1;

          results.push({
            adArchiveId,
            pageId: fallbackPageId,
            pageName,
            rawText: cardText,
            caption,
            title: null,
            ctaText,
            linkUrl,
            mediaType,
            mediaUrls,
            thumbnailUrl,
            duplicationCount,
            isActive: !cardText.includes("Inactive") && !cardText.includes("غير نشط") && !cardText.includes("Inactif") && !cardText.includes("Inactivo"),
          });
        } catch {
          // Ignore single card parse errors
        }
      }

      return results;
    }, defaultPageId);

    return rawAds.map((item) => {
      const startedRunningOn = extractDateFromCardText(item.rawText);

      return {
        adArchiveId: item.adArchiveId,
        pageId: item.pageId,
        pageName: item.pageName,
        startedRunningOn,
        caption: item.caption,
        title: item.title,
        ctaText: item.ctaText,
        linkUrl: resolveDestinationUrl(item.linkUrl),
        mediaType: item.mediaType,
        mediaUrls: item.mediaUrls,
        thumbnailUrl: item.thumbnailUrl,
        duplicationCount: item.duplicationCount,
        collationId: null,
        isActive: item.isActive,
      };
    });
  } catch {
    return [];
  }
}
