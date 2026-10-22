/**
 * Apify Service Module
 * Handles API interactions with Apify REST API, actor runs, dataset fetching, and credit balance monitoring.
 * Supports Multi-Token Failover: Automatically switches to secondary tokens when Primary token runs out of credits.
 */

import { getCached, setCached, deleteCached } from "./cache-service";

const APIFY_BASE_URL = "https://api.apify.com/v2";

export interface ApifyTokenStatus {
  index: number;
  token: string;
  isActive: boolean;
  isExhausted: boolean;
  status: "active" | "standby" | "exhausted" | "error";
  maxMonthlyUsageUsd: number;
  monthlyUsageUsd: number;
  remainingUsd: number;
  usagePercent: number;
  cycleStartAt?: string;
  cycleEndAt?: string;
  daysRemaining?: number | null;
  cycleDaysTotal?: number | null;
  cycleProgressPercent?: number;
  renewalDateFormatted?: string;
  resetCountdownText?: string;
  error?: string;
}

export interface ApifyBalanceInfo {
  token: string;
  maxMonthlyUsageUsd: number;
  monthlyUsageUsd: number;
  remainingUsd: number;
  usagePercent: number;
  cycleStartAt: string;
  cycleEndAt: string;
  daysRemaining?: number | null;
  cycleDaysTotal?: number | null;
  cycleProgressPercent?: number;
  renewalDateFormatted?: string;
  resetCountdownText?: string;
  nextRenewalDays?: number | null;
  nextRenewalKeyIndex?: number | null;
  activeTokenIndex: number;
  totalTokensCount: number;
  totalPoolRemainingUsd: number;
  totalPoolMaxUsd: number;
  totalPoolUsagePercent: number;
  keys: ApifyTokenStatus[];
}

/**
 * Calculates cycle loop metrics: days remaining until renewal, total cycle duration,
 * cycle progress percentage, and human-friendly countdown text.
 */
export function calculateTokenCycleInfo(
  cycleStartAt?: string,
  cycleEndAt?: string
): {
  daysRemaining: number | null;
  cycleDaysTotal: number | null;
  cycleProgressPercent: number;
  renewalDateFormatted: string;
  resetCountdownText: string;
} {
  if (!cycleEndAt) {
    return {
      daysRemaining: null,
      cycleDaysTotal: null,
      cycleProgressPercent: 0,
      renewalDateFormatted: "",
      resetCountdownText: "Unknown renewal",
    };
  }

  const endMs = new Date(cycleEndAt).getTime();
  const nowMs = Date.now();
  const diffMs = endMs - nowMs;

  // Days remaining until cycle renewal:
  // Math.ceil converts partial days into remaining days (e.g. 18 hours left -> 1 day remaining)
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  let cycleDaysTotal: number | null = null;
  let cycleProgressPercent = 0;

  if (cycleStartAt) {
    const startMs = new Date(cycleStartAt).getTime();
    cycleDaysTotal = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
    const elapsedMs = Math.max(0, nowMs - startMs);
    const totalMs = Math.max(1, endMs - startMs);
    cycleProgressPercent = Math.min(
      100,
      Math.max(0, Math.round((elapsedMs / totalMs) * 100))
    );
  }

  let renewalDateFormatted = "";
  try {
    const endDate = new Date(cycleEndAt);
    renewalDateFormatted = endDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    renewalDateFormatted = cycleEndAt.split("T")[0] || "";
  }

  let resetCountdownText = "";
  if (daysRemaining === 0) {
    resetCountdownText = "Renews today";
  } else if (daysRemaining === 1) {
    const hoursRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
    resetCountdownText =
      hoursRemaining < 24 ? `Renews in ${hoursRemaining}h` : "Renews in 1 day";
  } else {
    resetCountdownText = `Renews in ${daysRemaining} days`;
  }

  return {
    daysRemaining,
    cycleDaysTotal,
    cycleProgressPercent,
    renewalDateFormatted,
    resetCountdownText,
  };
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
 * In-memory set of exhausted token strings for the current process lifetime.
 * Prevents redundant failing network requests against already-exhausted tokens.
 */
export const exhaustedTokens = new Set<string>();

/**
 * Retrieves all configured Apify API tokens from environment variables.
 * Supports APIFY_API_TOKENS (comma separated), APIFY_API_TOKEN,
 * APIFY_API_TOKEN_1 ... APIFY_API_TOKEN_20, and any dynamic APIFY_API_TOKEN_* keys.
 */
export function getApifyTokens(): string[] {
  const tokens: string[] = [];

  const rawValues: (string | undefined)[] = [
    process.env.APIFY_API_TOKENS,
    process.env.APIFY_API_TOKEN,
  ];

  // Support numbered tokens up to 20
  for (let i = 1; i <= 20; i++) {
    rawValues.push(process.env[`APIFY_API_TOKEN_${i}`]);
  }

  // Also include any process.env keys starting with APIFY_API_TOKEN
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith("APIFY_API_TOKEN") && val && !rawValues.includes(val)) {
      rawValues.push(val);
    }
  }

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

let cachedBalanceData: {
  data: ApifyBalanceInfo;
  timestamp: number;
} | null = null;
const BALANCE_CACHE_TTL_MS = 25_000; // 25 seconds local L1 memory cache
const APIFY_BALANCE_REDIS_KEY = "cache:apify:balance_info";
const APIFY_BALANCE_REDIS_TTL = 60; // 60 seconds global Redis cache

/**
 * Fetches current credit balance across all configured tokens in parallel.
 * Identifies the current active in-use token, standby failover keys, and exhausted keys.
 */
export async function getApifyAccountBalance(options?: {
  forceRefresh?: boolean;
}): Promise<ApifyBalanceInfo | null> {
  const tokens = getApifyTokens();
  if (tokens.length === 0) {
    console.warn("[Apify] No APIFY_API_TOKEN environment variable configured.");
    return null;
  }

  // 1. Force refresh invalidation
  if (options?.forceRefresh) {
    cachedBalanceData = null;
    await deleteCached(APIFY_BALANCE_REDIS_KEY).catch(() => {});
  } else {
    // 2. Check local in-memory L1 cache
    if (
      cachedBalanceData &&
      Date.now() - cachedBalanceData.timestamp < BALANCE_CACHE_TTL_MS
    ) {
      return cachedBalanceData.data;
    }

    // 3. Check global Upstash Redis L2 cache (shared across all Vercel lambdas & users)
    const redisCached = await getCached<ApifyBalanceInfo>(APIFY_BALANCE_REDIS_KEY);
    if (redisCached) {
      cachedBalanceData = {
        data: redisCached,
        timestamp: Date.now(),
      };
      return redisCached;
    }
  }

  try {
    const keyStatuses: ApifyTokenStatus[] = await Promise.all(
      tokens.map(async (token, idx): Promise<ApifyTokenStatus> => {
        const masked =
          token.length > 18
            ? `${token.slice(0, 14)}...${token.slice(-4)}`
            : `${token.slice(0, 8)}...`;
        const processExhausted = exhaustedTokens.has(token);

        try {
          const res = await fetch(`${APIFY_BASE_URL}/users/me/limits?token=${token}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(6000),
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            const isLimited =
              res.status === 402 ||
              res.status === 403 ||
              res.status === 429 ||
              errText.toLowerCase().includes("limit") ||
              errText.toLowerCase().includes("credit");

            if (isLimited) {
              exhaustedTokens.add(token);
            }

            return {
              index: idx + 1,
              token: masked,
              isActive: false,
              isExhausted: true,
              status: isLimited ? "exhausted" : "error",
              maxMonthlyUsageUsd: 5,
              monthlyUsageUsd: 5,
              remainingUsd: 0,
              usagePercent: 100,
              daysRemaining: null,
              cycleDaysTotal: null,
              cycleProgressPercent: 0,
              renewalDateFormatted: "",
              resetCountdownText: "Unknown renewal",
              error: `HTTP ${res.status}: ${errText.slice(0, 80)}`,
            };
          }

          const json = await res.json();
          const data = json.data;

          const maxMonthlyUsageUsd = Number(data?.limits?.maxMonthlyUsageUsd || 5);
          const monthlyUsageUsd = Number(data?.current?.monthlyUsageUsd || 0);
          const remainingUsd = Math.max(0, maxMonthlyUsageUsd - monthlyUsageUsd);
          const usagePercent = Math.min(
            100,
            Math.round((monthlyUsageUsd / maxMonthlyUsageUsd) * 100)
          );
          const isDepleted = remainingUsd <= 0.05 || processExhausted;

          if (isDepleted && remainingUsd <= 0.05) {
            exhaustedTokens.add(token);
          }

          const cycleStartAt = data?.monthlyUsageCycle?.startAt || "";
          const cycleEndAt = data?.monthlyUsageCycle?.endAt || "";
          const cycleInfo = calculateTokenCycleInfo(cycleStartAt, cycleEndAt);

          return {
            index: idx + 1,
            token: masked,
            isActive: false,
            isExhausted: isDepleted,
            status: isDepleted ? "exhausted" : "standby",
            maxMonthlyUsageUsd,
            monthlyUsageUsd,
            remainingUsd,
            usagePercent,
            cycleStartAt,
            cycleEndAt,
            daysRemaining: cycleInfo.daysRemaining,
            cycleDaysTotal: cycleInfo.cycleDaysTotal,
            cycleProgressPercent: cycleInfo.cycleProgressPercent,
            renewalDateFormatted: cycleInfo.renewalDateFormatted,
            resetCountdownText: cycleInfo.resetCountdownText,
          };
        } catch (err: any) {
          return {
            index: idx + 1,
            token: masked,
            isActive: false,
            isExhausted: processExhausted,
            status: processExhausted ? "exhausted" : "error",
            maxMonthlyUsageUsd: 5,
            monthlyUsageUsd: 5,
            remainingUsd: 0,
            usagePercent: 100,
            daysRemaining: null,
            cycleDaysTotal: null,
            cycleProgressPercent: 0,
            renewalDateFormatted: "",
            resetCountdownText: "Unknown renewal",
            error: err.message || "Network error",
          };
        }
      })
    );

    // Identify active token: First token that is healthy and not exhausted
    let activeIdx = keyStatuses.findIndex((k) => !k.isExhausted && k.status !== "error");
    if (activeIdx === -1) {
      activeIdx = 0; // Default to first token if all are exhausted
    }
    keyStatuses[activeIdx].isActive = true;
    keyStatuses[activeIdx].status = "active";

    const totalPoolRemainingUsd =
      Math.round(keyStatuses.reduce((acc, k) => acc + (k.remainingUsd || 0), 0) * 100) / 100;
    const totalPoolMaxUsd =
      Math.round(keyStatuses.reduce((acc, k) => acc + (k.maxMonthlyUsageUsd || 0), 0) * 100) / 100;
    const totalPoolUsagePercent =
      totalPoolMaxUsd > 0
        ? Math.min(
            100,
            Math.round(((totalPoolMaxUsd - totalPoolRemainingUsd) / totalPoolMaxUsd) * 100)
          )
        : 0;

    // Cycle loop metrics:
    // Determine the next key that will renew in the cycle loop.
    // Check exhausted keys first (to know when scraping capacity revives),
    // or fall back to earliest renewing key across all configured keys.
    const exhaustedKeysWithCycle = keyStatuses
      .filter((k) => k.isExhausted && typeof k.daysRemaining === "number")
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));
    const allKeysWithCycle = [...keyStatuses]
      .filter((k) => typeof k.daysRemaining === "number")
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));

    const nextRenewingKey = exhaustedKeysWithCycle[0] || allKeysWithCycle[0] || null;

    const activeKey = keyStatuses[activeIdx];
    const result: ApifyBalanceInfo = {
      token: activeKey.token,
      maxMonthlyUsageUsd: activeKey.maxMonthlyUsageUsd,
      monthlyUsageUsd: activeKey.monthlyUsageUsd,
      remainingUsd: activeKey.remainingUsd,
      usagePercent: activeKey.usagePercent,
      cycleStartAt: activeKey.cycleStartAt || "",
      cycleEndAt: activeKey.cycleEndAt || "",
      daysRemaining: activeKey.daysRemaining ?? null,
      cycleDaysTotal: activeKey.cycleDaysTotal ?? null,
      cycleProgressPercent: activeKey.cycleProgressPercent ?? 0,
      renewalDateFormatted: activeKey.renewalDateFormatted || "",
      resetCountdownText: activeKey.resetCountdownText || "",
      nextRenewalDays: nextRenewingKey?.daysRemaining ?? null,
      nextRenewalKeyIndex: nextRenewingKey?.index ?? null,
      activeTokenIndex: activeKey.index,
      totalTokensCount: tokens.length,
      totalPoolRemainingUsd,
      totalPoolMaxUsd,
      totalPoolUsagePercent,
      keys: keyStatuses,
    };

    cachedBalanceData = {
      data: result,
      timestamp: Date.now(),
    };

    // Store in Upstash Redis to shield all concurrent serverless instances
    await setCached(APIFY_BALANCE_REDIS_KEY, result, APIFY_BALANCE_REDIS_TTL).catch(() => {});

    return result;
  } catch (error) {
    console.error("[Apify] Error in getApifyAccountBalance:", error);
    return null;
  }
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

  // Filter out tokens already marked exhausted in this process run, falling back to all tokens if all were flagged
  const nonExhausted = tokens.filter((t) => !exhaustedTokens.has(t));
  const candidateTokens = nonExhausted.length > 0 ? nonExhausted : tokens;

  // Iterate over available tokens to launch actor run with automatic failover
  for (let idx = 0; idx < candidateTokens.length; idx++) {
    const token = candidateTokens[idx];
    const tokenNum = tokens.indexOf(token) + 1;
    // Each scan submits one URL. The actor requires 512MB per input URL;
    // allocating 1GB for a single URL causes it to return a dataset error.
    const memory = 512;
    const timeout = params.isFullScan ? 90 : 60;
    const runUrl = `${APIFY_BASE_URL}/acts/${actorIdPath}/runs?token=${token}&memory=${memory}&timeout=${timeout}`;

    try {
      console.log(`[Apify] Attempting actor launch using Token #${tokenNum} of ${tokens.length}...`);

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
        console.warn(`[Apify] Token #${tokenNum} failed (HTTP ${res.status}): ${errorText}`);

        // If credit limit / payment required (HTTP 402, 403, 429) or invalid token, record exhausted & try next token
        if (
          res.status === 402 ||
          res.status === 403 ||
          res.status === 429 ||
          errorText.toLowerCase().includes("limit") ||
          errorText.toLowerCase().includes("credit")
        ) {
          exhaustedTokens.add(token);
          lastError = `Token #${tokenNum} HTTP ${res.status}: ${errorText}`;
          if (idx + 1 < candidateTokens.length) {
            const nextTokenNum = tokens.indexOf(candidateTokens[idx + 1]) + 1;
            console.warn(
              `⚠️ [Apify Failover] Token #${tokenNum} exhausted / limited. Failing over to Token #${nextTokenNum} of ${tokens.length}...`
            );
          } else {
            console.warn(
              `⚠️ [Apify Failover] Token #${tokenNum} exhausted / limited. No more failover tokens available (Total configured: ${tokens.length}).`
            );
          }
          continue;
        }

        lastError = `Apify launch failed (HTTP ${res.status}): ${errorText}`;
        if (idx + 1 < candidateTokens.length) {
          const nextTokenNum = tokens.indexOf(candidateTokens[idx + 1]) + 1;
          console.warn(`⚠️ [Apify Failover] Failing over to Token #${nextTokenNum}...`);
        }
        continue;
      }

      const json = await res.json();
      const runData = json.data;

      console.log(`✅ [Apify Success] Actor run initiated using Token #${tokenNum}! Run ID: ${runData.id}`);

      return {
        id: runData.id,
        actId: runData.actId,
        defaultDatasetId: runData.defaultDatasetId,
        status: runData.status,
        startedAt: runData.startedAt,
        usedToken: token.substring(0, 10) + "...",
      };
    } catch (error: any) {
      console.error(`[Apify] Exception with Token #${tokenNum}:`, error.message || error);
      lastError = error.message || String(error);
      if (idx + 1 < candidateTokens.length) {
        const nextTokenNum = tokens.indexOf(candidateTokens[idx + 1]) + 1;
        console.warn(`⚠️ [Apify Failover] Failing over to Token #${nextTokenNum}...`);
      }
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

  const nonExhausted = tokens.filter((t) => !exhaustedTokens.has(t));
  const candidateTokens = nonExhausted.length > 0 ? nonExhausted : tokens;

  for (let idx = 0; idx < candidateTokens.length; idx++) {
    const token = candidateTokens[idx];
    const tokenNum = tokens.indexOf(token) + 1;
    const runUrl = `${APIFY_BASE_URL}/acts/${actorIdPath}/runs?token=${token}&waitForFinish=30&memory=256&timeout=30`;

    try {
      console.log(`[Apify Single Ad] Refreshing ad ${adArchiveId} using Token #${tokenNum} of ${tokens.length}...`);
      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actorInput),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`[Apify Single Ad] Token #${tokenNum} failed: ${errorText}`);
        if (
          res.status === 402 ||
          res.status === 403 ||
          res.status === 429 ||
          errorText.toLowerCase().includes("limit") ||
          errorText.toLowerCase().includes("credit")
        ) {
          exhaustedTokens.add(token);
        }
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
      console.error(`[Apify Single Ad] Error with token #${tokenNum}:`, err.message || err);
    }
  }

  return null;
}
