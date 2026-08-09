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
export function calculateDeltaLimit(delta: number, maxCap: number = 100): number {
  const safeDelta = Math.max(1, delta);
  const buffer = Math.max(3, Math.ceil(safeDelta * 0.2));
  const calculated = safeDelta + buffer;
  return Math.min(calculated, maxCap);
}

/**
 * Helper to ensure Meta Ad Library URL explicitly uses Most Recent feed sorting.
 * Parameter: &sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc
 */
export function ensureMostRecentSortingUrl(rawUrl: string): string {
  try {
    let url = rawUrl.trim();
    if (url.includes("sort_data[mode]=total_impressions")) {
      url = url.replace("sort_data[mode]=total_impressions", "sort_data[mode]=relevancy_monthly_grouped");
    } else if (!url.includes("sort_data[mode]=")) {
      const separator = url.includes("?") ? "&" : "?";
      url += `${separator}sort_data[mode]=relevancy_monthly_grouped`;
    }

    if (!url.includes("sort_data[direction]=")) {
      url += "&sort_data[direction]=desc";
    }

    return url;
  } catch {
    return rawUrl;
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
}): Promise<ApifyActorRunResponse | null> {
  const tokens = getApifyTokens();
  if (tokens.length === 0) {
    throw new Error("No APIFY_API_TOKEN configured in environment variables.");
  }

  const rawActorId = process.env.APIFY_ACTOR_ID || "curious_coder/facebook-ads-library-scraper";
  const actorIdPath = rawActorId.includes("/") ? rawActorId.replace("/", "~") : rawActorId;

  // Calculate safety-buffered limit (delta + buffer), capped at maxCap (default: 100)
  const maxResults = calculateDeltaLimit(params.delta, params.maxCap ?? 100);
  const targetUrl = ensureMostRecentSortingUrl(params.pageUrl);

  const actorInput = {
    startUrls: [{ url: targetUrl }],
    urls: [{ url: targetUrl }],
    searchUrl: targetUrl,
    maxResults,
    limitPerSource: maxResults,
    extractCards: true,
    includeRawSnapshot: true,
    scrapeAdDetails: false,
    "scrapePageAds.activeStatus": "all",
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
    const runUrl = `${APIFY_BASE_URL}/acts/${actorIdPath}/runs?token=${token}`;

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
