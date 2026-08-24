/**
 * Catbox.moe Resilient Fallback Storage Utility
 * Uploads media files anonymously (or with optional userhash) to Catbox.moe / Litterbox.
 * Catbox offers permanent $0 storage with a 200MB limit per file.
 *
 * Features:
 * - Extended timeouts (45s) for large video ad downloads
 * - Browser headers to avoid Cloudflare bot blocking / 403 / fetch failures
 * - Multi-strategy upload: Direct Buffer -> URL Upload -> Litterbox Fallback
 */

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function uploadMediaFromUrlToCatbox(
  sourceUrl: string,
  filename: string
): Promise<string | null> {
  if (!sourceUrl) return null;

  const userHash = process.env.CATBOX_USER_HASH?.trim();

  // 1. Download source media from Meta CDN with 35s timeout & browser headers
  let buffer: Buffer | null = null;
  let contentType = "application/octet-stream";
  let ext = ".jpg";

  if (sourceUrl.includes(".mp4") || sourceUrl.includes("video")) {
    ext = ".mp4";
    contentType = "video/mp4";
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

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
    }
  } catch (err: any) {
    console.warn(`[Catbox Storage] Source download failed/timed out (${err.message}). Trying Catbox URL-upload fallback...`);
  }

  const cleanFilename = filename.endsWith(ext) ? filename : `${filename}${ext}`;

  // Strategy A: Direct file upload to Catbox.moe
  if (buffer && buffer.length > 0) {
    try {
      const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
      const formData = new FormData();
      formData.append("reqtype", "fileupload");
      if (userHash) formData.append("userhash", userHash);
      formData.append("fileToUpload", blob, cleanFilename);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

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
          console.log(`[Catbox Storage] Successfully uploaded to Catbox: ${catboxUrl}`);
          return catboxUrl;
        }
      }
    } catch (err: any) {
      console.warn(`[Catbox Storage] File upload to Catbox failed (${err.message}). Trying URL upload / Litterbox...`);
    }
  }

  // Strategy B: Catbox URL upload (Catbox server fetches URL directly)
  try {
    const formData = new FormData();
    formData.append("reqtype", "urlupload");
    if (userHash) formData.append("userhash", userHash);
    formData.append("url", sourceUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    const urlUploadRes = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (urlUploadRes.ok) {
      const catboxUrl = (await urlUploadRes.text()).trim();
      if (catboxUrl.startsWith("http://") || catboxUrl.startsWith("https://")) {
        console.log(`[Catbox Storage] Successfully uploaded via Catbox URL fetch: ${catboxUrl}`);
        return catboxUrl;
      }
    }
  } catch (err: any) {
    console.warn(`[Catbox Storage] URL upload failed (${err.message})`);
  }

  // Strategy C: Litterbox fallback (Catbox high-capacity mirror)
  if (buffer && buffer.length > 0) {
    try {
      const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
      const formData = new FormData();
      formData.append("reqtype", "fileupload");
      formData.append("time", "72h");
      formData.append("fileToUpload", blob, cleanFilename);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      const litterboxRes = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
        method: "POST",
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (litterboxRes.ok) {
        const litterboxUrl = (await litterboxRes.text()).trim();
        if (litterboxUrl.startsWith("http://") || litterboxUrl.startsWith("https://")) {
          console.log(`[Catbox Storage] Successfully uploaded to Litterbox fallback: ${litterboxUrl}`);
          return litterboxUrl;
        }
      }
    } catch (err: any) {
      console.warn(`[Catbox Storage] Litterbox upload failed: ${err.message}`);
    }
  }

  return null;
}
