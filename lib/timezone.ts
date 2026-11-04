import { sql } from "drizzle-orm";

/**
 * Shared utility for resolving timezones across API routes and database queries.
 */

const COUNTRY_TIMEZONE_MAP: Record<string, string> = {
  TN: "Africa/Tunis",
  MA: "Africa/Casablanca",
  DZ: "Africa/Algiers",
  FR: "Europe/Paris",
  EG: "Africa/Cairo",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  US: "America/New_York",
  GB: "Europe/London",
};

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  const trimmed = tz.trim();
  // Safe characters only (letters, digits, slash, underscore, plus, minus)
  if (!/^[A-Za-z0-9_+\-/]+$/.test(trimmed)) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimezone(options?: {
  clientTz?: string | null;
  countryCode?: string | null;
  fallback?: string;
}): string {
  const fallback = options?.fallback || "Africa/Tunis";

  // 1. Prefer client-provided timezone if valid
  if (options?.clientTz && isValidIanaTimezone(options.clientTz)) {
    return options.clientTz.trim();
  }

  // 2. Map workspace country code
  if (options?.countryCode) {
    const code = options.countryCode.trim().toUpperCase();
    if (COUNTRY_TIMEZONE_MAP[code]) {
      return COUNTRY_TIMEZONE_MAP[code];
    }
  }

  return fallback;
}

/**
 * Generates SQL timestamp with timezone representing the start of today in the given timezone.
 */
export function getStartOfTodaySql(tz: string) {
  return sql`(date_trunc('day', NOW() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;
}

/**
 * Generates SQL timestamp with timezone representing the start of yesterday in the given timezone.
 */
export function getStartOfYesterdaySql(tz: string) {
  return sql`((date_trunc('day', NOW() AT TIME ZONE ${tz}) AT TIME ZONE ${tz}) - INTERVAL '1 day')`;
}

/**
 * Generates SQL timestamp with timezone representing the start of current month in the given timezone.
 */
export function getStartOfMonthSql(tz: string) {
  return sql`(date_trunc('month', NOW() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;
}

