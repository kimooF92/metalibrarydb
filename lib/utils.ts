import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Unwraps Facebook redirect shims (l.facebook.com/l.php?u=...) 
 * to return the true external brand website destination URL.
 */
export function resolveDestinationUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  if (!url) return null;

  try {
    const fullUrl = url.match(/^https?:\/\//i) ? url : `https://${url}`;
    const parsed = new URL(fullUrl);

    // 1. Unwrap l.facebook.com / l.instagram.com redirect wrappers
    if (parsed.hostname.includes("facebook.com") || parsed.hostname.includes("instagram.com")) {
      const targetParam = parsed.searchParams.get("u");
      if (targetParam) {
        return decodeURIComponent(targetParam);
      }
    }

    // 2. If it's a direct Meta page or Ad Library link with no target 'u' param, return null (not a store link)
    if (
      parsed.hostname.includes("facebook.com") ||
      parsed.hostname.includes("fb.me") ||
      parsed.hostname.includes("instagram.com")
    ) {
      return null;
    }

    return fullUrl;
  } catch {
    return url;
  }
}

/**
 * Extracts clean domain name for display (e.g. "dreemz.tn" or "nike.com")
 */
export function getCleanDomain(rawUrl: string | null | undefined): string | null {
  const resolved = resolveDestinationUrl(rawUrl);
  if (!resolved) return null;
  try {
    const parsed = new URL(resolved);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return resolved.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}

/**
 * Strict validator for Facebook / Meta Page IDs.
 * Page IDs must be purely numeric strings between 5 and 25 digits (not '0', not alphanumeric).
 */
export function isValidPageId(pageId?: string | null): boolean {
  if (!pageId) return false;
  const clean = pageId.trim();
  return Boolean(clean && /^\d{5,25}$/.test(clean) && clean !== "0");
}

