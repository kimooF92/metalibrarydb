import { Page } from "playwright";
import { ExtractedAdData } from "./spy-scanner";
import { resolveDestinationUrl } from "../lib/utils";

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

          // Check that this div is a outer card container with content (images, video, links, or CTA buttons)
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

          // 2. Started running date
          const dateMatch =
            cardText.match(/(?:Started running on|Début de diffusion le|Diffusion le|بدء التشغيل في|Lanzado el|Gestartet am)\s*([^\n\r\|]+)/i) ||
            cardText.match(/([A-Za-zà-ÿ]+\s+\d+,\s+\d{4})/i) ||
            cardText.match(/(\d{1,2}\s+[A-Za-zà-ÿ]+\s+\d{4})/i);
          const startedRunningStr = dateMatch ? dateMatch[1].trim() : null;

          // 3. Caption / Body copy
          const bodyEl =
            card.querySelector('div[style*="white-space: pre-wrap"]') ||
            card.querySelector('div[class*="_4ik4 _4ik5"]') ||
            card.querySelector('div[class*="x2b8fe0"]');
          const caption = bodyEl ? bodyEl.textContent?.trim() || null : null;

          // 4. Media (Images / Video / Carousel)
          const imgs = Array.from(card.querySelectorAll<HTMLImageElement>("img")).filter(
            (img) => img.src && !img.src.includes("data:image") && (img.src.includes("scontent") || img.src.includes("fbcdn"))
          );
          const videoEl = card.querySelector<HTMLVideoElement>("video");

          let mediaType: "image" | "video" | "carousel" | "unknown" = "unknown";
          const mediaUrls: string[] = [];
          let thumbnailUrl: string | null = null;

          if (videoEl) {
            mediaType = "video";
            if (videoEl.src) mediaUrls.push(videoEl.src);
            if (videoEl.poster) thumbnailUrl = videoEl.poster;
          } else if (imgs.length > 1) {
            mediaType = "carousel";
            for (const img of imgs) mediaUrls.push(img.src);
            thumbnailUrl = imgs[0]?.src || null;
          } else if (imgs.length >= 1) {
            mediaType = "image";
            mediaUrls.push(imgs[0].src);
            thumbnailUrl = imgs[0].src;
          }

          // 5. CTA link & text
          const linkEl = card.querySelector<HTMLAnchorElement>('a[href*="l.facebook.com"], a[data-lynx-mode], a[target="_blank"]:not([href*="facebook.com"])');
          const linkUrl = linkEl ? linkEl.href : null;

          const ctaEl = card.querySelector('div[class*="x1h4wwuj"], span[class*="x1h4wwuj"]');
          const ctaText = linkEl ? linkEl.textContent?.trim() || null : ctaEl ? ctaEl.textContent?.trim() || null : null;

          // 6. Duplication / Collation Count (multilingual)
          const dupMatch = cardText.match(/(\d+)\s+(?:ads?|إعلانات|publicités|anuncios)\s+(?:use this creative|تستخدم هذا الإعلان|utilisent cette|usan este)/i);
          const duplicationCount = dupMatch ? parseInt(dupMatch[1], 10) : 1;

          results.push({
            adArchiveId,
            pageId: fallbackPageId,
            pageName,
            startedRunningStr,
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
      let startedRunningOn: Date | null = null;
      if (item.startedRunningStr) {
        let s = item.startedRunningStr.trim().replace(/^le\s+/i, "");
        s = s.replace(/janv\.?|janvier/i, "Jan")
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
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) startedRunningOn = parsed;
      }

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
