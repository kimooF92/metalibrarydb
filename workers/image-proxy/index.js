/**
 * Cloudflare Worker: High-Performance Edge Media Proxy & Cache
 * Live Endpoint: https://meta-image-proxy.kareem-fezani.workers.dev
 */

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

const ALLOWED_EXACT_HOSTS = new Set([
  "cdn.shopify.com",
  "res.cloudinary.com",
  "s3.amazonaws.com",
  "files.catbox.moe",
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
  ".backblazeb2.com",
  ".catbox.moe",
];

const S3_REGIONAL_REGEX = /^[a-z0-9.-]+\.s3[.-][a-z0-9-]+\.amazonaws\.com$/;

function isAllowedHost(host) {
  const normalized = host.toLowerCase().trim();
  if (ALLOWED_EXACT_HOSTS.has(normalized)) return true;
  if (ALLOWED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  if (S3_REGIONAL_REGEX.test(normalized)) return true;
  return false;
}

function isPrivateHost(host) {
  const normalized = host.toLowerCase().trim();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "169.254.169.254" ||
    normalized.includes("::") ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|0\.)/.test(normalized)
  );
}

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    const reqUrl = new URL(request.url);
    const targetUrlStr = reqUrl.searchParams.get("url");

    if (!targetUrlStr) {
      return new Response("Missing 'url' query parameter. Usage: ?url=https://...", { status: 400 });
    }

    let targetUrl;
    try {
      targetUrl = new URL(targetUrlStr);
    } catch {
      return new Response("Invalid target URL", { status: 400 });
    }

    if (targetUrl.protocol !== "https:") {
      return new Response("Only HTTPS URLs permitted", { status: 400 });
    }

    const host = targetUrl.hostname;
    if (isPrivateHost(host)) {
      return new Response("Forbidden network address", { status: 403 });
    }

    if (!isAllowedHost(host)) {
      return new Response("Domain not allowed by security allowlist", { status: 403 });
    }

    // 2. Check Cloudflare Edge Cache
    const cache = caches.default;
    const cacheKey = new Request(targetUrl.toString(), request);
    let cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      const headers = new Headers(cachedResponse.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("X-Cache-Status", "HIT");
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers,
      });
    }

    // 3. Fetch from origin CDN with Facebook-safe headers
    try {
      const originResponse = await fetch(targetUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://www.facebook.com/ads/library/",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (!originResponse.ok) {
        return new Response(`Origin responded with status ${originResponse.status}`, {
          status: originResponse.status,
        });
      }

      const contentType = originResponse.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
        return new Response("Target is not an image or video", { status: 400 });
      }

      const contentLength = originResponse.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_SIZE_BYTES) {
        return new Response("File exceeds 10MB limit", { status: 413 });
      }

      // 4. Construct edge response with 30-day cache control
      const responseHeaders = new Headers({
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=2592000, s-maxage=2592000, immutable",
        "X-Cache-Status": "MISS",
      });

      const responseToReturn = new Response(originResponse.body, {
        status: 200,
        headers: responseHeaders,
      });

      // 5. Store in Cloudflare Edge Cache in background
      ctx.waitUntil(cache.put(cacheKey, responseToReturn.clone()));

      return responseToReturn;
    } catch (err) {
      return new Response("Failed to fetch upstream media: " + err.message, { status: 502 });
    }
  },
};

