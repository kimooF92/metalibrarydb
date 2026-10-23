/**
 * Sequence Discovery Utility Functions & Invariants
 * Enforces schema validation, safe bounds, cooldown limits, and metadata preservation.
 */

export const MIN_COOLDOWN_MS = 5000;
export const MAX_COOLDOWN_MS = 120000;
export const DEFAULT_COOLDOWN_MS = 20000;
export const MAX_SEQUENCE_ITEMS = 15;

/**
 * Sanitizes and clamps inter-run cooldown duration in milliseconds.
 * Prevents NaN, negatives, and unbounded stalls.
 */
export function sanitizeSequenceCooldown(raw: string | number | undefined | null): number {
  const parsed = typeof raw === "number" ? raw : parseInt(String(raw || DEFAULT_COOLDOWN_MS), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_COOLDOWN_MS;
  return Math.max(MIN_COOLDOWN_MS, Math.min(parsed, MAX_COOLDOWN_MS));
}

/**
 * Validates and auto-corrects date ranges.
 * If min > max, swaps them automatically.
 */
export function sanitizeDateRange(
  rawMin?: string | Date | null,
  rawMax?: string | Date | null,
  now: Date = new Date()
): { minDate: Date; maxDate: Date; minDateStr: string; maxDateStr: string } {
  const defaultMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const defaultMax = now;

  let min = rawMin ? new Date(rawMin) : defaultMin;
  let max = rawMax ? new Date(rawMax) : defaultMax;

  if (isNaN(min.getTime())) min = defaultMin;
  if (isNaN(max.getTime())) max = defaultMax;

  // Swap if reversed
  if (min > max) {
    const temp = min;
    min = max;
    max = temp;
  }

  const minDateStr = min.toISOString().split("T")[0];
  const maxDateStr = max.toISOString().split("T")[0];

  return { minDate: min, maxDate: max, minDateStr, maxDateStr };
}

/**
 * Sanitizes ISO 2/3 letter country code. Defaults to fallback if invalid.
 */
export function sanitizeCountryCode(raw?: string | null, fallback: string = "TN"): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().toUpperCase();
  return /^[A-Z]{2,3}$/.test(trimmed) ? trimmed : fallback;
}

/**
 * Sanitizes media type filter (video | image | all).
 */
export function sanitizeMediaType(raw?: string | null): "video" | "image" | "all" {
  if (raw === "video" || raw === "image" || raw === "all") return raw;
  return "video";
}

/**
 * Extracts and cleans keyword sequence list.
 * Strips quotes, removes empty lines/items, clamps max items and max length.
 */
export function extractSequenceKeywords(
  input: string[] | string | null | undefined,
  maxItems: number = MAX_SEQUENCE_ITEMS
): string[] {
  let rawItems: any[] = [];
  if (Array.isArray(input)) {
    rawItems = input;
  } else if (typeof input === "string") {
    rawItems = input.split(/[\n,]+/);
  }

  const cleaned: string[] = [];
  for (const item of rawItems) {
    if (typeof item !== "string") continue;
    const trimmed = item.replace(/^"|"$/g, "").trim();
    if (!trimmed) continue;
    cleaned.push(trimmed.slice(0, 100));
    if (cleaned.length >= maxItems) break;
  }

  return cleaned;
}

/**
 * Extracts and cleans URL sequence lines.
 */
export function extractSequenceUrls(
  input: string[] | string | null | undefined,
  maxItems: number = MAX_SEQUENCE_ITEMS
): string[] {
  let rawItems: any[] = [];
  if (Array.isArray(input)) {
    rawItems = input;
  } else if (typeof input === "string") {
    rawItems = input.split("\n");
  }

  const cleaned: string[] = [];
  for (const item of rawItems) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    cleaned.push(trimmed);
    if (cleaned.length >= maxItems) break;
  }

  return cleaned;
}

/**
 * Preserves sequence badge prefix (Sequence X/Y · Batch [id]) when updating outcomeDetails.
 */
export function formatPreservedOutcomeDetails(
  initialOutcomeDetails: string | null | undefined,
  message: string
): string {
  if (!initialOutcomeDetails) return message;
  const match = initialOutcomeDetails.match(/Sequence \d+\/\d+ · Batch [a-zA-Z0-9_-]+/i);
  if (!match) return message;
  return `${match[0]} — ${message}`;
}
