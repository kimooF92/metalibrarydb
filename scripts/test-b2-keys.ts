import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

async function testB2Keys() {
  const keyId = process.env.B2_KEY_ID?.trim()!;
  const appKey = process.env.B2_APPLICATION_KEY?.trim()!;
  const endpoint = process.env.B2_ENDPOINT?.trim() || "s3.eu-central-003.backblazeb2.com";
  const region = process.env.B2_REGION?.trim() || "eu-central-003";
  const bucketName = process.env.B2_BUCKET_NAME?.trim() || "meta-ad-media-feed";
  const formattedEndpoint = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;

  const client = new S3Client({
    endpoint: formattedEndpoint,
    region,
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: appKey,
    },
  });

  const keysToCheck = [
    "thumbnails/3144652572392932.jpg",
    "videos/3144652572392932_0.mp4",
    "thumbnails/1025817866610135.jpg",
    "videos/1025817866610135_0.mp4",
  ];

  console.log("Checking B2 object existence in bucket:", bucketName);
  for (const key of keysToCheck) {
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
      console.log(`✓ [EXISTS] ${key} (size: ${res.ContentLength} bytes, type: ${res.ContentType})`);
    } catch (err: any) {
      console.log(`✗ [NOT FOUND] ${key} (${err.name || err.message})`);
    }
  }

  process.exit(0);
}

testB2Keys();
