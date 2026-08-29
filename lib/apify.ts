/**
 * Apify Service Module
 * Handles API interactions with Apify REST API, actor runs, dataset fetching, and credit balance monitoring.
 * Supports Multi-Token Failover: Automatically switches to secondary tokens when Primary token runs out of credits.
 */

const APIFY_BASE_URL = "https://api.apify.com/v2";

export interface ApifyBalanceInfo {
  token: string;
  maxMonthlyUsageUsd: number;
  monthlyUsageUsd: number;
  remainingUsd: number;
  usagePercent: number;
  cycleStartAt: string;
  cycleEndAt: string;
  activeTokenIndex: number;
  totalTokensCount: number;
}

export interface ApifyActorRunResponse {
  id: string;
  actId: string;
  defaultDatasetId: string;
  status: string;
  startedAt: string;
  usedToken: string;
}

/**
 * Retrieves all configured Apify API tokens from environment variables.
 * Supports APIFY_API_TOKENS (comma separated) or APIFY_API_TOKEN, APIFY_API_TOKEN_1, APIFY_API_TOKEN_2.
 */
export function getApifyTokens(): string[] {
  const tokens: string[] = [];

  const rawValues = [
    process.env.APIFY_API_TOKENS,
    process.env.APIFY_API_TOKEN,
    process.env.APIFY_API_TOKEN_1,
    process.env.APIFY_API_TOKEN_2,
    process.env.APIFY_API_TOKEN_3,
  ];

  for (const raw of rawValues) {
    if (!raw) continue;
    const split = raw.split(",").map((t) => t.trim()).filter(Boolean);
    for (const t of split) {
      if (t && !tokens.includes(t)) {
        tokens.push(t);
      }
    }
  }

  return tokens;
}

/**
 * Calculates the safety-buffered ad extraction limit based on a positive count delta.
 * Formula: Limit = Delta + max(3, ceil(Delta * 0.2))
 * Optional maxCap parameter to prevent credit drain on huge deltas (default: 100).
 */
export function calculateDeltaLimit(delta: number, maxCap: number = 250): number {
  const safeDelta = Math.max(1, delta);
  const buffer = Math.max(5, Math.ceil(safeDelta * 0.25));
  const calculated = safeDelta + buffer;
  // Curious Coder Facebook Ads Library scraper requires at least 10 results to execute
  return Math.min(Math.max(10, calculated), maxCap);
}

/**
 * Helper to ensure Meta Ad Library URL explicitly uses Most Recent feed sorting.
 * Parameter: &sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc
 */
export function ensureMostRecentSortingUrl(rawUrl: string): string {
  try {
    let normalized = rawUrl.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = `https://${normalized}`;
    }
    const urlObj = new URL(normalized);
    urlObj.searchParams.set("sort_data[mode]", "relevancy_monthly_grouped");
    urlObj.searchParams.set("sort_data[direction]", "desc");
    return urlObj.toString();
  } catch {
    let url = rawUrl.trim();
    url = url.replace(/sort_data\[mode\]=[^&]*/g, "");
    url = url.replace(/sort_data\[direction\]=[^&]*/g, "");
    url = url.replace(/&&+/g, "&").replace(/\?&/, "?").replace(/&$/, "");
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc`;
  }
}

/**
 * Fetches current credit balance across configured tokens.
 * Automatically selects the first active token with remaining credit.
 */
export async function getApifyAccountBalance(): Promise<ApifyBalanceInfo | null> {
  const tokens = getApifyTokens();
  if (tokens.length === 0) {
    console.warn("[Apify] No APIFY_API_TOKEN environment variable configured.");
    return null;
  }

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    try {
      const res = await fetch(`${APIFY_BASE_URL}/users/me/limits?token=${token}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        console.warn(`[Apify] Token #${idx + 1} balance check failed (HTTP ${res.status}). Trying next token...`);
        continue;
      }

      const json = await res.json();
      const data = json.data;

      const maxMonthlyUsageUsd = Number(data?.limits?.maxMonthlyUsageUsd || 5);
      const monthlyUsageUsd = Number(data?.current?.monthlyUsageUsd || 0);
      const remainingUsd = Math.max(0, maxMonthlyUsageUsd - monthlyUsageUsd);
      const usagePercent = Math.min(100, Math.round((monthlyUsageUsd / maxMonthlyUsageUsd) * 100));

      // If this token still has remaining budget or is the last available token, return it
      if (remainingUsd > 0.05 || idx === tokens.length - 1) {
        return {
          token: token.substring(0, 10) + "...",
          maxMonthlyUsageUsd,
          monthlyUsageUsd,
          remainingUsd,
          usagePercent,
          cycleStartAt: data?.monthlyUsageCycle?.startAt || "",
          cycleEndAt: data?.monthlyUsageCycle?.endAt || "",
          activeTokenIndex: idx + 1,
          totalTokensCount: tokens.length,
        };
      }
    } catch (error) {
      console.error(`[Apify] Error checking balance for token #${idx + 1}:`, error);
    }
  }

  return null;
}

/**
 * Starts an Apify Actor run for Meta Ad Library extraction with automatic Multi-Token Failover.
 */
export async function startApifyDeltaScan(params: {
  pageUrl: string;
  delta: number;
  creativeScanId: string;
  webhookBaseUrl?: string;
  maxCap?: number;
  isFullScan?: boolean;
  activeStatus?: "active" | "all";
}): Promise<ApifyActorRunResponse | null> {
  const tokens = getApifyTokens();
  if (tokens.length === 0) {
    throw new Error("No APIFY_API_TOKEN configured in environment variables.");
  }

  const rawActorId = process.env.APIFY_ACTOR_ID || "curious_coder/facebook-ads-library-scraper";
  const actorIdPath = rawActorId.includes("/") ? rawActorId.replace("/", "~") : rawActorId;

  // Calculate limit: For full scans allow high cap (up to 350 ads), for delta scans calculate buffer (minimum 10)
  const defaultCap = params.isFullScan ? 350 : 200;
  const maxResults = Math.max(
    10,
    params.isFullScan
      ? Math.min(Math.max(params.delta, 50), params.maxCap ?? defaultCap)
      : calculateDeltaLimit(params.delta, params.maxCap ?? defaultCap)
  );

  const targetUrl = ensureMostRecentSortingUrl(params.pageUrl);
  const activeStatus = params.activeStatus || "active";

  const actorInput = {
    urls: [{ url: targetUrl }],
    limitPerSource: maxResults,
    count: maxResults,
    scrapeAdDetails: false,
    "scrapePageAds.activeStatus": activeStatus,
    "scrapePageAds.countryCode": "ALL",
    "scrapePageAds.sortBy": "most_recent",
  };

  const webhooks = params.webhookBaseUrl
    ? [
        {
          eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED"],
          requestUrl: `${params.webhookBaseUrl}/api/webhooks/apify?creativeScanId=${encodeURIComponent(
            params.creativeScanId
          )}`,
        },
      ]
    : undefined;

  let lastError: string | null = null;

  // Iterate over available tokens to launch actor run with automatic failover
  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    const memory = params.isFullScan ? 1024 : 512;
    const timeout = params.isFullScan ? 90 : 60;
    const runUrl = `${APIFY_BASE_URL}/acts/${actorIdPath}/runs?token=${token}&memory=${memory}&timeout=${timeout}`;

    try {
      console.log(`[Apify] Attempting actor launch using Token #${idx + 1} of ${tokens.length}...`);

      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...actorInput,
          webhooks,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`[Apify] Token #${idx + 1} failed (HTTP ${res.status}): ${errorText}`);

        // If credit limit / payment required (HTTP 402, 403, 429) or invalid token, try next token
        if (res.status === 402 || res.status === 403 || res.status === 429 || errorText.toLowerCase().includes("limit") || errorText.toLowerCase().includes("credit")) {
          console.warn(`⚠️ [Apify Failover] Token #${idx + 1} exhausted / limited. Failing over to Token #${idx + 2}...`);
          lastError = `Token #${idx + 1} HTTP ${res.status}: ${errorText}`;
          continue;
        }

        lastError = `Apify launch failed (HTTP ${res.status}): ${errorText}`;
        continue;
      }

      const json = await res.json();
      const runData = json.data;

      console.log(`✅ [Apify Success] Actor run initiated using Token #${idx + 1}! Run ID: ${runData.id}`);

      return {
        id: runData.id,
        actId: runData.actId,
        defaultDatasetId: runData.defaultDatasetId,
        status: runData.status,
        startedAt: runData.startedAt,
        usedToken: token.substring(0, 10) + "...",
      };
    } catch (error: any) {
      console.error(`[Apify] Exception with Token #${idx + 1}:`, error.message || error);
      lastError = error.message || String(error);
    }
  }

  throw new Error(`All Apify API Tokens failed/exhausted. Last Error: ${lastError}`);
}

/**
 * Fetches dataset items from a completed Apify run (tries all configured tokens).
 */
export async function fetchApifyDatasetItems(datasetId: string): Promise<any[]> {
  const tokens = getApifyTokens();
  if (tokens.length === 0) return [];

  for (const token of tokens) {
    const url = `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${token}&format=json`;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        return await res.json();
      }
    } catch (error) {
      console.error(`[Apify] Error fetching dataset ${datasetId} with token:`, error);
    }
  }

  return [];
}

/**
 * Scrapes a single ad via Apify actor with automatic wait-for-finish (30s) and token failover.
 */
export async function scrapeSingleAdViaApify(adArchiveId: string): Promise<any | null> {
  const tokens = getApifyTokens();
  if (tokens.length === 0) {
    throw new Error("No APIFY_API_TOKEN configured in environment variables.");
  }

  const rawActorId = process.env.APIFY_ACTOR_ID || "curious_coder/facebook-ads-library-scraper";
  const actorIdPath = rawActorId.includes("/") ? rawActorId.replace("/", "~") : rawActorId;

  const targetUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&q=${encodeURIComponent(
    adArchiveId
  )}&search_type=keyword_unordered&sort_data[direction]=desc&sort_data[mode]=relevancy_monthly_grouped`;

  const actorInput = {
    urls: [{ url: targetUrl }],
    limitPerSource: 10,
    count: 10,
    scrapeAdDetails: false,
    "scrapePageAds.activeStatus": "all",
    "scrapePageAds.countryCode": "ALL",
    "scrapePageAds.sortBy": "most_recent",
  };

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    const runUrl = `${APIFY_BASE_URL}/acts/${actorIdPath}/runs?token=${token}&waitForFinish=30&memory=256&timeout=30`;

    try {
      console.log(`[Apify Single Ad] Refreshing ad ${adArchiveId} using Token #${idx + 1}...`);
      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actorInput),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`[Apify Single Ad] Token #${idx + 1} failed: ${errorText}`);
        continue;
      }

      const json = await res.json();
      const runData = json.data;
      if (runData?.defaultDatasetId) {
        const items = await fetchApifyDatasetItems(runData.defaultDatasetId);
        if (items && items.length > 0) {
          return items[0];
        }
      }
    } catch (err: any) {
      console.error(`[Apify Single Ad] Error with token #${idx + 1}:`, err.message || err);
    }
  }

  return null;
}
