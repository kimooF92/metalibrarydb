import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { uploadMediaFromUrlToCatbox } from "./catbox-storage";
import { computeSha256, computeDHash } from "./media-hasher";

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
    console.error(`[B2 Storage] Failed to upload ${key} to B2:`, err.message);
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
 * and uploads to Backblaze B2 using Content-Addressable Storage (deduplicated by content hash).
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.facebook.com/",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[B2 Storage] Failed to fetch source media ${sourceUrl}: status ${res.status}`);
      return { url: null, mediaHash: null, perceptualHash: null, wasReused: false };
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length === 0) {
      return { url: null, mediaHash: null, perceptualHash: null, wasReused: false };
    }

    // 1. Compute SHA-256 binary hash
    const mediaHash = computeSha256(buffer);

    // 2. Compute 64-bit Perceptual dHash for thumbnails and images
    let perceptualHash: string | null = null;
    if (keyPrefix === "thumbnails" || !sourceUrl.includes(".mp4")) {
      perceptualHash = await computeDHash(buffer);
    }

    let contentType = res.headers.get("content-type") || "application/octet-stream";
    let ext = ".jpg";
    if (keyPrefix === "videos" || contentType.includes("video") || sourceUrl.includes(".mp4")) {
      ext = ".mp4";
      if (!contentType.includes("video")) contentType = "video/mp4";
    }

    // Content-Addressable Storage Key (deduplicates identical files)
    const contentKey = `${keyPrefix}/${mediaHash}${ext}`;
    const wasAlreadyKnown = knownUploadedKeys.has(contentKey);

    // 3. Try Primary Upload to Backblaze B2
    const b2Url = await uploadBufferToB2(buffer, contentKey, contentType);
    if (b2Url) {
      return {
        url: b2Url,
        mediaHash,
        perceptualHash,
        wasReused: wasAlreadyKnown,
      };
    }

    // 4. Secondary Fallback to Catbox.moe
    console.warn(`[B2 Storage] Backblaze upload returned null. Falling back to Catbox.moe for ${contentKey}...`);
    const catboxUrl = await uploadMediaFromUrlToCatbox(sourceUrl, `${mediaHash}${ext}`);
    return {
      url: catboxUrl,
      mediaHash,
      perceptualHash,
      wasReused: false,
    };
  } catch (err: any) {
    console.error(`[B2 Storage] Primary B2 upload error for ${sourceUrl}:`, err.message);
    const catboxUrl = await uploadMediaFromUrlToCatbox(sourceUrl, fallbackFilename || "media");
    return {
      url: catboxUrl,
      mediaHash: null,
      perceptualHash: null,
      wasReused: false,
    };
  }
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
