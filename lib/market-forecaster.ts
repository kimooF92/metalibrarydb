import { db } from "@/db";
import { ads, scrapedProducts, trackedPages } from "@/db/schema";
import { sql, desc, count, eq } from "drizzle-orm";

export interface MarketForecastData {
  generatedAt: string;
  telemetryWindowDays: number;
  marketHealthScore: number; // 0 - 100
  marketSentiment: "Bullish (High Scaling)" | "Moderate (Selective Winners)" | "Saturated / Cautious";
  trendSummary: string;
  risingNiches: {
    niche: string;
    velocityScore: number; // 1-100
    suggestedPriceRange: string;
    reasoning: string;
  }[];
  saturationWarnings: {
    nicheOrProduct: string;
    warningLevel: "high" | "medium" | "low";
    recommendation: string;
  }[];
  creativeRecommendations: {
    recommendedFormat: "UGC Video" | "Single Image" | "Carousel" | "Offers/Bundles";
    suggestedHooks: string[];
    dominantCTA: string;
  };
  actionableInsights: string[];
  modelUsed: string;
}

// DeepSeek primary and fallback cascade on OpenRouter
const DEEPSEEK_MODELS = [
  "deepseek/deepseek-r1",
  "deepseek/deepseek-chat",
  "meta-llama/llama-3.3-70b-instruct",
  "google/gemini-2.0-flash-001",
];

// Helper to strip markdown codeblocks, reasoning tags (<think>...</think>), and parse JSON safely
function cleanAndParseJson<T>(rawText: string): T | null {
  if (!rawText) return null;
  try {
    // 1. Remove <think>...</think> blocks from DeepSeek R1
    let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // 2. Remove markdown json fences if present
    if (cleaned.includes("```json")) {
      const start = cleaned.indexOf("```json") + 7;
      const end = cleaned.indexOf("```", start);
      cleaned = (end !== -1 ? cleaned.substring(start, end) : cleaned.substring(start)).trim();
    } else if (cleaned.includes("```")) {
      const start = cleaned.indexOf("```") + 3;
      const end = cleaned.indexOf("```", start);
      cleaned = (end !== -1 ? cleaned.substring(start, end) : cleaned.substring(start)).trim();
    }

    // 3. Find outermost JSON object
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn("[Forecast JSON Parse Error]:", err);
    return null;
  }
}

/**
 * 1. Collects live 7-day aggregate market signals from PostgreSQL
 */
export async function extractMarketSignals() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 1. Active Ads & 7-day Launch Velocity
  const [adsSummary] = await db
    .select({
      totalActiveAds: count(),
      newAdsLast7Days: sql<number>`COUNT(CASE WHEN ${ads.firstSeenAt} >= ${sevenDaysAgo} OR ${ads.startedRunningOn} >= ${sevenDaysAgo} THEN 1 END)`.mapWith(Number),
      videoCount: sql<number>`COUNT(CASE WHEN ${ads.mediaType} = 'video' THEN 1 END)`.mapWith(Number),
      imageCount: sql<number>`COUNT(CASE WHEN ${ads.mediaType} = 'image' THEN 1 END)`.mapWith(Number),
    })
    .from(ads)
    .where(eq(ads.isArchived, false));

  // 2. Category distributions & average price points (7-day and overall catalog)
  const priceExpr = sql`COALESCE(NULLIF(SUBSTRING(REPLACE(${scrapedProducts.currentPrice}, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0)`;
  const topCategories = await db
    .select({
      category: sql<string>`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`,
      productCount: count(),
      newThisWeek: sql<number>`COUNT(CASE WHEN ${scrapedProducts.createdAt} >= ${sevenDaysAgo} THEN 1 END)`.mapWith(Number),
      avgPrice: sql<number>`ROUND(AVG(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END), 1)`.mapWith(Number),
      minPrice: sql<number>`MIN(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
      maxPrice: sql<number>`MAX(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
    })
    .from(scrapedProducts)
    .groupBy(sql`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`)
    .orderBy(desc(count()))
    .limit(8);

  // 3. Top Call-to-Actions (CTAs) in the last 7 days
  const topCtas = await db
    .select({
      ctaText: ads.ctaText,
      count: count(),
    })
    .from(ads)
    .where(
      sql`${ads.ctaText} IS NOT NULL AND ${ads.ctaText} != '' AND (${ads.firstSeenAt} >= ${sevenDaysAgo} OR ${ads.isArchived} = false)`
    )
    .groupBy(ads.ctaText)
    .orderBy(desc(count()))
    .limit(5);

  // 4. Tracked Brands scaling momentum
  const [brandsSummary] = await db
    .select({
      monitoredPages: count(),
      activePages: sql<number>`COUNT(CASE WHEN ${trackedPages.currentResults} > 0 THEN 1 END)`.mapWith(Number),
    })
    .from(trackedPages);

  return {
    windowDays: 7,
    totalActiveAds: Number(adsSummary?.totalActiveAds || 0),
    newAdsLast7Days: Number(adsSummary?.newAdsLast7Days || 0),
    mediaFormatRatio: {
      videoAds: Number(adsSummary?.videoCount || 0),
      imageAds: Number(adsSummary?.imageCount || 0),
    },
    topCategories,
    topCtas,
    monitoredBrands: Number(brandsSummary?.monitoredPages || 0),
    activeBrands: Number(brandsSummary?.activePages || 0),
  };
}

/**
 * 2. Generates AI Market Forecast via DeepSeek on OpenRouter with automatic failover
 */
export async function generateAiMarketForecast(): Promise<MarketForecastData> {
  const signals = await extractMarketSignals();
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;

  const systemPrompt = `You are a high-level E-Commerce Media Buying & Market Intelligence Analyst.
Analyze the provided real-time 7-day Meta Ad Library and Product catalog telemetry to deliver a sharp, highly accurate 7-to-14-day market forecast.

Rules:
1. Base all conclusions strictly on the 7-day data provided.
2. Focus on actionable unit economics, high-scaling niches, saturation warnings, and creative angles.
3. Return ONLY a valid JSON object matching this exact schema:
{
  "marketHealthScore": <number between 0 and 100>,
  "marketSentiment": "Bullish (High Scaling)" | "Moderate (Selective Winners)" | "Saturated / Cautious",
  "trendSummary": "<2 concise sentences summarizing current e-commerce momentum and competition>",
  "risingNiches": [
    {
      "niche": "<category/sub-category name>",
      "velocityScore": <number 1-100>,
      "suggestedPriceRange": "<e.g. 45 - 89 TND>",
      "reasoning": "<why this niche is scaling right now>"
    }
  ],
  "saturationWarnings": [
    {
      "nicheOrProduct": "<saturated product or angle>",
      "warningLevel": "high" | "medium" | "low",
      "recommendation": "<strategic recommendation to avoid ad fatigue>"
    }
  ],
  "creativeRecommendations": {
    "recommendedFormat": "UGC Video" | "Single Image" | "Carousel" | "Offers/Bundles",
    "suggestedHooks": ["<Hook Angle 1>", "<Hook Angle 2>", "<Hook Angle 3>"],
    "dominantCTA": "<e.g. Shop Now, Order via WhatsApp>"
  },
  "actionableInsights": [
    "<Strategic Action Directive 1>",
    "<Strategic Action Directive 2>",
    "<Strategic Action Directive 3>"
  ]
}`;

  const userContent = `=== 7-DAY MARKET TELEMETRY REPORT ===
- Time Window: Last 7 Days
- Active Ads Monitored: ${signals.totalActiveAds} (${signals.newAdsLast7Days} newly launched this week)
- Creative Format Split: ${signals.mediaFormatRatio.videoAds} Videos vs ${signals.mediaFormatRatio.imageAds} Images
- Monitored Brand Pages: ${signals.monitoredBrands} (${signals.activeBrands} actively running ads)
- Top Categories & Pricing Matrix: ${JSON.stringify(signals.topCategories, null, 2)}
- Top Performing CTAs: ${JSON.stringify(signals.topCtas, null, 2)}
====================================`;

  // 1. Call DeepSeek via OpenRouter with Model Fallback
  if (openRouterKey && openRouterKey.trim() !== "") {
    for (const model of DEEPSEEK_MODELS) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openRouterKey.trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://meta-ad-tracker.local",
            "X-Title": "DeepSeek Market Forecaster",
          },
          body: JSON.stringify({
            model,
            models: DEEPSEEK_MODELS, // OpenRouter native cascade
            temperature: 0.15,
            max_tokens: 1500,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(20000), // 20s timeout for DeepSeek R1 reasoning
        });

        if (response.ok) {
          const data = await response.json();
          const rawContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning;
          const parsed = cleanAndParseJson<Omit<MarketForecastData, "generatedAt" | "telemetryWindowDays" | "modelUsed">>(rawContent);

          if (parsed && typeof parsed.marketHealthScore === "number") {
            return {
              ...parsed,
              generatedAt: new Date().toISOString(),
              telemetryWindowDays: 7,
              modelUsed: data.model || model,
            };
          }
        }
      } catch (err: any) {
        console.warn(`[OpenRouter DeepSeek Warning] Model ${model} encountered an issue:`, err?.message || err);
      }
    }
  }

  // 2. Deterministic Rule-Based Fallback (Zero Network / Zero Cost Guarantee)
  return getOfflineFallbackForecast(signals);
}

function getOfflineFallbackForecast(signals: Awaited<ReturnType<typeof extractMarketSignals>>): MarketForecastData {
  const topCat = signals.topCategories[0]?.category || "Beauty, Health & Care";
  const secondCat = signals.topCategories[1]?.category || "Electronics & Tech";
  const avgP = signals.topCategories[0]?.avgPrice || 59;
  const isVideoDominant = signals.mediaFormatRatio.videoAds >= signals.mediaFormatRatio.imageAds;

  return {
    generatedAt: new Date().toISOString(),
    telemetryWindowDays: 7,
    marketHealthScore: Math.min(95, Math.max(60, Math.round(50 + (signals.newAdsLast7Days / Math.max(1, signals.totalActiveAds)) * 50))),
    marketSentiment: signals.newAdsLast7Days > 20 ? "Bullish (High Scaling)" : "Moderate (Selective Winners)",
    trendSummary: `Across the last 7 days, ${signals.newAdsLast7Days} new creatives were deployed across ${signals.activeBrands} active brands. ${topCat} leads category volume with high creative turnover.`,
    risingNiches: [
      {
        niche: topCat,
        velocityScore: 88,
        suggestedPriceRange: `${Math.max(29, Math.round(avgP * 0.8))} - ${Math.round(avgP * 1.3)} TND`,
        reasoning: "Strong active duplication rates and consistent new ad launches over the 7-day window.",
      },
      {
        niche: secondCat,
        velocityScore: 74,
        suggestedPriceRange: "39 - 89 TND",
        reasoning: "High demand for problem-solving gadgets and bundle offers with free shipping.",
      },
    ],
    saturationWarnings: [
      {
        nicheOrProduct: "Static Single-Image Ads with generic claims",
        warningLevel: "medium",
        recommendation: "Pivot to authentic UGC demonstration videos highlighting before/after results and cash-on-delivery trust.",
      },
    ],
    creativeRecommendations: {
      recommendedFormat: isVideoDominant ? "UGC Video" : "Offers/Bundles",
      suggestedHooks: [
        "Stop scrolling if you're tired of [Specific Daily Frustration]...",
        "3 Reasons why this is currently selling out in Tunisia...",
        "Before you buy another cheap alternative, watch this test!",
      ],
      dominantCTA: signals.topCtas[0]?.ctaText || "Shop Now",
    },
    actionableInsights: [
      "Test Sweet-Spot Pricing: Products priced between 39 TND and 69 TND maintain the highest checkout completion velocity.",
      "Combat 7-Day Ad Fatigue: Launch at least 3 hook variations per winning SKU within the first week of scaling.",
      "Codify WhatsApp Recovery: Integrate 1-click WhatsApp order confirmation to reduce COD cancellation rates.",
    ],
    modelUsed: "offline_deterministic_rules",
  };
}
