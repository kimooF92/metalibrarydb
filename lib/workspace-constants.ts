/**
 * Workspace Shared Constants
 * Safe to import in both Client and Server Components.
 */

export const WORKSPACE_COOKIE_NAME = "current_workspace_id";
export const WORKSPACE_HEADER_NAME = "x-workspace-id";
export const WORKSPACE_CHANGE_EVENT = "meta_workspace_changed";

/** Seeded Deterministic Primary Workspace IDs */
export const TUNISIA_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
export const MOROCCO_WORKSPACE_ID = "00000000-0000-0000-0000-000000000002";

export interface MarketCurrencyInfo {
  isMorocco: boolean;
  currency: string;
  currencySymbol: string;
}

/**
 * Resolves the canonical currency and symbol for a given workspaceId or target URL.
 * Operates purely in-memory (0 DB egress / 0 round-trips).
 */
export function resolveMarketCurrency(
  workspaceId?: string | null,
  urlOrDomain?: string | null
): MarketCurrencyInfo {
  const isMorocco =
    workspaceId === MOROCCO_WORKSPACE_ID ||
    (Boolean(urlOrDomain) && /\.ma(\/|$)/i.test(urlOrDomain!));

  return {
    isMorocco,
    currency: isMorocco ? "MAD" : "TND",
    currencySymbol: isMorocco ? "DH" : "DT",
  };
}
