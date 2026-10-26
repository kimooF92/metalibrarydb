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

/**
 * Strips emoji characters, pictographs, and variation selectors
 * from a string while collapsing redundant spaces.
 */
export function stripEmojis(str?: string | null): string {
  if (!str) return "";
  return str
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, "")
    .replace(/[\u2600-\u27BF]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Formats a date or ISO string into a concise human-readable relative time string
 * (e.g. "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", or "Oct 24").
 */
export function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Never";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Never";

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "Just now";
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

