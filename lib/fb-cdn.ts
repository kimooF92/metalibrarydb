/**
 * lib/fb-cdn.ts
 *
 * Utilities for Meta / Facebook CDN URL inspection, expiration detection,
 * and safe media fallback management.
 */

/**
 * Checks whether a given URL is a Meta / Facebook CDN asset.
 */
export function isFbCdnUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return (
    url.includes("fbcdn.net") ||
    url.includes("facebook.com") ||
    url.includes("fbsbx.com") ||
    url.includes("cdninstagram.com") ||
    url.includes("instagram.com")
  );
}

/**
 * Checks whether a URL is a permanent cloud storage asset (e.g. Backblaze B2, Catbox, Supabase)
 * which never expires via Facebook CDN URL token rules.
 */
export function isPermanentMediaUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return (
    url.includes("backblazeb2.com") ||
    url.includes("catbox.moe") ||
    url.includes("res.cloudinary.com") ||
    url.includes("supabase.co") ||
    url.includes("s3.amazonaws.com")
  );
}

/**
 * Checks whether a URL is a genuine video stream/file (.mp4, /videos/, video CDN, etc.)
 * and strictly NOT a static image (.jpg, .jpeg, .png, .webp).
 */
export function isGenuineVideoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.toLowerCase();
  // Strictly filter out static raster images
  if (
    clean.includes(".jpg") ||
    clean.includes(".jpeg") ||
    clean.includes(".png") ||
    clean.includes(".webp") ||
    clean.includes(".gif")
  ) {
    return false;
  }
  return (
    clean.includes(".mp4") ||
    clean.includes("/videos/") ||
    clean.includes("video.") ||
    clean.includes("fbcdn.net/o1/v/") ||
    clean.includes("b2/videos/")
  );
}

/**
 * Inspects a Meta / Facebook CDN URL for the `oe` (expiration) parameter.
 * Meta CDN URLs embed a hexadecimal unix timestamp in `oe`.
 * e.g., `?oe=67C5A3E0` -> 1740973024 seconds since epoch.
 *
 * Returns:
 * - `true` if the URL is confirmed to be expired
 * - `false` if the URL is still valid, is permanent storage, or does not carry an `oe` param
 */
export function isFbCdnUrlExpired(url: string | null | undefined, bufferMs = 30_000): boolean {
  if (!url || typeof url !== "string") return true;

  // Permanent storage URLs never expire under FB rules
  if (isPermanentMediaUrl(url)) {
    return false;
  }

  // Non-FB CDN URLs do not expire under FB rules
  if (!isFbCdnUrl(url)) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const oeHex = urlObj.searchParams.get("oe");
    if (!oeHex) {
      // If there's no `oe` parameter, cannot verify expiration from URL alone
      return false;
    }

    const expirySec = parseInt(oeHex, 16);
    if (isNaN(expirySec) || expirySec <= 0) {
      return false;
    }

    const expiryMs = expirySec * 1000;
    return Date.now() >= (expiryMs - bufferMs);
  } catch {
    return false;
  }
}

/**
 * Extracts the expiration Date from a Meta CDN URL, or null if not found.
 */
export function getFbCdnExpirationDate(url: string | null | undefined): Date | null {
  if (!url || typeof url !== "string" || !isFbCdnUrl(url)) return null;
  try {
    const urlObj = new URL(url);
    const oeHex = urlObj.searchParams.get("oe");
    if (!oeHex) return null;
    const expirySec = parseInt(oeHex, 16);
    if (isNaN(expirySec) || expirySec <= 0) return null;
    return new Date(expirySec * 1000);
  } catch {
    return null;
  }
}
