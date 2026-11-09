import crypto from "crypto";
import { getQstashClient, getAppBaseUrl, getDeduplicationId } from "./qstash";

export const ALLOWED_STORAGE_HOSTS = new Set([
  "fbcdn.net",
  "fna.fbcdn.net",
  "video.xx.fbcdn.net",
  "f001.backblazeb2.com",
  "f002.backblazeb2.com",
  "f004.backblazeb2.com",
  "api.backblazeb2.com",
  "supabase.co",
  "catbox.moe",
  "files.catbox.moe",
]);

/**
 * Validates whether the given media URL host is in the authorized allowlist.
 * Protects the backend against SSRF and unauthorized external requests.
 */
export function isAllowedMediaHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    for (const allowed of ALLOWED_STORAGE_HOSTS) {
      if (hostname === allowed || hostname.endsWith("." + allowed)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  prob?: number;
}

/**
 * Extracts words strictly ending at or before t <= maxSeconds (default 3.2s).
 * Avoids broad segment overlaps where a 10-second sentence is wrongly labeled as a "3-second hook".
 */
export function clipOpeningHook(words: WordTimestamp[], maxSeconds = 3.2): string | null {
  if (!Array.isArray(words) || words.length === 0) return null;
  const hookWords: string[] = [];
  for (const w of words) {
    if (typeof w.end === "number" && w.end <= maxSeconds) {
      const clean = w.word?.trim();
      if (clean) hookWords.push(clean);
    } else {
      break;
    }
  }
  return hookWords.length > 0 ? hookWords.join(" ") : null;
}

/**
 * Generates an Upstash QStash compliant deduplication ID (underscores only, no colons).
 */
export function generateTranscriptionDeduplicationId(adId: string, mediaHash: string): string {
  return getDeduplicationId("transcribe", `${adId}_${mediaHash}`);
}

export interface EnqueueTranscriptionPayload {
  adId: string;
  mediaUrl: string;
  mediaHash: string;
  language?: string | null;
  model?: "turbo" | "small";
}

export interface EnqueueTranscriptionResult {
  success: boolean;
  messageId?: string;
  rateLimited?: boolean;
  error?: string;
}

/**
 * Dispatches an asynchronous transcription job to QStash.
 * If QStash is unconfigured (e.g. in test or local offline environment), returns success: false with reason.
 */
export async function enqueueAdTranscription(
  payload: EnqueueTranscriptionPayload
): Promise<EnqueueTranscriptionResult> {
  const client = getQstashClient();
  if (!client) {
    return { success: false, error: "qstash_not_configured" };
  }

  const appUrl = getAppBaseUrl();
  const destinationUrl = `${appUrl}/api/qstash/transcribe-ad`;
  const deduplicationId = generateTranscriptionDeduplicationId(payload.adId, payload.mediaHash);

  const configuredSecret = process.env.API_SECRET;
  const headers: Record<string, string> = {};
  if (configuredSecret) {
    headers["x-api-secret"] = configuredSecret;
  }

  try {
    const res = await client.publishJSON({
      url: destinationUrl,
      body: payload,
      deduplicationId,
      retries: 2,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    return {
      success: true,
      messageId: res.messageId,
    };
  } catch (error: any) {
    console.error("[Transcription Pipeline] Failed to publish QStash job:", error?.message || error);
    return { success: false, error: error?.message || "publish_failed" };
  }
}

export interface InstaBoxTranscriptionResult {
  status: "completed" | "no_speech";
  media_hash: string;
  language?: string;
  language_confidence?: number;
  duration_seconds: number;
  is_truncated: boolean;
  full_text?: string;
  hook_text?: string | null;
  words?: WordTimestamp[];
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
}

/**
 * Directly dispatches an audio extraction and Whisper inference job to the live InstaBox MicroVM.
 */
export async function executeTranscriptionOnInstaBox(
  payload: EnqueueTranscriptionPayload
): Promise<{ success: true; data: InstaBoxTranscriptionResult } | { success: false; error: string; statusCode?: number }> {
  const instaboxUrl = process.env.INSTABOX_TRANSCRIPTION_URL?.replace(/\/$/, "");
  const apiKey = process.env.INSTABOX_TRANSCRIPTION_KEY;

  if (!instaboxUrl || !apiKey) {
    return { success: false, error: "InstaBox transcription service is not configured in environment" };
  }

  if (!isAllowedMediaHost(payload.mediaUrl)) {
    return { success: false, error: `Media host not allowed: ${payload.mediaUrl}`, statusCode: 400 };
  }

  try {
    const res = await fetch(`${instaboxUrl}/v1/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": apiKey,
      },
      body: JSON.stringify({
        signed_media_url: payload.mediaUrl,
        media_hash: payload.mediaHash,
        language: payload.language || null,
        model: payload.model || "turbo",
      }),
      signal: AbortSignal.timeout(60000), // 60s timeout for cold starts and inference
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `InstaBox responded with HTTP ${res.status}: ${errText.slice(0, 300)}`, statusCode: res.status };
    }

    const data = (await res.json()) as InstaBoxTranscriptionResult;
    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: `InstaBox network error: ${error.message || String(error)}${error?.cause ? ` [cause: ${error.cause.message || error.cause}]` : ""}`,
    };
  }
}
