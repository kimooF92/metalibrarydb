/**
 * Catbox.moe Fallback Storage Utility
 * Uploads media files anonymously to Catbox.moe when primary storage (Backblaze B2) is full or unavailable.
 * Catbox files are stored permanently for $0 without accounts or credit cards.
 */

export async function uploadMediaFromUrlToCatbox(
  sourceUrl: string,
  filename: string
): Promise<string | null> {
  if (!sourceUrl) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    // 1. Download source media from Meta CDN
    const sourceRes = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.facebook.com/",
      },
    });

    clearTimeout(timeoutId);

    if (!sourceRes.ok) {
      console.warn(`[Catbox Storage] Failed to fetch source media ${sourceUrl}: status ${sourceRes.status}`);
      return null;
    }

    const arrayBuf = await sourceRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length === 0) return null;

    let contentType = sourceRes.headers.get("content-type") || "application/octet-stream";
    let ext = ".jpg";
    if (contentType.includes("video") || sourceUrl.includes(".mp4")) {
      ext = ".mp4";
      contentType = "video/mp4";
    }

    const cleanFilename = filename.endsWith(ext) ? filename : `${filename}${ext}`;
    const blob = new Blob([buffer], { type: contentType });

    // 2. Upload to Catbox API
    const formData = new FormData();
    formData.append("reqtype", "fileupload");
    formData.append("fileToUpload", blob, cleanFilename);

    const catboxRes = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
    });

    if (!catboxRes.ok) {
      console.warn(`[Catbox Storage] Upload request failed with status: ${catboxRes.status}`);
      return null;
    }

    const catboxUrl = (await catboxRes.text()).trim();

    if (catboxUrl.startsWith("http://") || catboxUrl.startsWith("https://")) {
      console.log(`[Catbox Storage] Successfully uploaded to Catbox fallback: ${catboxUrl}`);
      return catboxUrl;
    }

    console.warn(`[Catbox Storage] Catbox returned unexpected response: ${catboxUrl}`);
    return null;
  } catch (err: any) {
    console.error(`[Catbox Storage] Failed to upload ${sourceUrl} to Catbox:`, err.message);
    return null;
  }
}
