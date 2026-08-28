import { db } from "@/db";
import { ads, scrapedProducts, trackedPages } from "@/db/schema";
import { sql, desc, count, eq } from "drizzle-orm";

export interface MarketTelemetrySnapshot {
  totalActiveAds: number;
  newAdsLast7Days: number;
  videoAds: number;
  imageAds: number;
  videoPercent: number;
  imagePercent: number;
  monitoredPages: number;
  scalingPagesCount: number;
  totalAdsScaled: number;
  avgScalingDelta: string;
  descalingPagesCount: number;
  totalAdsDescaled: number;
  avgDescalingDelta: string;
  stablePagesCount: number;
  netAdDelta: number;
  topCategories: { category: string; count: number }[];
  topCtas: { cta: string; count: number }[];
}

export interface VelocityAnalysis {
  scalingVsDescalingSummary: string;
  competitivePressure: "High" | "Moderate" | "Low";
  churnRateAssessment: string;
}

export interface CreativeFormatInsight {
  videoDominanceNote: string;
  topCtaRecommendation: string;
}

export interface MarketAnalysisData {
  generatedAt: string;
  modelUsed: string;
  marketHealthScore: number; // 0 - 100
  marketSentiment: "Bullish (High Scaling)" | "Moderate (Selective Winners)" | "Cooling / High Churn";
  executiveOverview: string;
  velocityAnalysis: VelocityAnalysis;
  creativeFormatInsight: CreativeFormatInsight;
  actionableDirectives: string[];
  telemetrySnapshot: MarketTelemetrySnapshot;
}

// Aliases for compatibility
export type MarketForecastData = MarketAnalysisData;
export type MarketOpportunityResearch = MarketAnalysisData;

// DeepSeek primary and fallback cascade on OpenRouter
const DEEPSEEK_MODELS = [
  "deepseek/deepseek-chat",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-r1",
];

// Helper to strip markdown codeblocks, reasoning tags (<think>...</think>), repair and parse JSON safely
function cleanAndParseJson<T>(rawText: string): T | null {
  if (!rawText) return null;
  try {
    // 1. Remove <think>...</think> blocks
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

    const firstBrace = cleaned.indexOf("{");
    if (firstBrace === -1) return null;
    cleaned = cleaned.substring(firstBrace);

    // Try direct parse first
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // 3. Fallback: repair trailing comma or unclosed structure
      let repaired = cleaned
        .replace(/,\s*([\]}])/g, "$1")
        .replace(/,\s*"[^"]*":?\s*$/, "")
        .replace(/,\s*$/, "");

      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escape = false;

      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === "\\") {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") openBraces++;
          else if (char === "}") openBraces = Math.max(0, openBraces - 1);
          else if (char === "[") openBrackets++;
          else if (char === "]") openBrackets = Math.max(0, openBrackets - 1);
        }
      }

      if (inString) repaired += '"';
      while (openBrackets > 0) {
        repaired += "]";
        openBrackets--;
      }
      while (openBraces > 0) {
        repaired += "}";
        openBraces--;
      }

      return JSON.parse(repaired) as T;
    }
  } catch (err) {
    console.warn("[Forecast JSON Parse Error]:", err);
    return null;
  }
}

/**
 * Extracts pure aggregate market telemetry and scale/descale counts (NO page names or IDs)
 */
export async function extractMarketSignals(): Promise<MarketTelemetrySnapshot> {
  // 1. Total Active Ads
  const [activeAdsResult] = await db
    .select({ count: count() })
    .from(ads)
    .where(eq(ads.isArchived, false));
  const totalActiveAds = Number(activeAdsResult?.count || 0);

  // 2. New ads in last 7 days
  const [newAds7dResult] = await db
    .select({ count: count() })
    .from(ads)
    .where(
      sql`"first_seen_at" >= NOW() - INTERVAL '7 days' OR "last_seen_at" >= NOW() - INTERVAL '7 days'`
    );
  const newAdsLast7Days = Number(newAds7dResult?.count || 0);

  // 3. Video vs Image ads
  const [videoAdsResult] = await db
    .select({ count: count() })
    .from(ads)
    .where(sql`"media_type" = 'video' AND "is_archived" = false`);
  const videoCount = Number(videoAdsResult?.count || 0);
  const imageCount = Math.max(0, totalActiveAds - videoCount);
  const videoPercent = totalActiveAds > 0 ? Math.round((videoCount / totalActiveAds) * 100) : 60;
  const imagePercent = Math.max(0, 100 - videoPercent);

  // 4. Scaling / Descaling Aggregate Counts (Pure counts, NO page names/IDs)
  const scalingStatsRaw = await db.execute(sql`
    WITH latest_scans AS (
      SELECT 
        s.tracked_page_id,
        s.difference
      FROM (
        SELECT 
          tracked_page_id, 
          difference,
          row_number() OVER (PARTITION BY tracked_page_id ORDER BY checked_at DESC) as rn
        FROM scan_history
        WHERE difference IS NOT NULL
      ) s
      WHERE s.rn = 1
    )
    SELECT 
      COUNT(CASE WHEN difference > 0 THEN 1 END) AS "scalingPagesCount",
      COALESCE(SUM(CASE WHEN difference > 0 THEN difference ELSE 0 END), 0) AS "totalAdsScaled",
      COUNT(CASE WHEN difference < 0 THEN 1 END) AS "descalingPagesCount",
      COALESCE(SUM(CASE WHEN difference < 0 THEN ABS(difference) ELSE 0 END), 0) AS "totalAdsDescaled",
      COUNT(CASE WHEN difference = 0 THEN 1 END) AS "stablePagesCount",
      COUNT(*) AS "totalPagesWithDiff"
    FROM latest_scans;
  `);

  const scalingStats = ((Array.isArray(scalingStatsRaw) ? scalingStatsRaw : (scalingStatsRaw as any).rows || [])[0] || {}) as any;
  const scalingPagesCount = Number(scalingStats.scalingPagesCount || 0);
  const totalAdsScaled = Number(scalingStats.totalAdsScaled || 0);
  const descalingPagesCount = Number(scalingStats.descalingPagesCount || 0);
  const totalAdsDescaled = Number(scalingStats.totalAdsDescaled || 0);
  const stablePagesCount = Number(scalingStats.stablePagesCount || 0);
  const netAdDelta = totalAdsScaled - totalAdsDescaled;
  const avgScalingDelta = scalingPagesCount > 0 ? (totalAdsScaled / scalingPagesCount).toFixed(1) : "0";
  const avgDescalingDelta = descalingPagesCount > 0 ? (totalAdsDescaled / descalingPagesCount).toFixed(1) : "0";

  // 5. Total Monitored Brands
  const [monitoredBrandsResult] = await db.select({ count: count() }).from(trackedPages);
  const monitoredPages = Number(monitoredBrandsResult?.count || 0);

  // 6. Top Categories
  const topCategoriesRaw = await db
    .select({
      category: scrapedProducts.category,
      count: count(),
    })
    .from(scrapedProducts)
    .where(sql`"category" IS NOT NULL`)
    .groupBy(scrapedProducts.category)
    .orderBy(desc(count()))
    .limit(5);

  // 7. Top CTAs
  const topCtasRaw = await db
    .select({
      ctaText: ads.ctaText,
      count: count(),
    })
    .from(ads)
    .where(sql`"cta_text" IS NOT NULL AND "is_archived" = false`)
    .groupBy(ads.ctaText)
    .orderBy(desc(count()))
    .limit(4);

  return {
    totalActiveAds,
    newAdsLast7Days,
    videoAds: videoCount,
    imageAds: imageCount,
    videoPercent,
    imagePercent,
    monitoredPages,
    scalingPagesCount,
    totalAdsScaled,
    avgScalingDelta,
    descalingPagesCount,
    totalAdsDescaled,
    avgDescalingDelta,
    stablePagesCount,
    netAdDelta,
    topCategories: topCategoriesRaw.map((c) => ({
      category: c.category || "General",
      count: Number(c.count),
    })),
    topCtas: topCtasRaw.map((cta) => ({
      cta: cta.ctaText || "Shop now",
      count: Number(cta.count),
    })),
  };
}

/**
 * Generates Simple, Data-Grounded AI Market Analysis based purely on scaling/descaling counts & telemetry
 */
export async function generateAiMarketForecast(): Promise<MarketAnalysisData> {
  const telemetry = await extractMarketSignals();
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;

  const systemPrompt = `You are a Meta E-Commerce Ad Intelligence Analyst.
Analyze market health and scaling velocity based STRICTLY on the aggregated counts and telemetry provided.
Rules:
- NO page names, NO page IDs, NO invented product names, and NO hypothetical formulas.
- Base every single observation directly on the input numbers (active ads, new ads, video %, scaling vs descaling counts).
- Return ONLY a valid JSON object matching this schema:
{
  "marketHealthScore": <number 0-100>,
  "marketSentiment": "Bullish (High Scaling)" | "Moderate (Selective Winners)" | "Cooling / High Churn",
  "executiveOverview": "<2-3 concise sentences on live market momentum, scaling pace, and competition>",
  "velocityAnalysis": {
    "scalingVsDescalingSummary": "<1-2 sentences on what the scaling pages count vs descaling pages count signals>",
    "competitivePressure": "High" | "Moderate" | "Low",
    "churnRateAssessment": "<1 sentence on descaling churn, ad fatigue, and budget shifts>"
  },
  "creativeFormatInsight": {
    "videoDominanceNote": "<1 sentence explaining why the video vs image format ratio matters>",
    "topCtaRecommendation": "<1 sentence on CTA execution>"
  },
  "actionableDirectives": [
    "<Directive 1 based on live scaling/descaling dynamics>",
    "<Directive 2>",
    "<Directive 3>"
  ]
}`;

  const userContent = `LIVE AGGREGATED MARKET TELEMETRY:
${JSON.stringify(telemetry, null, 2)}`;

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
            "X-Title": "DeepSeek Market Intelligence",
          },
          body: JSON.stringify({
            model,
            temperature: 0.15,
            max_tokens: 1200,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (response.ok) {
          const data = await response.json();
          const rawContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning;
          const parsed = cleanAndParseJson<Omit<MarketAnalysisData, "generatedAt" | "modelUsed" | "telemetrySnapshot">>(rawContent);

          if (parsed && typeof parsed.marketHealthScore === "number") {
            return {
              ...parsed,
              generatedAt: new Date().toISOString(),
              modelUsed: model,
              telemetrySnapshot: telemetry,
            };
          }
        }
      } catch (modelErr: any) {
        console.warn(`[OpenRouter DeepSeek Warning] Model ${model}:`, modelErr?.message || modelErr);
      }
    }
  }

  // 2. Deterministic Rule-Based Fallback Engine
  return buildDeterministicFallback(telemetry);
}

/**
 * Deterministic heuristic fallback matching the simplified grounded schema
 */
function buildDeterministicFallback(telemetry: MarketTelemetrySnapshot): MarketAnalysisData {
  const isNetPositive = telemetry.netAdDelta >= 0;
  const healthScore = Math.min(
    95,
    Math.max(
      35,
      Math.round(
        50 +
          (telemetry.scalingPagesCount / Math.max(1, telemetry.scalingPagesCount + telemetry.descalingPagesCount)) * 40 +
          (isNetPositive ? 10 : -10)
      )
    )
  );

  const sentiment =
    healthScore >= 70
      ? "Bullish (High Scaling)"
      : healthScore >= 45
      ? "Moderate (Selective Winners)"
      : "Cooling / High Churn";

  return {
    generatedAt: new Date().toISOString(),
    modelUsed: "offline_deterministic_rules",
    marketHealthScore: healthScore,
    marketSentiment: sentiment,
    executiveOverview: `The market displays ${sentiment.toLowerCase()} momentum with ${telemetry.totalActiveAds.toLocaleString()} active creatives (${telemetry.newAdsLast7Days.toLocaleString()} launched in the last 7 days). Scaling is concentrated across ${telemetry.scalingPagesCount} stores (+${telemetry.totalAdsScaled} ads), while ${telemetry.descalingPagesCount} stores show campaign contraction (-${telemetry.totalAdsDescaled} ads).`,
    velocityAnalysis: {
      scalingVsDescalingSummary: `${telemetry.scalingPagesCount} pages are actively scaling (avg +${telemetry.avgScalingDelta} ads/page) against ${telemetry.descalingPagesCount} descaling pages, indicating ${isNetPositive ? "net market expansion" : "selective winners in a cautious market"}.`,
      competitivePressure: telemetry.scalingPagesCount >= 25 ? "High" : "Moderate",
      churnRateAssessment: `Descaling volume is -${telemetry.totalAdsDescaled} ads across ${telemetry.descalingPagesCount} pages, highlighting rapid creative fatigue for stagnant offers.`,
    },
    creativeFormatInsight: {
      videoDominanceNote: `Video creatives represent ${telemetry.videoPercent}% of all active ads, confirming high-engagement video hooks as the dominant winning format.`,
      topCtaRecommendation: `Standard direct-response CTAs dominate (${telemetry.topCtas.map((c) => c.cta).slice(0, 2).join(", ")}), signaling direct lander checkout flows.`,
    },
    actionableDirectives: [
      `Double down on video-first angles to align with the ${telemetry.videoPercent}% video format market standard.`,
      `Monitor creative fatigue closely: ${telemetry.descalingPagesCount} stores descaled due to performance decay on older creatives.`,
      `Target top-volume categories (${telemetry.topCategories.map((c) => c.category).slice(0, 2).join(", ")}) where impulse buyer demand is proven.`,
    ],
    telemetrySnapshot: telemetry,
  };
}
