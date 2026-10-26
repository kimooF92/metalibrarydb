import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret } from "@/lib/api-guard";

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

    const host = targetUrl.hostname.toLowerCase();

    // 2. Block private/internal network addresses (SSRF prevention)
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host === "169.254.169.254" ||
      host.includes("::") ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)
    ) {
      return new NextResponse("Access to private/local network addresses is forbidden", { status: 403 });
    }

    // 3. Security allowlist: Meta CDNs, Supabase storage, and verified e-commerce CDNs
    const isAllowedHost =
      host === "cdn.shopify.com" ||
      host.endsWith(".myshopify.com") ||
      host.endsWith(".youcan.shop") ||
      host === "res.cloudinary.com" ||
      host.endsWith(".fbcdn.net") ||
      host.endsWith(".facebook.com") ||
      host.endsWith(".cdninstagram.com") ||
      host.endsWith(".instagram.com") ||
      host.endsWith(".fbsbx.com") ||
      host.endsWith(".supabase.co") ||
      host.endsWith(".supabase.in");

    if (!isAllowedHost) {
      return new NextResponse("Invalid image domain", { status: 403 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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

    clearTimeout(timeoutId);

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

    const arrayBuffer = await res.arrayBuffer();
    // Cap response size at 5MB to prevent memory exhaustion
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return new NextResponse("Image size exceeds 5MB limit", { status: 413 });
    }

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    return new NextResponse(err.message || "Proxy error", { status: 500 });
  }
}
