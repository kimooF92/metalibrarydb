import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { uploadMediaFromUrlToCatbox } from "./catbox-storage";

export function isB2Configured(): boolean {
  const keyId = process.env.B2_KEY_ID?.trim();
  const appKey = process.env.B2_APPLICATION_KEY?.trim();
  const bucketName = process.env.B2_BUCKET_NAME?.trim() || "meta-ad-media-feed";
  return Boolean(keyId && appKey && bucketName);
}

let cachedS3Client: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (!isB2Configured()) return null;
  if (cachedS3Client) return cachedS3Client;

  const keyId = process.env.B2_KEY_ID?.trim()!;
  const appKey = process.env.B2_APPLICATION_KEY?.trim()!;
  const endpoint = process.env.B2_ENDPOINT?.trim() || "s3.eu-central-003.backblazeb2.com";
  const region = process.env.B2_REGION?.trim() || "eu-central-003";
  const formattedEndpoint = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;

  cachedS3Client = new S3Client({
    endpoint: formattedEndpoint,
    region: region,
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: appKey,
    },
  });

  return cachedS3Client;
}

/**
 * Uploads a Buffer asset directly to Backblaze B2.
 */
export async function uploadBufferToB2(
  buffer: Buffer,
  key: string,
  contentType: string = "application/octet-stream"
): Promise<string | null> {
  const client = getS3Client();
  const bucketName = process.env.B2_BUCKET_NAME?.trim() || "meta-ad-media-feed";

  if (!client) {
    return null;
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    // Return internal streaming route URL which streams directly from B2
    return `/api/spy/b2-media?key=${encodeURIComponent(key)}`;
  } catch (err: any) {
    console.error(`[B2 Storage] Failed to upload ${key} to B2:`, err.message);
    return null;
  }
}

/**
 * Downloads a video or image from a remote URL and uploads it to Backblaze B2.
 * If Backblaze B2 fails or hits storage capacity, automatically falls back to Catbox.moe.
 */
export async function uploadMediaFromUrlToB2(
  sourceUrl: string,
  keyPrefix: "videos" | "thumbnails",
  filename: string
): Promise<string | null> {
  if (!sourceUrl) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.facebook.com/",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[B2 Storage] Failed to fetch source media ${sourceUrl}: status ${res.status}`);
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length === 0) return null;

    let contentType = res.headers.get("content-type") || "application/octet-stream";
    let ext = ".jpg";
    if (keyPrefix === "videos" || contentType.includes("video") || sourceUrl.includes(".mp4")) {
      ext = ".mp4";
      if (!contentType.includes("video")) contentType = "video/mp4";
    }

    const cleanFilename = filename.endsWith(ext) ? filename : `${filename}${ext}`;
    const key = `${keyPrefix}/${cleanFilename}`;

    // 1. Try Primary Upload to Backblaze B2
    const b2Url = await uploadBufferToB2(buffer, key, contentType);
    if (b2Url) return b2Url;

    // 2. Secondary Fallback to Catbox.moe (if B2 is full or unavailable)
    console.warn(`[B2 Storage] Backblaze upload returned null. Falling back to Catbox.moe for ${filename}...`);
    const catboxUrl = await uploadMediaFromUrlToCatbox(sourceUrl, cleanFilename);
    return catboxUrl;
  } catch (err: any) {
    console.error(`[B2 Storage] Primary B2 upload error for ${sourceUrl}, trying Catbox fallback:`, err.message);
    return await uploadMediaFromUrlToCatbox(sourceUrl, filename);
  }
}
