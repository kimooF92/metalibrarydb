import {
  OPPORTUNITY_AI_MODEL,
  OPPORTUNITY_TIMEOUT_MS,
  OPPORTUNITY_MAX_TOKENS,
} from "./constants";

export interface OpenRouterResponseMeta {
  rawJson: unknown;
  returnedModel: string | null;
  finishReason: string | null;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Strips code fences (e.g. ```json ... ```) safely without corrupting JSON
 */
export function extractCleanJsonString(rawText: string): string {
  if (!rawText) return "";

  let cleaned = rawText.trim();

  // Strip <think> tags if model emits thinking trace
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Strip ```json or ``` code fences
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Robust boundary extraction: isolate the outermost JSON object braces { ... }
  // to safely strip any model chain-of-thought, thinking tokens, or preamble notes.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned.trim();
}

/**
 * Strict OpenRouter client targeted exclusively to minimax/minimax-m3.1-flash.
 * Enforces JSON mode, timeouts, safe metadata capture, and single-retry on 429/5xx.
 */
export async function callMiniMaxStage(params: {
  systemPrompt: string;
  userJsonPayload: string;
  stageName: string;
  correlationId: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<OpenRouterResponseMeta> {
  const {
    systemPrompt,
    userJsonPayload,
    stageName,
    correlationId,
    maxTokens = OPPORTUNITY_MAX_TOKENS,
    timeoutMs = OPPORTUNITY_TIMEOUT_MS,
  } = params;

  const rawApiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY || "";
  const apiKey = rawApiKey.replace(/^["']|["']$/g, "").trim();
  if (!apiKey) {
    throw new Error(
      `[${correlationId}] OpenRouter API key is not configured on the server. AI opportunity generation is unavailable.`
    );
  }

  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const requestBody = {
    model: OPPORTUNITY_AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userJsonPayload },
    ],
    response_format: { type: "json_object" },
    reasoning: { effort: "low", exclude: true },
    temperature: 0.1,
    max_tokens: maxTokens,
    stream: false,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey.trim()}`,
    "HTTP-Referer": "https://metalibrarydb.internal",
    "X-Title": "Opportunity-Seeker-MiniMax",
  };

  let attempts = 0;
  const maxAttempts = 2; // initial + 1 retry for transient 429/5xx only

  while (attempts < maxAttempts) {
    attempts++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      // Handle transient errors with 1 fast retry
      if ((response.status === 429 || response.status >= 500) && attempts < maxAttempts) {
        clearTimeout(timeoutId);
        console.warn(
          `[${correlationId}] OpenRouter transient HTTP ${response.status} on stage ${stageName}. Retrying in 1s...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        clearTimeout(timeoutId);
        throw new Error(
          `OpenRouter API error (HTTP ${response.status}) on stage ${stageName}: ${errorText.slice(0, 200)}`
        );
      }

      // Keep timeoutId active during body reading so slow streams are strictly bounded by timeoutMs
      const json = await response.json();
      clearTimeout(timeoutId);
      const choice = json.choices?.[0];
      if (!choice || !choice.message?.content) {
        throw new Error(`OpenRouter returned empty choices/content on stage ${stageName}`);
      }

      if (choice.finish_reason === "length") {
        throw new Error(`OpenRouter response was truncated due to max_tokens limit on stage ${stageName}`);
      }

      const cleanJsonStr = extractCleanJsonString(choice.message.content);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(cleanJsonStr);
      } catch (parseErr: unknown) {
        throw new Error(
          `Failed to parse JSON response from ${OPPORTUNITY_AI_MODEL} on stage ${stageName}: ${(parseErr as Error).message}`
        );
      }

      return {
        rawJson: parsedJson,
        returnedModel: json.model || OPPORTUNITY_AI_MODEL,
        finishReason: choice.finish_reason || "stop",
        usage: json.usage
          ? {
              promptTokens: json.usage.prompt_tokens,
              completionTokens: json.usage.completion_tokens,
              totalTokens: json.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      const errorObj = err as Error;
      // Do NOT retry on timeout abort — fail fast to avoid exceeding route timeout
      if (errorObj.name === "AbortError") {
        throw new Error(`OpenRouter stage ${stageName} timed out after ${timeoutMs}ms.`);
      }

      if (attempts >= maxAttempts) {
        throw err;
      }
    }
  }

  throw new Error(`OpenRouter stage ${stageName} failed after ${maxAttempts} attempts.`);
}
