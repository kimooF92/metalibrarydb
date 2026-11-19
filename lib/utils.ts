import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
 * Decodes a single Punycode label into Unicode using RFC 3492.
 */
export function decodePunycodePart(input: string): string {
  if (!input) return "";
  const base = 36, tmin = 1, tmax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128;
  let n = initialN, i = 0, bias = initialBias, output: number[] = [];
  let basic = input.lastIndexOf("-");
  if (basic > 0) {
    for (let j = 0; j < basic; ++j) output.push(input.charCodeAt(j));
  } else {
    basic = 0;
  }
  let index = basic > 0 ? basic + 1 : 0;
  let stepCount = 0;
  while (index < input.length) {
    if (++stepCount > 200) return input;
    let oldi = i, w = 1, k = base;
    for (;; k += base) {
      if (index >= input.length) return input;
      let code = input.charCodeAt(index++);
      let digit =
        code >= 48 && code <= 57
          ? code - 22
          : code >= 65 && code <= 90
            ? code - 65
            : code >= 97 && code <= 122
              ? code - 97
              : base;
      i += digit * w;
      let t = k <= bias ? tmin : k >= bias + tmax ? tmax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    bias = adapt(i - oldi, output.length + 1, oldi === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    output.splice(i++, 0, n);
  }
  function adapt(delta: number, numPoints: number, firstTime: boolean): number {
    delta = firstTime ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > ((base - tmin) * tmax) >> 1) {
      delta = Math.floor(delta / (base - tmin));
      k += base;
    }
    return k + Math.floor(((base - tmin + 1) * delta) / (delta + skew));
  }
  return String.fromCodePoint(...output);
}

/**
 * Decodes any Punycode labels in a domain name (e.g. xn--marhabe-mt94f.com -> 👈marhabe.com).
 */
export function decodePunycodeDomain(domain: string): string {
  if (!domain || !domain.toLowerCase().includes("xn--")) return domain;
  return domain
    .split(".")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower.startsWith("xn--")) {
        try {
          return decodePunycodePart(lower.slice(4));
        } catch {
          return part;
        }
      }
      return part;
    })
    .join(".");
}

/**
 * Normalizes a raw domain or host candidate:
 * 1. Strips protocols and path/query leftovers
 * 2. Decodes Punycode (IDN) labels
 * 3. Strips attached emojis (e.g. 👈marhabe.com -> marhabe.com)
 * 4. Strips leading/trailing punctuation and hyphens from labels
 */
export function cleanDomainName(domainOrHost: string | null | undefined): string {
  if (!domainOrHost || typeof domainOrHost !== "string") return "";
  let clean = domainOrHost.trim();
  clean = clean.replace(/^[a-zA-Z]+:\/\//, "");
  clean = clean.split("/")[0].split("?")[0].split("#")[0].split(":")[0];
  if (clean.toLowerCase().includes("xn--")) {
    clean = decodePunycodeDomain(clean);
  }
  clean = stripEmojis(clean);
  clean = clean
    .replace(/^[\s/:;<>\\()[\]{}|'"`~!@#$%^&*+=?]+/, "")
    .replace(/[\s/:;<>\\()[\]{}|'"`~!@#$%^&*+=?]+$/, "");
  clean = clean
    .split(".")
    .map((seg) => seg.replace(/^-+|-+$/g, "").trim())
    .filter(Boolean)
    .join(".");
  return clean;
}

/**
 * Sanitizes the hostname in a full URL string, resolving Punycode and emoji artifacts.
 */
export function sanitizeUrlHost(urlStr: string | null | undefined): string {
  if (!urlStr || typeof urlStr !== "string") return "";
  const trimmed = urlStr.trim();
  if (!trimmed) return "";

  const hasProto = /^[a-zA-Z]+:\/\//.test(trimmed);
  const urlToParse = hasProto ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(urlToParse);
    const cleanHost = cleanDomainName(parsed.hostname);
    if (cleanHost && cleanHost !== parsed.hostname) {
      parsed.hostname = cleanHost;
    }
    let result = parsed.toString();
    if (parsed.pathname === "/" && !parsed.search && !parsed.hash && !trimmed.endsWith("/")) {
      result = result.slice(0, -1);
    }
    if (!hasProto) {
      return result.replace(/^https?:\/\//i, "");
    }
    return result;
  } catch {
    return cleanDomainName(trimmed);
  }
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
        return sanitizeUrlHost(decodeURIComponent(targetParam));
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

    return sanitizeUrlHost(fullUrl);
  } catch {
    return sanitizeUrlHost(url) || url;
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
    return cleanDomainName(parsed.hostname).replace(/^www\./, "");
  } catch {
    return cleanDomainName(resolved.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]);
  }
}

/**
 * Detects whether a string contains right-to-left characters (Arabic, Hebrew, Persian).
 */
export function isRtlText(text?: string | null): boolean {
  if (!text) return false;
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
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

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a given string is a valid canonical RFC 4122 UUID.
 */
export function isUuid(value?: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  return UUID_REGEX.test(value.trim());
}

export const isValidUuid = isUuid;


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

