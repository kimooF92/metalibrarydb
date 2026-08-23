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
    // Security check: Only proxy Facebook/Meta CDN and Supabase URLs
    const allowedHost =
      targetUrl.hostname.endsWith(".fbcdn.net") ||
      targetUrl.hostname.endsWith(".facebook.com") ||
      targetUrl.hostname.endsWith(".cdninstagram.com") ||
      targetUrl.hostname.endsWith(".fbsbx.com") ||
      targetUrl.hostname.endsWith(".supabase.co") ||
      targetUrl.hostname.endsWith(".supabase.in");

    if (!allowedHost) {
      return new NextResponse("Invalid image domain", { status: 403 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(urlStr, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.facebook.com/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return new NextResponse("Failed to fetch image from CDN", { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();

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
