/**
 * Catbox.moe Permanent Storage Utility
 * Uploads media files directly to your Catbox.moe account for permanent $0 storage.
 *
 * Features:
 * - Direct Buffer Upload (zero redundant downloads, fastest speed)
 * - Permanent file retention (files.catbox.moe)
 * - 200MB file limit for videos and images
 * - Fast failover timeout (12s) to prevent stalled scraper tasks during Catbox maintenance
 */

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Uploads an in-memory buffer directly to Catbox.moe.
 * Avoids any redundant network downloads.
 */
export async function uploadBufferToCatbox(
  buffer: Buffer,
  filename: string,
  contentType: string = "application/octet-stream"
): Promise<string | null> {
  if (!buffer || buffer.length === 0) return null;

  const userHash = process.env.CATBOX_USER_HASH?.trim();

  let ext = ".jpg";
  if (contentType.includes("video") || filename.includes(".mp4")) {
    ext = ".mp4";
    contentType = "video/mp4";
  }

  const cleanFilename = filename.endsWith(ext) ? filename : `${filename}${ext}`;

  try {
    const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
    const formData = new FormData();
    formData.append("reqtype", "fileupload");
    if (userHash) formData.append("userhash", userHash);
    formData.append("fileToUpload", blob, cleanFilename);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const catboxRes = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (catboxRes.ok) {
      const catboxUrl = (await catboxRes.text()).trim();
      if (catboxUrl.startsWith("http://") || catboxUrl.startsWith("https://")) {
        console.log(`[Catbox Storage] Successfully uploaded to permanent Catbox: ${catboxUrl}`);
        return catboxUrl;
      }
    }
  } catch (err: any) {
    console.warn(`[Catbox Storage] Catbox upload unavailable (${err.message}). Using storage fallback...`);
  }

  return null;
}

/**
 * Helper to download source media from URL and upload to Catbox.moe.
 */
export async function uploadMediaFromUrlToCatbox(
  sourceUrl: string,
  filename: string
): Promise<string | null> {
  if (!sourceUrl) return null;

  let buffer: Buffer | null = null;
  let contentType = "application/octet-stream";
  let ext = ".jpg";

  if (sourceUrl.includes(".mp4") || sourceUrl.includes("video")) {
    ext = ".mp4";
    contentType = "video/mp4";
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const sourceRes = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Referer": "https://www.facebook.com/",
        "Accept": "*/*",
      },
    });

    clearTimeout(timeoutId);

    if (sourceRes.ok) {
      const detectedType = sourceRes.headers.get("content-type");
      if (detectedType) {
        contentType = detectedType;
        if (contentType.includes("video")) ext = ".mp4";
      }
      const arrayBuf = await sourceRes.arrayBuffer();
      if (arrayBuf.byteLength > 0) {
        buffer = Buffer.from(arrayBuf);
      }
    } else {
      console.warn(`[Catbox Storage] Source media fetch status ${sourceRes.status} for ${sourceUrl}`);
      return null;
    }
  } catch (err: any) {
    console.warn(`[Catbox Storage] Source media download failed (${err.message}) for ${sourceUrl}`);
    return null;
  }

  if (buffer) {
    return uploadBufferToCatbox(buffer, filename, contentType);
  }

  return null;
}
