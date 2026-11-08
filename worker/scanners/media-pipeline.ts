import { isB2Configured, uploadMediaWithHashing } from "../../lib/b2-storage";
import { cacheThumbnail } from "../thumbnail-cache";

export interface ProcessedAdMedia {
  finalMediaUrls: string[];
  finalThumbnailUrl: string | null;
  storagePath: string | null;
  mediaHash: string | null;
  perceptualHash: string | null;
}

/**
 * Downloads and persists ad creative media assets to Backblaze B2 (with perceptual hashing)
 * or falls back to Supabase thumbnail caching.
 */
export async function processAdMedia(adData: {
  adArchiveId: string;
  mediaUrls: string[];
  thumbnailUrl: string | null;
  mediaType: "image" | "video" | "carousel" | "unknown";
}): Promise<ProcessedAdMedia> {
  let finalMediaUrls = adData.mediaUrls || [];
  let finalThumbnailUrl = adData.thumbnailUrl;
  let storagePath: string | null = null;
  let mediaHash: string | null = null;
  let perceptualHash: string | null = null;

  if (isB2Configured()) {
    // 1. Best-effort B2 thumbnail caching & perceptual hash
    if (finalThumbnailUrl) {
      try {
        const res = await uploadMediaWithHashing(
          finalThumbnailUrl,
          "thumbnails",
          `${adData.adArchiveId}_thumb`
        );
        if (res && res.url) {
          finalThumbnailUrl = res.url;
          storagePath = `b2/thumbnails/${adData.adArchiveId}.jpg`;
          mediaHash = res.mediaHash;
          perceptualHash = res.perceptualHash;
        }
      } catch (e: any) {
        console.warn(`[Media Pipeline] Thumbnail B2 upload error for ${adData.adArchiveId}:`, e.message);
      }
    }

    // 2. Best-effort B2 media caching for all types (video, image, carousel slides)
    if (finalMediaUrls.length > 0) {
      const b2MediaUrls = await Promise.all(
        finalMediaUrls.map(async (url, idx) => {
          if (
            url.includes("backblazeb2.com") ||
            url.includes("/api/spy/b2-media") ||
            url.includes("files.catbox.moe")
          ) {
            return url;
          }
          const isUrlVid = adData.mediaType === "video" || url.includes(".mp4");

          // Skip uploading heavy full MP4 to storage to save 99.8% bandwidth & storage
          if (isUrlVid) return url;

          // Upload image assets & carousel slides
          try {
            const res = await uploadMediaWithHashing(url, "images", `${adData.adArchiveId}_${idx}`);
            if (res && res.url) {
              if (!mediaHash) mediaHash = res.mediaHash;
              if (!perceptualHash) perceptualHash = res.perceptualHash;
              return res.url;
            }
          } catch (e: any) {
            console.warn(`[Media Pipeline] Media upload error for ${adData.adArchiveId}_${idx}:`, e.message);
          }
          return url;
        })
      );
      finalMediaUrls = b2MediaUrls;

      // If thumbnail was missing or null, pick first image URL (never an MP4 video)
      if (!finalThumbnailUrl && finalMediaUrls.length > 0) {
        const firstImage = finalMediaUrls.find((u) => !u.includes(".mp4") && !u.includes("/videos/"));
        if (firstImage) {
          finalThumbnailUrl = firstImage;
        }
      }
    }
  } else {
    // Fallback to Supabase thumbnail caching if B2 not configured
    const cached = await cacheThumbnail(
      adData.adArchiveId,
      adData.thumbnailUrl
    );
    if (cached.publicUrl) {
      finalThumbnailUrl = cached.publicUrl;
      storagePath = cached.storagePath;
    }
  }

  return {
    finalMediaUrls,
    finalThumbnailUrl,
    storagePath,
    mediaHash,
    perceptualHash,
  };
}

