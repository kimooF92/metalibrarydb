import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../db";
import { ads } from "../db/schema";
import { isNull, or, eq } from "drizzle-orm";
import { computeSha256, computeDHash } from "../lib/media-hasher";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

function getS3Client(): S3Client | null {
  const keyId = process.env.B2_KEY_ID?.trim();
  const appKey = process.env.B2_APPLICATION_KEY?.trim();
  const endpoint = process.env.B2_ENDPOINT?.trim() || "s3.eu-central-003.backblazeb2.com";
  const region = process.env.B2_REGION?.trim() || "eu-central-003";

  if (!keyId || !appKey) return null;

  const formattedEndpoint = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
  return new S3Client({
    endpoint: formattedEndpoint,
    region,
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: appKey,
    },
  });
}

async function fetchBufferFromUrlOrB2(url: string, s3Client: S3Client | null): Promise<Buffer | null> {
  // Check if it's an internal B2 streaming route
  if (url.startsWith("/api/spy/b2-media?key=") || url.includes("key=")) {
    const match = url.match(/[?&]key=([^&]+)/);
    if (match && match[1] && s3Client) {
      const key = decodeURIComponent(match[1]);
      const bucketName = process.env.B2_BUCKET_NAME?.trim() || "meta-ad-media-feed";
      try {
        const response = await s3Client.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );
        if (response.Body) {
          const streamToBuffer = async (stream: any): Promise<Buffer> => {
            const chunks: any[] = [];
            for await (const chunk of stream) chunks.push(chunk);
            return Buffer.concat(chunks);
          };
          return await streamToBuffer(response.Body);
        }
      } catch (err: any) {
        console.warn(`[B2 GetObject] Failed to fetch key ${key}: ${err.message}`);
      }
    }
  }

  // Otherwise fetch via HTTP
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.facebook.com/",
    },
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    return null;
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function backfillMediaHashes() {
  console.log("Starting Backfill Media Hashes script...");

  const s3Client = getS3Client();

  const targetAds = await db
    .select({
      id: ads.id,
      adArchiveId: ads.adArchiveId,
      mediaType: ads.mediaType,
      thumbnailUrl: ads.thumbnailUrl,
      mediaUrls: ads.mediaUrls,
      mediaHash: ads.mediaHash,
      perceptualHash: ads.perceptualHash,
    })
    .from(ads)
    .where(
      or(
        isNull(ads.mediaHash),
        isNull(ads.perceptualHash)
      )
    )
    .limit(100);

  console.log(`Found ${targetAds.length} ad(s) to process for visual perceptual and content hashing.`);

  if (targetAds.length === 0) {
    console.log("All ads already have media and perceptual hashes computed! Done.");
    process.exit(0);
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const ad of targetAds) {
    processed++;
    const targetUrl = ad.thumbnailUrl || (ad.mediaUrls && ad.mediaUrls[0]);

    if (!targetUrl) {
      console.log(`[${processed}/${targetAds.length}] Ad ${ad.adArchiveId}: No media/thumbnail URL found. Skipping.`);
      continue;
    }

    try {
      const buffer = await fetchBufferFromUrlOrB2(targetUrl, s3Client);

      if (!buffer || buffer.length === 0) {
        console.warn(`[${processed}/${targetAds.length}] Ad ${ad.adArchiveId}: Failed to fetch image buffer.`);
        failed++;
        continue;
      }

      const mediaHash = computeSha256(buffer);
      const perceptualHash = await computeDHash(buffer);

      await db
        .update(ads)
        .set({
          mediaHash,
          perceptualHash: perceptualHash || undefined,
        })
        .where(eq(ads.id, ad.id));

      succeeded++;
      console.log(
        `[${processed}/${targetAds.length}] Ad ${ad.adArchiveId} -> SHA-256: ${mediaHash.substring(0, 8)}... | dHash: ${perceptualHash || "N/A"}`
      );
    } catch (err: any) {
      console.error(`[${processed}/${targetAds.length}] Ad ${ad.adArchiveId} error:`, err.message);
      failed++;
    }
  }

  console.log(`\nBackfill Completed: ${succeeded} succeeded, ${failed} failed out of ${processed} processed.`);
  process.exit(0);
}

backfillMediaHashes();
