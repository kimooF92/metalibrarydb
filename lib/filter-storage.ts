/**
 * Safe Browser Storage Serializer for Dashboard Filters
 *
 * Provides SSR-safe, fault-tolerant persistence to localStorage and sessionStorage
 * with JSON parsing fallbacks and schema validation.
 */

export const DEFAULT_STORAGE_KEY = "dashboard_filters_v2";

export const LEGACY_STORAGE_KEYS = [
  "dashboard_filters_v2",
  "dashboard_filters",
] as const;

/**
 * Safely reads and parses a JSON object from browser storage.
 * Checks localStorage first, then sessionStorage.
 */
export function readStoredFilterState<T>(
  key = DEFAULT_STORAGE_KEY
): Partial<T> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(key) || window.sessionStorage.getItem(key);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<T>;
    }
  } catch (err) {
    console.warn(`[filter-storage] Failed to read stored state for key "${key}":`, err);
  }

  return null;
}

/**
 * Safely writes a serializable state object to both localStorage and sessionStorage.
 */
export function writeStoredFilterState<T>(
  state: T,
  key = DEFAULT_STORAGE_KEY
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const payload = JSON.stringify(state);
    window.sessionStorage.setItem(key, payload);
    window.localStorage.setItem(key, payload);
    return true;
  } catch (err) {
    console.warn(`[filter-storage] Failed to write stored state for key "${key}":`, err);
    return false;
  }
}

/**
 * Safely clears filter state from storage across all legacy and current keys.
 */
export function clearStoredFilterState(
  keys: readonly string[] = LEGACY_STORAGE_KEYS
): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const k of keys) {
    try {
      window.sessionStorage.removeItem(k);
      window.localStorage.removeItem(k);
    } catch (err) {
      console.warn(`[filter-storage] Failed to clear key "${k}":`, err);
    }
  }
}

