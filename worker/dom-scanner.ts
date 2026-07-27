import { Page } from "playwright";
import { ExtractedAdData } from "./spy-scanner";
import { resolveDestinationUrl } from "../lib/utils";

/**
 * Fallback parser: Extracts visible ad cards directly from DOM elements
 * if GraphQL network interception didn't capture payloads.
 */
export async function extractAdsFromDOM(page: Page, defaultPageId: string): Promise<ExtractedAdData[]> {
  try {
    const rawAds = await page.evaluate((fallbackPageId) => {
      const results: any[] = [];
      // Meta Ad Library ad card containers typically have data-testid or specific structural roles
      const cardElements = Array.from(document.querySelectorAll('div[class*="x1n2onr3"], div[class*="x9f619"]'))
        .filter((el) => {
          const text = el.textContent || "";
          return (text.includes("Library ID:") || text.includes("ID:")) && text.includes("Started running");
        });

      for (const card of cardElements) {
        try {
          const cardText = card.textContent || "";

          // Extract Archive ID
          const idMatch = cardText.match(/(?:Library ID|ID):\s*(\d+)/i);
          if (!idMatch) continue;
          const adArchiveId = idMatch[1];

          // Extract Started running date
          const dateMatch = cardText.match(/Started running on\s*([A-Za-z]+\s+\d+,\s+\d{4})/i) ||
                            cardText.match(/Started running on\s*([\d\/\.\-]+)/i);
          const startedRunningStr = dateMatch ? dateMatch[1] : null;

          // Extract Copy / Caption
          const bodyEl = card.querySelector('div[style*="white-space: pre-wrap"], div[class*="x2b8fe0"]');
          const caption = bodyEl ? bodyEl.textContent : null;

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

          // Extract CTA link
          const linkEl = card.querySelector('a[href*="l.facebook.com"], a[target="_blank"]') as HTMLAnchorElement;
          const linkUrl = linkEl ? linkEl.href : null;
          const ctaText = linkEl ? linkEl.textContent : null;

          // Extract Duplication Count
          const dupMatch = cardText.match(/(\d+)\s+ads?\s+use\s+this\s+creative/i);
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
            isActive: !cardText.includes("Inactive"),
          });
        } catch {
          // Ignore individual card parse errors
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
