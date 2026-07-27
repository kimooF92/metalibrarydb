import { Page } from "playwright";
import { ExtractedAdData } from "./spy-scanner";
import { resolveDestinationUrl } from "../lib/utils";

/**
 * Deep DOM Scanner: Extracts visible ad cards directly from rendered page DOM elements
 * across all languages (English, French, Arabic, Spanish).
 */
export async function extractAdsFromDOM(page: Page, defaultPageId: string): Promise<ExtractedAdData[]> {
  try {
    const rawAds = await page.evaluate((fallbackPageId) => {
      const results: any[] = [];

      // Find all potential ad card container elements
      const cardElements = Array.from(
        document.querySelectorAll('div[class*="_7jvr"], div[class*="x1n2onr3"], div[role="article"]')
      ).filter((el) => {
        const text = el.textContent || "";
        const hasId = /(?:Library ID|ID|معرّف المكتبة|Identifiant|Identificador):\s*\d+/i.test(text);
        const hasDate = /(?:Started running|بدء التشغيل|Diffusion|Lanzado)/i.test(text);
        return hasId || hasDate;
      });

      for (const card of cardElements) {
        try {
          const cardText = card.textContent || "";

          // Extract Archive ID (multilingual)
          const idMatch = cardText.match(/(?:Library ID|ID|معرّف المكتبة|Identifiant|Identificador):\s*(\d+)/i) ||
                          cardText.match(/(\d{14,16})/); // fallback 14-16 digit Meta Archive ID pattern
          if (!idMatch) continue;
          const adArchiveId = idMatch[1];

          // Extract Started running date
          const dateMatch = cardText.match(/(?:Started running on|بدء التشغيل في|Diffusion le|Lanzado el)\s*([^\n\r\|]+)/i) ||
                            cardText.match(/([A-Za-z]+\s+\d+,\s+\d{4})/i) ||
                            cardText.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
          const startedRunningStr = dateMatch ? dateMatch[1].trim() : null;

          // Extract Copy / Caption
          const bodyEl = card.querySelector('div[style*="white-space: pre-wrap"], div[class*="x2b8fe0"], div[class*="_4ik4"]');
          const caption = bodyEl ? bodyEl.textContent?.trim() || null : null;

          // Extract Media
          const imgEl = card.querySelector("img");
          const videoEl = card.querySelector("video");
          let mediaType: "image" | "video" | "carousel" | "unknown" = "unknown";
          const mediaUrls: string[] = [];
          let thumbnailUrl: string | null = null;

          if (videoEl) {
            mediaType = "video";
            if (videoEl.src) mediaUrls.push(videoEl.src);
            if (videoEl.poster) thumbnailUrl = videoEl.poster;
          } else if (imgEl && imgEl.src && !imgEl.src.includes("data:image")) {
            mediaType = "image";
            mediaUrls.push(imgEl.src);
            thumbnailUrl = imgEl.src;
          }

          // Extract CTA link & text
          const linkEl = card.querySelector('a[href*="l.facebook.com"], a[target="_blank"]') as HTMLAnchorElement;
          const linkUrl = linkEl ? linkEl.href : null;
          const ctaText = linkEl ? linkEl.textContent?.trim() || null : null;

          // Extract Duplication / Collation Count (multilingual)
          const dupMatch = cardText.match(/(\d+)\s+(?:ads?|إعلانات|publicités|anuncios)\s+(?:use this creative|تستخدم هذا الإعلان|utilisent cette)/i);
          const duplicationCount = dupMatch ? parseInt(dupMatch[1], 10) : 1;

          results.push({
            adArchiveId,
            pageId: fallbackPageId,
            pageName: null,
            startedRunningStr,
            caption,
            title: null,
            ctaText,
            linkUrl,
            mediaType,
            mediaUrls,
            thumbnailUrl,
            duplicationCount,
            isActive: !cardText.includes("Inactive") && !cardText.includes("غير نشط") && !cardText.includes("Inactif"),
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
        const parsed = new Date(item.startedRunningStr);
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
