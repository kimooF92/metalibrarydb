import { isFbCdnUrl, isPermanentMediaUrl } from "./fb-cdn";

/**
 * Utility for resolving proxied media and image URLs.
 *
 * Routes requests to high-performance Cloudflare Edge Worker (when NEXT_PUBLIC_IMAGE_PROXY_URL is set)
 * or seamlessly falls back to the local Next.js route (/api/spy/image-proxy).
 */
export const CLOUDFLARE_IMAGE_PROXY_DEFAULT = "https://meta-image-proxy.kareem-fezani.workers.dev";

export function getProxiedImageUrl(originalUrl: string | null | undefined): string {
  if (!originalUrl || typeof originalUrl !== "string") return "";

  // If already wrapped in a proxy URL, prevent double-wrapping
  if (originalUrl.includes("/api/spy/image-proxy") || originalUrl.includes("workers.dev")) {
    return originalUrl;
  }

  const proxyBase = process.env.NEXT_PUBLIC_IMAGE_PROXY_URL || CLOUDFLARE_IMAGE_PROXY_DEFAULT;
  return `${proxyBase}?url=${encodeURIComponent(originalUrl)}`;
}

/**
 * Smart image URL resolver for ad creatives and thumbnails:
 * - If it's an ephemeral Meta/Facebook/Instagram CDN URL, automatically routes through Cloudflare proxy immediately
 *   to pre-cache at edge and avoid hotlink blocks and oe token expirations.
 * - If forceProxy is true (e.g. on direct image error fallback), routes through proxy.
 * - Otherwise (permanent media like B2, Supabase Storage, or direct assets), returns original URL directly.
 */
export function getSmartMediaUrl(originalUrl: string | null | undefined, forceProxy = false): string {
  if (!originalUrl || typeof originalUrl !== "string") return "";

  if (forceProxy) {
    return getProxiedImageUrl(originalUrl);
  }

  // Permanent storage (Backblaze B2, Supabase, Cloudinary) doesn't expire and doesn't need proxying
  if (isPermanentMediaUrl(originalUrl)) {
    return originalUrl;
  }

  // Meta / Instagram CDN URLs expire rapidly and suffer from hotlink blocking; route directly through Cloudflare
  if (isFbCdnUrl(originalUrl)) {
    return getProxiedImageUrl(originalUrl);
  }

  return originalUrl;
}
