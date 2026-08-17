import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { isB2Configured } from "@/lib/b2-storage";

const keyId = process.env.B2_KEY_ID?.trim();
const appKey = process.env.B2_APPLICATION_KEY?.trim();
const bucketName = process.env.B2_BUCKET_NAME?.trim() || "meta-ad-media-feed";
const endpoint = process.env.B2_ENDPOINT?.trim() || "s3.eu-central-003.backblazeb2.com";
const region = process.env.B2_REGION?.trim() || "eu-central-003";

const formattedEndpoint = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;

const s3Client = isB2Configured()
  ? new S3Client({
      endpoint: formattedEndpoint,
      region: region,
      credentials: {
        accessKeyId: keyId!,
        secretAccessKey: appKey!,
      },
    })
  : null;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !s3Client) {
    return new NextResponse("Missing key parameter or B2 not configured", { status: 400 });
  }

  try {
    const rangeHeader = req.headers.get("range");

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      Range: rangeHeader || undefined,
    });

    const b2Res = await s3Client.send(command);

    if (!b2Res.Body) {
      return new NextResponse("Media object body not found", { status: 444 });
    }

    const contentType = b2Res.ContentType || (key.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
    const stream = b2Res.Body.transformToWebStream();

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    };

    if (b2Res.ContentRange) {
      responseHeaders["Content-Range"] = b2Res.ContentRange;
    }
    if (b2Res.ContentLength) {
      responseHeaders["Content-Length"] = String(b2Res.ContentLength);
    }

    const status = rangeHeader && b2Res.ContentRange ? 206 : 200;

    return new NextResponse(stream as any, {
      status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error(`[B2 Media Route Error] Failed to stream key ${key}:`, err.message);
    return new NextResponse(err.message || "Failed to stream media from B2", { status: 500 });
  }
}
