/**
 * Apify Service Module
 * Handles API interactions with Apify REST API, actor runs, dataset fetching, and credit balance monitoring.
 */

const APIFY_BASE_URL = "https://api.apify.com/v2";

export interface ApifyBalanceInfo {
  maxMonthlyUsageUsd: number;
  monthlyUsageUsd: number;
  remainingUsd: number;
  usagePercent: number;
  cycleStartAt: string;
  cycleEndAt: string;
}

export interface ApifyActorRunResponse {
  id: string;
  actId: string;
  defaultDatasetId: string;
  status: string;
  startedAt: string;
}

/**
 * Calculates the safety-buffered ad extraction limit based on a positive count delta.
 * Formula: Limit = Delta + max(3, ceil(Delta * 0.2))
 */
export function calculateDeltaLimit(delta: number): number {
  const safeDelta = Math.max(1, delta);
  const buffer = Math.max(3, Math.ceil(safeDelta * 0.2));
  return safeDelta + buffer;
}

/**
 * Fetches the user's current Apify credit usage and remaining monthly limit.
 */
export async function getApifyAccountBalance(): Promise<ApifyBalanceInfo | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    console.warn("[Apify] APIFY_API_TOKEN environment variable is not configured.");
    return null;
  }

  try {
    const res = await fetch(`${APIFY_BASE_URL}/users/me/limits?token=${token}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[Apify] Failed to fetch user limits. HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const data = json.data;

    const maxMonthlyUsageUsd = Number(data?.limits?.maxMonthlyUsageUsd || 5);
    const monthlyUsageUsd = Number(data?.current?.monthlyUsageUsd || 0);
    const remainingUsd = Math.max(0, maxMonthlyUsageUsd - monthlyUsageUsd);
    const usagePercent = Math.min(100, Math.round((monthlyUsageUsd / maxMonthlyUsageUsd) * 100));

    return {
      maxMonthlyUsageUsd,
      monthlyUsageUsd,
      remainingUsd,
      usagePercent,
      cycleStartAt: data?.monthlyUsageCycle?.startAt || "",
      cycleEndAt: data?.monthlyUsageCycle?.endAt || "",
    };
  } catch (error) {
    console.error("[Apify] Error querying account balance:", error);
    return null;
  }
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
 * Starts an Apify Actor run for Meta Ad Library extraction with delta limit & webhook configuration.
 */
export async function startApifyDeltaScan(params: {
  pageUrl: string;
  delta: number;
  creativeScanId: string;
  webhookBaseUrl?: string;
}): Promise<ApifyActorRunResponse | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error("APIFY_API_TOKEN is missing in environment variables.");
  }

  const rawActorId = process.env.APIFY_ACTOR_ID || "curious_coder/facebook-ads-library-scraper";
  // Convert actor ID slash to tilde for API URL path if needed (e.g. curious_coder~facebook-ads-library-scraper)
  const actorIdPath = rawActorId.includes("/") ? rawActorId.replace("/", "~") : rawActorId;

  const maxResults = calculateDeltaLimit(params.delta);

  // Enforce explicit Most Recent sorting URL parameters
  const targetUrl = ensureMostRecentSortingUrl(params.pageUrl);

  const actorInput = {
    startUrls: [{ url: targetUrl }],
    urls: [{ url: targetUrl }],
    searchUrl: targetUrl,
    maxResults,
    limitPerSource: maxResults,
    count: maxResults,
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

  const runUrl = `${APIFY_BASE_URL}/acts/${actorIdPath}/runs?token=${token}`;

  try {
    const res = await fetch(runUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...actorInput,
        webhooks,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Apify] Failed to start actor run. HTTP ${res.status}: ${errorText}`);
      throw new Error(`Apify Actor launch failed (HTTP ${res.status}): ${errorText}`);
    }

    const json = await res.json();
    const runData = json.data;

    return {
      id: runData.id,
      actId: runData.actId,
      defaultDatasetId: runData.defaultDatasetId,
      status: runData.status,
      startedAt: runData.startedAt,
    };
  } catch (error) {
    console.error("[Apify] Error initiating actor run:", error);
    throw error;
  }
}

/**
 * Fetches dataset items from a completed Apify run.
 */
export async function fetchApifyDatasetItems(datasetId: string): Promise<any[]> {
  const token = process.env.APIFY_API_TOKEN;
  const url = `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${token}&format=json`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[Apify] Failed to fetch dataset ${datasetId}. HTTP ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (error) {
    console.error(`[Apify] Error fetching dataset items for ${datasetId}:`, error);
    return [];
  }
}
