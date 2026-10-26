import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret } from "@/lib/api-guard";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB maximum image size

const ALLOWED_EXACT_HOSTS = new Set([
  "cdn.shopify.com",
  "res.cloudinary.com",
  "s3.amazonaws.com",
]);

const ALLOWED_SUFFIXES = [
  ".myshopify.com",
  ".youcan.shop",
  ".cloudinary.com",
  ".s3.amazonaws.com",
  ".cloudfront.net",
  ".fbcdn.net",
  ".facebook.com",
  ".cdninstagram.com",
  ".instagram.com",
  ".fbsbx.com",
  ".supabase.co",
  ".supabase.in",
];

// Matches regional AWS S3 bucket patterns (e.g., bucket.s3.eu-west-1.amazonaws.com or bucket.s3-eu-west-1.amazonaws.com)
const S3_REGIONAL_REGEX = /^[a-z0-9.-]+\.s3[.-][a-z0-9-]+\.amazonaws\.com$/;

export function isAllowedCdnHost(host: string): boolean {
  const normalized = host.toLowerCase().trim();
  if (ALLOWED_EXACT_HOSTS.has(normalized)) return true;
  if (ALLOWED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  if (S3_REGIONAL_REGEX.test(normalized)) return true;
  return false;
}

export function isPrivateOrLocalHost(host: string): boolean {
  const normalized = host.toLowerCase().trim();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "169.254.169.254" ||
    normalized.includes("::") ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|0\.)/.test(normalized)
  ) {
    return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  const urlStr = req.nextUrl.searchParams.get("url");
  if (!urlStr) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    const targetUrl = new URL(urlStr);

    // 1. Enforce HTTPS only
    if (targetUrl.protocol !== "https:") {
      return new NextResponse("Only HTTPS image sources are permitted", { status: 400 });
    }

    const host = targetUrl.hostname;

    // 2. Block private/internal network addresses (SSRF prevention)
    if (isPrivateOrLocalHost(host)) {
      return new NextResponse("Access to private/local network addresses is forbidden", { status: 403 });
    }

    // 3. Security allowlist: Meta CDNs, Supabase storage, AWS S3/CloudFront, and verified e-commerce CDNs
    if (!isAllowedCdnHost(host)) {
      return new NextResponse("Invalid image domain", { status: 403 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(urlStr, {
        signal: controller.signal,
        redirect: "manual", // Prevent open redirect SSRF bypass
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://www.facebook.com/ads/library/",
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "cross-site",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        return new NextResponse("Image redirects are not permitted", { status: 403 });
      }

      if (!res.ok) {
        return new NextResponse("Failed to fetch image from CDN", { status: res.status });
      }

      const contentType = res.headers.get("content-type") || "image/jpeg";
      if (!contentType.toLowerCase().startsWith("image/")) {
        return new NextResponse("Target did not return an image content-type", { status: 400 });
      }

      // Check Content-Length header up front if provided
      const contentLengthHeader = res.headers.get("content-length");
      if (contentLengthHeader) {
        const declaredLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(declaredLength) && declaredLength > MAX_SIZE_BYTES) {
          return new NextResponse("Image size exceeds 5MB limit", { status: 413 });
        }
      }

      if (!res.body) {
        return new NextResponse("Empty response body from CDN", { status: 502 });
      }

      // Stream response with byte counter to enforce MAX_SIZE_BYTES BEFORE memory allocation
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_SIZE_BYTES) {
            controller.abort();
            return new NextResponse("Image size exceeds 5MB limit", { status: 413 });
          }
          chunks.push(value);
        }
      }

      // Merge chunks into single response buffer
      const mergedBuffer = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        mergedBuffer.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return new NextResponse(mergedBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err: any) {
    if (err.name === "AbortError") {
      return new NextResponse("Image download timed out or was aborted", { status: 504 });
    }
    return new NextResponse(err.message || "Proxy error", { status: 500 });
  }
}
