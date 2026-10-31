import { Client, QstashDailyRatelimitError } from "@upstash/qstash";
import crypto from "crypto";

let cachedClient: Client | null = null;
let lastToken: string | undefined = undefined;

/**
 * Returns the lazily initialized QStash Client based on live environment variables.
 */
export function getQstashClient(): Client | null {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  if (cachedClient && lastToken === token) {
    return cachedClient;
  }
  const baseUrl = process.env.QSTASH_URL;
  cachedClient = new Client({
    token,
    baseUrl: baseUrl || undefined,
  });
  lastToken = token;
  return cachedClient;
}

/**
 * Singleton Upstash QStash Client accessor
 */
export const qstashClient = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getQstashClient();
    if (!client) return undefined;
    const val = (client as any)[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
});

/**
 * Returns true if QStash token is configured
 */
export const isQStashConfigured = (): boolean => Boolean(process.env.QSTASH_TOKEN);

/**
 * Returns the public application URL for QStash webhook delivery.
 */
export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    const url = process.env.NEXT_PUBLIC_APP_URL.trim();
    return url.startsWith("http") ? url : `https://${url}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim()}`;
  }
  return "http://localhost:3000";
}

/**
 * Generates a stable deduplication ID from a prefix and unique key (e.g. normalized URL).
 */
export function getDeduplicationId(prefix: string, key: string): string {
  const hash = crypto.createHash("sha256").update(key.trim().toLowerCase()).digest("hex").slice(0, 32);
  return `${prefix}:${hash}`;
}

let isQueueInitialized = false;

/**
 * Idempotently ensures the product-extraction queue has a max parallelism of 2.
 * This shields external sites, Firecrawl quotas, and the Supabase pooler from concurrency spikes.
 */
export async function ensureProductExtractionQueue(): Promise<void> {
  const client = getQstashClient();
  if (!client || isQueueInitialized) return;
  try {
    await client.queue({ queueName: "product-extraction" }).upsert({
      parallelism: 2,
    });
    isQueueInitialized = true;
  } catch (err: any) {
    // If upsert fails (e.g. offline/network), log warning and continue so enqueue can still attempt delivery
    console.warn("[QStash] Queue upsert notice:", err?.message || err);
  }
}

export interface EnqueueProductScrapeOptions {
  url: string;
  productId?: string | null;
  pageId?: string | null;
  adId?: string | null;
  workspaceId?: string | null;
}

export interface EnqueueResult {
  success: boolean;
  messageId?: string;
  rateLimited?: boolean;
  error?: string;
}

/**
 * Enqueues a product landing page URL for asynchronous background scraping.
 * Automatically de-duplicates identical URLs published within 10 minutes.
 */
export async function enqueueProductScrape(
  payload: EnqueueProductScrapeOptions
): Promise<EnqueueResult> {
  const client = getQstashClient();
  if (!client) {
    return { success: false, error: "qstash_not_configured" };
  }

  const appUrl = getAppBaseUrl();
  const destinationUrl = `${appUrl}/api/qstash/extract-product`;
  const deduplicationId = getDeduplicationId("prod-scrape", payload.url);

  try {
    await ensureProductExtractionQueue();

    const queue = client.queue({ queueName: "product-extraction" });
    const res = await queue.enqueueJSON({
      url: destinationUrl,
      body: payload,
      deduplicationId,
      retries: 3,
    });

    return {
      success: true,
      messageId: res.messageId,
    };
  } catch (error: any) {
    if (error instanceof QstashDailyRatelimitError) {
      console.warn(`[QStash] Daily free-tier rate limit reached. Reset at: ${error.reset}`);
      return { success: false, rateLimited: true, error: "daily_rate_limit_exceeded" };
    }
    console.error("[QStash] Failed to enqueue product scrape:", error?.message || error);
    return { success: false, error: error?.message || "enqueue_failed" };
  }
}
