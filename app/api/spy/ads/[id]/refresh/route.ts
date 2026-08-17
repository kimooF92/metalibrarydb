import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { chromium } from "playwright";
import { uploadMediaFromUrlToB2, isB2Configured } from "@/lib/b2-storage";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = validateApiSecret(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing ad ID" }, { status: 400 });
    }

    const [adRecord] = await db.select().from(ads).where(eq(ads.id, id)).limit(1);
    if (!adRecord) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    if (!adRecord.adArchiveId) {
      return NextResponse.json({ error: "Ad lacks archive ID" }, { status: 400 });
    }

    let refreshedVideoUrl: string | null = null;
    let refreshedThumbnailUrl: string | null = null;

    // Use Playwright to quickly inspect the single ad archive page
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();

      // Intercept GraphQL responses
      page.on("response", async (res) => {
        const url = res.url();
        if (url.includes("/api/graphql/") || url.includes("graphql")) {
          try {
            const text = await res.text();
            if (text.includes("video_hd_url") || text.includes("video_sd_url") || text.includes("resized_image_url")) {
              const vidMatch = text.match(/"video_hd_url":"([^"]+)"/) || text.match(/"video_sd_url":"([^"]+)"/);
              if (vidMatch && vidMatch[1]) {
                refreshedVideoUrl = vidMatch[1].replace(/\\/g, "");
              }
              const thumbMatch = text.match(/"video_preview_image_url":"([^"]+)"/) || text.match(/"resized_image_url":"([^"]+)"/);
              if (thumbMatch && thumbMatch[1]) {
                refreshedThumbnailUrl = thumbMatch[1].replace(/\\/g, "");
              }
            }
          } catch {}
        }
      });

      await page.goto(`https://www.facebook.com/ads/library/?id=${adRecord.adArchiveId}`, {
        waitUntil: "domcontentloaded",
        timeout: 12000,
      });

      await page.waitForTimeout(2000);

      // DOM fallback if GraphQL yielded nothing
      if (!refreshedVideoUrl) {
        const vidEl = await page.$("video");
        if (vidEl) {
          const src = await vidEl.getAttribute("src");
          if (src && !src.startsWith("blob:")) refreshedVideoUrl = src;
          const poster = await vidEl.getAttribute("poster");
          if (poster) refreshedThumbnailUrl = poster;
        }
      }
    } catch (err: any) {
      console.warn(`[Ad Refresh] Playwright notice for ${adRecord.adArchiveId}:`, err.message);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    if (refreshedVideoUrl || refreshedThumbnailUrl) {
      // Backup to Backblaze B2 if configured
      let finalVideoUrl = refreshedVideoUrl;
      let finalThumbnailUrl = refreshedThumbnailUrl;

      if (isB2Configured()) {
        if (refreshedVideoUrl) {
          const b2Vid = await uploadMediaFromUrlToB2(refreshedVideoUrl, "videos", `${adRecord.adArchiveId}_refreshed`);
          if (b2Vid) finalVideoUrl = b2Vid;
        }
        if (refreshedThumbnailUrl) {
          const b2Thumb = await uploadMediaFromUrlToB2(refreshedThumbnailUrl, "thumbnails", `${adRecord.adArchiveId}_refreshed`);
          if (b2Thumb) finalThumbnailUrl = b2Thumb;
        }
      }

      const updatedMediaUrls = finalVideoUrl
        ? [finalVideoUrl, ...(adRecord.mediaUrls?.filter((u) => u !== finalVideoUrl) || [])]
        : adRecord.mediaUrls;

      const [updatedAd] = await db
        .update(ads)
        .set({
          mediaUrls: updatedMediaUrls,
          thumbnailUrl: finalThumbnailUrl || adRecord.thumbnailUrl,
          updatedAt: new Date(),
        })
        .where(eq(ads.id, id))
        .returning();

      return NextResponse.json({
        success: true,
        ad: updatedAd,
        refreshedVideoUrl: finalVideoUrl,
        refreshedThumbnailUrl: finalThumbnailUrl,
      });
    }

    return NextResponse.json({
      success: false,
      message: "Could not extract fresh media URLs at this time. Use live Meta Ad Library link.",
      adArchiveUrl: `https://www.facebook.com/ads/library/?id=${adRecord.adArchiveId}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to refresh ad" }, { status: 500 });
  }
}
