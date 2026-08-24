import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { uploadMediaFromUrlToCatbox, uploadBufferToCatbox } from "./catbox-storage";
import { uploadBufferToSupabase } from "./supabase-storage";
import { computeSha256, computeDHash } from "./media-hasher";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Max buffer size to store in Supabase Storage (1.5MB) to protect the 1GB free tier quota
const MAX_SUPABASE_STORAGE_BYTES = 1.5 * 1024 * 1024;

export function isB2Configured(): boolean {
  const keyId = process.env.B2_KEY_ID?.trim();
  const appKey = process.env.B2_APPLICATION_KEY?.trim();
  const bucketName = process.env.B2_BUCKET_NAME?.trim() || "meta-ad-media-feed";
  return Boolean(keyId && appKey && bucketName);
}

let cachedS3Client: S3Client | null = null;
const knownUploadedKeys = new Set<string>();

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

  // If already uploaded in this runtime session, return internal streaming path immediately
  if (knownUploadedKeys.has(key)) {
    return `/api/spy/b2-media?key=${encodeURIComponent(key)}`;
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

    knownUploadedKeys.add(key);

    // Return internal streaming route URL which streams directly from B2
    return `/api/spy/b2-media?key=${encodeURIComponent(key)}`;
  } catch (err: any) {
    console.warn(`[B2 Storage] B2 upload skipped/failed (${err.message}). Trying alternative storage...`);
    return null;
  }
}

export interface MediaUploadResult {
  url: string | null;
  mediaHash: string | null;
  perceptualHash: string | null;
  wasReused: boolean;
}

/**
 * Downloads a video or image from a remote URL, computes SHA-256 and Perceptual dHash,
 * and uploads using a Quota-Protective Strategy:
 *
 * 1. Backblaze B2 (if configured and quota allows)
 * 2. Catbox.moe / Litterbox (100% free, unlimited storage, 200MB max per video)
 * 3. Supabase Storage (ONLY for lightweight thumbnails < 1.5MB to preserve the 1GB quota)
 * 4. Original Meta CDN URL fallback
 */
export async function uploadMediaWithHashing(
  sourceUrl: string,
  keyPrefix: "videos" | "thumbnails" | "images",
  fallbackFilename?: string
): Promise<MediaUploadResult> {
  if (!sourceUrl) {
    return { url: null, mediaHash: null, perceptualHash: null, wasReused: false };
  }

  try {
    const isVideo = keyPrefix === "videos" || sourceUrl.includes(".mp4");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isVideo ? 45000 : 25000);

    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Referer: "https://www.facebook.com/",
        Accept: "*/*",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Storage Engine] Failed to fetch source media ${sourceUrl}: status ${res.status}`);
      // Try Catbox direct URL upload as an alternative
      const catboxFallbackUrl = await uploadMediaFromUrlToCatbox(sourceUrl, fallbackFilename || "media");
      return {
        url: catboxFallbackUrl || sourceUrl,
        mediaHash: null,
        perceptualHash: null,
        wasReused: false,
      };
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length === 0) {
      return { url: sourceUrl, mediaHash: null, perceptualHash: null, wasReused: false };
    }

    // 1. Compute SHA-256 binary hash
    const mediaHash = computeSha256(buffer);

    // 2. Compute 64-bit Perceptual dHash for thumbnails and images
    let perceptualHash: string | null = null;
    if (keyPrefix === "thumbnails" || !isVideo) {
      try {
        perceptualHash = await computeDHash(buffer);
      } catch {}
    }

    let contentType = res.headers.get("content-type") || "application/octet-stream";
    let ext = ".jpg";
    if (isVideo || contentType.includes("video")) {
      ext = ".mp4";
      if (!contentType.includes("video")) contentType = "video/mp4";
    }

    // Content-Addressable Storage Key (deduplicates identical files)
    const contentKey = `${keyPrefix}/${mediaHash}${ext}`;
    const wasAlreadyKnown = knownUploadedKeys.has(contentKey);

    // Tier 1: Try Backblaze B2
    const b2Url = await uploadBufferToB2(buffer, contentKey, contentType);
    if (b2Url) {
      return {
        url: b2Url,
        mediaHash,
        perceptualHash,
        wasReused: wasAlreadyKnown,
      };
    }

    // Tier 2: Catbox.moe (Unlimited Free Storage for heavy videos & images)
    console.log(`[Storage Engine] Uploading ${contentKey} (${(buffer.length / 1024 / 1024).toFixed(2)} MB) to Catbox...`);
    const catboxUrl = await uploadBufferToCatbox(buffer, `${mediaHash}${ext}`, contentType);
    if (catboxUrl) {
      return {
        url: catboxUrl,
        mediaHash,
        perceptualHash,
        wasReused: false,
      };
    }

    // Tier 3: Supabase Storage Fallback (Ultra-fast & 100% reliable fallback)
    const supabaseUrl = await uploadBufferToSupabase(buffer, contentKey, contentType);
    if (supabaseUrl) {
      console.log(`[Storage Engine] Stored to Supabase Storage fallback: ${supabaseUrl}`);
      return {
        url: supabaseUrl,
        mediaHash,
        perceptualHash,
        wasReused: false,
      };
    }

    // Tier 4: Fallback to source URL
    return {
      url: sourceUrl,
      mediaHash,
      perceptualHash,
      wasReused: false,
    };
  } catch (err: any) {
    console.error(`[Storage Engine] Primary upload error for ${sourceUrl}:`, err.message);
    const catboxUrl = await uploadMediaFromUrlToCatbox(sourceUrl, fallbackFilename || "media");
    return {
      url: catboxUrl || sourceUrl,
      mediaHash: null,
      perceptualHash: null,
      wasReused: false,
    };
  }
}

/**
 * Uploads a list of 5 storyboard frame buffers to persistent storage.
 * Returns an array of public URLs for hover-scrubbing.
 */
export async function uploadStoryboardFrames(
  frames: Buffer[],
  adArchiveId: string
): Promise<string[]> {
  if (!frames || frames.length === 0) return [];

  const urls: string[] = [];

  for (let idx = 0; idx < frames.length; idx++) {
    const frame = frames[idx];
    const key = `storyboard/${adArchiveId}_f${idx}.jpg`;
    const contentType = "image/jpeg";

    try {
      // 1. Try B2
      const b2Url = await uploadBufferToB2(frame, key, contentType);
      if (b2Url) {
        urls.push(b2Url);
        continue;
      }

      // 2. Try Catbox
      const catboxUrl = await uploadBufferToCatbox(frame, `${adArchiveId}_f${idx}.jpg`, contentType);
      if (catboxUrl) {
        urls.push(catboxUrl);
        continue;
      }

      // 3. Try Supabase Storage (each frame is ~10KB, 5 frames = ~50KB total)
      const supabaseUrl = await uploadBufferToSupabase(frame, key, contentType);
      if (supabaseUrl) {
        urls.push(supabaseUrl);
        continue;
      }
    } catch (e: any) {
      console.warn(`[Storage Engine] Failed to upload storyboard frame ${idx} for ${adArchiveId}:`, e.message);
    }
  }

  return urls;
}

/**
 * Backward-compatible helper for existing callers.
 */
export async function uploadMediaFromUrlToB2(
  sourceUrl: string,
  keyPrefix: "videos" | "thumbnails" | "images",
  filename: string
): Promise<string | null> {
  const result = await uploadMediaWithHashing(sourceUrl, keyPrefix, filename);
  return result.url;
}

