import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { chromium } from "playwright";
import { uploadMediaFromUrlToB2, isB2Configured } from "@/lib/b2-storage";

function findMediaInJSON(obj: any, results: { videoUrl?: string; thumbnailUrl?: string }) {
  if (!obj || typeof obj !== "object") return;

  if (obj.video_hd_url || obj.video_sd_url || obj.sd_src || obj.hd_src) {
    const vUrl = obj.video_hd_url || obj.video_sd_url || obj.hd_src || obj.sd_src;
    if (vUrl && typeof vUrl === "string" && !results.videoUrl) {
      results.videoUrl = vUrl.replace(/\\/g, "");
    }
  }

  if (obj.video_preview_image_url || obj.preview_image_url || obj.resized_image_url || obj.original_image_url) {
    const tUrl = obj.video_preview_image_url || obj.preview_image_url || obj.resized_image_url || obj.original_image_url;
    if (tUrl && typeof tUrl === "string" && !results.thumbnailUrl) {
      results.thumbnailUrl = tUrl.replace(/\\/g, "");
    }
  }

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "object") {
      findMediaInJSON(obj[key], results);
    }
  }
}

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

    const extracted = { videoUrl: undefined as string | undefined, thumbnailUrl: undefined as string | undefined };

    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();

      // Intercept GraphQL responses
      page.on("response", async (res) => {
        const url = res.url();
        if (url.includes("/api/graphql/") || url.includes("graphql")) {
          try {
            const text = await res.text();
            if (text.includes("video_hd_url") || text.includes("video_sd_url") || text.includes("resized_image_url") || text.includes("original_image_url")) {
              try {
                const json = JSON.parse(text);
                findMediaInJSON(json, extracted);
              } catch {
                const vMatch = text.match(/https:\\\/\\\/[^\s"]+?\.mp4[^\s"]*/g) || text.match(/https:\/\/[^\s"]+?\.mp4[^\s"]*/g);
                if (vMatch && vMatch[0] && !extracted.videoUrl) {
                  extracted.videoUrl = vMatch[0].replace(/\\/g, "");
                }
                const imgMatch = text.match(/https:\\\/\\\/scontent[^\s"]+?/g) || text.match(/https:\/\/scontent[^\s"]+?/g);
                if (imgMatch && imgMatch[0] && !extracted.thumbnailUrl) {
                  extracted.thumbnailUrl = imgMatch[0].replace(/\\/g, "");
                }
              }
            }
          } catch {}
        }
      });

      const targetUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${adRecord.adArchiveId}`;
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      await page.waitForTimeout(3500);

      // Iterate ALL <video> elements on page
      const videoEls = await page.$$("video");
      for (const vidEl of videoEls) {
        const src = await vidEl.getAttribute("src");
        if (src && !src.startsWith("blob:") && src.startsWith("http") && !extracted.videoUrl) {
          extracted.videoUrl = src;
        }
        const poster = await vidEl.getAttribute("poster");
        if (poster && poster.startsWith("http") && !extracted.thumbnailUrl) {
          extracted.thumbnailUrl = poster;
        }
      }

      // Iterate ALL <img> elements on page if thumbnail missing
      if (!extracted.thumbnailUrl) {
        const imgEls = await page.$$("img");
        for (const img of imgEls) {
          const src = await img.getAttribute("src");
          if (src && src.includes("fbcdn.net") && src.startsWith("http")) {
            extracted.thumbnailUrl = src;
            break;
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Ad Refresh] Playwright notice for ${adRecord.adArchiveId}:`, err.message);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    const refreshedVideoUrl = extracted.videoUrl || null;
    const refreshedThumbnailUrl = extracted.thumbnailUrl || null;

    if (refreshedVideoUrl || refreshedThumbnailUrl) {
      let finalVideoUrl = refreshedVideoUrl;
      let finalThumbnailUrl = refreshedThumbnailUrl;

      // Backup to Backblaze B2 (with Catbox fallback) if configured
      if (isB2Configured()) {
        if (refreshedVideoUrl) {
          console.log(`[Ad Refresh] Uploading fresh video to storage: ${refreshedVideoUrl.substring(0, 60)}...`);
          const b2Vid = await uploadMediaFromUrlToB2(refreshedVideoUrl, "videos", `${adRecord.adArchiveId}_refreshed`);
          if (b2Vid) finalVideoUrl = b2Vid;
        }
        if (refreshedThumbnailUrl) {
          console.log(`[Ad Refresh] Uploading fresh thumbnail to storage: ${refreshedThumbnailUrl.substring(0, 60)}...`);
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
