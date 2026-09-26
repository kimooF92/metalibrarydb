import { uploadMediaFromUrlToB2, isB2Configured } from "../lib/b2-storage";
import { uploadMediaFromUrlToCatbox } from "../lib/catbox-storage";

export async function cacheThumbnail(
  adArchiveId: string,
  mediaUrl: string | null | undefined
): Promise<{ storagePath: string | null; publicUrl: string | null }> {
  if (!mediaUrl) return { storagePath: null, publicUrl: null };

  // 1. Prioritize Backblaze B2 (0$ egress & 10GB free storage, no Supabase storage used)
  if (isB2Configured()) {
    try {
      const b2Url = await uploadMediaFromUrlToB2(mediaUrl, "thumbnails", adArchiveId);
      if (b2Url) {
        return { storagePath: `b2/thumbnails/${adArchiveId}.jpg`, publicUrl: b2Url };
      }
    } catch (err: any) {
      console.warn(`[Thumbnail Cache] B2 upload warning for ${adArchiveId}:`, err.message);
    }
  }

  // 2. Secondary fallback: Catbox.moe (Unlimited free storage, 0 Supabase egress)
  try {
    const catboxUrl = await uploadMediaFromUrlToCatbox(mediaUrl, `thumb_${adArchiveId}`);
    if (catboxUrl) {
      return { storagePath: `catbox/${adArchiveId}.jpg`, publicUrl: catboxUrl };
    }
  } catch (catboxErr: any) {
    console.warn(`[Thumbnail Cache] Catbox upload notice for ${adArchiveId}:`, catboxErr.message);
  }

  // 3. Quota-Protective Final Fallback: Use Meta CDN direct URL (0 Supabase storage, 0 Supabase egress)
  return {
    storagePath: null,
    publicUrl: mediaUrl,
  };
}
