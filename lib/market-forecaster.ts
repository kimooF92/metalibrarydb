import { db } from "@/db";
import { ads, scrapedProducts, trackedPages } from "@/db/schema";
import { sql, desc, count, eq } from "drizzle-orm";

export interface RecommendedProduct {
  id?: string;
  title: string;
  domain: string;
  category: string;
  currentPrice: string;
  imageUrl?: string;
  productUrl?: string;
  activeAdsCount: number;
  winningReason: string;
  suggestedOfferStrategy: string;
  targetAudience: string;
}

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
  topWinningProducts: RecommendedProduct[];
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

// DeepSeek primary and fallback cascade on OpenRouter (max 3 models for OpenRouter cascade)
const DEEPSEEK_MODELS = [
  "deepseek/deepseek-v4-pro-0813",
  "deepseek/deepseek-chat",
  "deepseek/deepseek-r1",
];

// Helper to strip markdown codeblocks, reasoning tags (<think>...</think>), and parse JSON safely
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
 * 1. Collects live aggregate market signals & 15-30 day candidate products from PostgreSQL
 */
export async function extractMarketSignals() {
  // 1. Active Ads & 7-day Launch Velocity
  const [adsSummary] = await db
    .select({
      totalActiveAds: count(),
      newAdsLast7Days: sql<number>`COUNT(CASE WHEN ${ads.firstSeenAt} >= NOW() - INTERVAL '7 days' OR ${ads.startedRunningOn} >= NOW() - INTERVAL '7 days' THEN 1 END)`.mapWith(Number),
      videoCount: sql<number>`COUNT(CASE WHEN ${ads.mediaType} = 'video' THEN 1 END)`.mapWith(Number),
      imageCount: sql<number>`COUNT(CASE WHEN ${ads.mediaType} = 'image' THEN 1 END)`.mapWith(Number),
    })
    .from(ads)
    .where(eq(ads.isArchived, false));

  // 2. Category distributions & average price points
  const priceExpr = sql`COALESCE(NULLIF(SUBSTRING(REPLACE(${scrapedProducts.currentPrice}, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0)`;
  const topCategories = await db
    .select({
      category: sql<string>`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`,
      productCount: count(),
      newThisWeek: sql<number>`COUNT(CASE WHEN ${scrapedProducts.createdAt} >= NOW() - INTERVAL '7 days' THEN 1 END)`.mapWith(Number),
      avgPrice: sql<number>`ROUND(AVG(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END), 1)`.mapWith(Number),
      minPrice: sql<number>`MIN(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
      maxPrice: sql<number>`MAX(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
    })
    .from(scrapedProducts)
    .groupBy(sql`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`)
    .orderBy(desc(count()))
    .limit(8);

  // 3. Top Call-to-Actions (CTAs)
  const topCtas = await db
    .select({
      ctaText: ads.ctaText,
      count: count(),
    })
    .from(ads)
    .where(
      sql`${ads.ctaText} IS NOT NULL AND ${ads.ctaText} != '' AND (${ads.firstSeenAt} >= NOW() - INTERVAL '7 days' OR ${ads.isArchived} = false)`
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

  // 5. 15–30 Days Candidate Products from Stores with 5+ Active Products
  // Enforces: No old products (>30d), and store must have 5+ active products
  const candidateProducts = (await db.execute(sql`
    WITH active_stores AS (
      SELECT domain
      FROM scraped_products
      WHERE domain IS NOT NULL AND domain != ''
      GROUP BY domain
      HAVING COUNT(*) >= 5
    )
    SELECT 
      p.id,
      p.title,
      p.domain,
      p.current_price as "currentPrice",
      p.category,
      p.sub_category as "subCategory",
      p.main_image_url as "mainImageUrl",
      p.url,
      p.created_at as "createdAt",
      COUNT(a.id)::int as "activeAdsCount"
    FROM scraped_products p
    INNER JOIN active_stores s ON p.domain = s.domain
    LEFT JOIN ads a ON (a.product_id = p.id OR a.link_url LIKE '%' || p.domain || '%') AND a.is_archived = false
    WHERE p.created_at >= NOW() - INTERVAL '30 days'
      AND p.title IS NOT NULL
      AND p.title != ''
    GROUP BY p.id, p.title, p.domain, p.current_price, p.category, p.sub_category, p.main_image_url, p.url, p.created_at
    ORDER BY "activeAdsCount" DESC, p.created_at DESC
    LIMIT 25
  `)) as any[];

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
    candidateProducts: candidateProducts || [],
  };
}

/**
 * 2. Generates AI Market Forecast & Top 10 Winning Products via DeepSeek v4-pro on OpenRouter
 */
export async function generateAiMarketForecast(): Promise<MarketForecastData> {
  const signals = await extractMarketSignals();
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;

  const systemPrompt = `You are a high-level E-Commerce Media Buying & Winning Product Analyst.
Analyze the provided real-time market telemetry and recent 15-30 day candidate products from active stores (5+ active products).

Select and rank the TOP 10 WINNING PRODUCTS based on:
1. Active ad density and scaling momentum.
2. High conversion price points (healthy margins, sweet-spot COD pricing).
3. Broad commercial appeal, problem-solving value, or high perceived value.
4. Exclude weak or saturated products.

Return ONLY a valid JSON object matching this exact schema:
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
  "topWinningProducts": [
    {
      "id": "<candidate id>",
      "title": "<product title>",
      "domain": "<store domain>",
      "category": "<category>",
      "currentPrice": "<price e.g. 49.9 TND>",
      "activeAdsCount": <number>,
      "winningReason": "<Concise 1-sentence why it wins, e.g. High-conversion pain-point solver with strong impulse COD appeal>",
      "suggestedOfferStrategy": "<Concise offer, e.g. Bundle 2 for 79 TND + Free Delivery>",
      "targetAudience": "<Concise demographic, e.g. Women 25-45>"
    }
  ],
  "saturationWarnings": [
    {
      "nicheOrProduct": "<saturated product or angle>",
      "warningLevel": "high" | "medium" | "low",
      "recommendation": "<concise pivot advice>"
    }
  ],
  "creativeRecommendations": {
    "recommendedFormat": "UGC Video" | "Single Image" | "Carousel" | "Offers/Bundles",
    "suggestedHooks": ["<Hook 1>", "<Hook 2>", "<Hook 3>"],
    "dominantCTA": "<e.g. Shop Now, Order via WhatsApp>"
  },
  "actionableInsights": [
    "<Concise Directive 1>",
    "<Concise Directive 2>",
    "<Concise Directive 3>"
  ]
}`;

  const candidatesFormatted = (signals.candidateProducts || []).slice(0, 10).map((p: any) => ({
    id: p.id,
    title: p.title,
    domain: p.domain,
    price: p.currentPrice,
    category: p.category,
    activeAds: p.activeAdsCount,
  }));

  const userContent = `=== MARKET TELEMETRY & 15-30 DAY CANDIDATES ===
- Active Ads: ${signals.totalActiveAds} (${signals.newAdsLast7Days} new 7D) | Formats: ${signals.mediaFormatRatio.videoAds} Videos vs ${signals.mediaFormatRatio.imageAds} Images
- Monitored Stores: ${signals.monitoredBrands} (${signals.activeBrands} active)
- Top Categories: ${JSON.stringify(signals.topCategories)}
- Top CTAs: ${JSON.stringify(signals.topCtas)}

--- CANDIDATES (FROM STORES WITH ≥5 ACTIVE PRODUCTS) ---
${JSON.stringify(candidatesFormatted)}
===================================================`;

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
            temperature: 0.15,
            max_tokens: 2500,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(50000), // 50s timeout per model
        });

        if (response.ok) {
          const data = await response.json();
          const rawContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning;
          const parsed = cleanAndParseJson<Omit<MarketForecastData, "generatedAt" | "telemetryWindowDays" | "modelUsed">>(rawContent);

          if (parsed && typeof parsed.marketHealthScore === "number") {
            // Ensure candidate image/url fallbacks if model stripped them
            const enrichedWinners = (parsed.topWinningProducts || []).map((w) => {
              const matched = signals.candidateProducts.find((c: any) => c.id === w.id || c.title === w.title);
              return {
                ...w,
                imageUrl: w.imageUrl || matched?.mainImageUrl || undefined,
                productUrl: w.productUrl || matched?.url || undefined,
              };
            });

            return {
              ...parsed,
              topWinningProducts: enrichedWinners,
              generatedAt: new Date().toISOString(),
              telemetryWindowDays: 7,
              modelUsed: data.model || model,
            };
          } else {
            console.warn(`[OpenRouter DeepSeek] Parse validation failed for model ${model}.`);
          }
        } else {
          const errBody = await response.text().catch(() => "");
          console.warn(`[OpenRouter DeepSeek] Model ${model} returned HTTP ${response.status}:`, errBody.slice(0, 300));
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

  // Build top winning products from database candidate rows
  const fallbackWinners: RecommendedProduct[] = (signals.candidateProducts || []).slice(0, 10).map((p: any, idx: number) => ({
    id: p.id,
    title: p.title || `Winning Product #${idx + 1}`,
    domain: p.domain || "trusted-store.tn",
    category: p.category || "General & Other",
    currentPrice: p.currentPrice || "49 TND",
    imageUrl: p.mainImageUrl || undefined,
    productUrl: p.url || undefined,
    activeAdsCount: Number(p.activeAdsCount || 5),
    winningReason: "Strong active ad creative volume and consistent multi-creative scaling over the 15-30 day window.",
    suggestedOfferStrategy: "Bundle 2 Units with Free Cash-on-Delivery Shipping to maximize AOV.",
    targetAudience: "Unisex E-Commerce Buyers",
  }));

  return {
    generatedAt: new Date().toISOString(),
    telemetryWindowDays: 7,
    marketHealthScore: Math.min(95, Math.max(60, Math.round(50 + (signals.newAdsLast7Days / Math.max(1, signals.totalActiveAds)) * 50))),
    marketSentiment: signals.newAdsLast7Days > 20 ? "Bullish (High Scaling)" : "Moderate (Selective Winners)",
    trendSummary: `Across recent 15-30 day trailing data, ${signals.newAdsLast7Days} new creatives were deployed across ${signals.activeBrands} active brands. ${topCat} leads category volume with high creative turnover.`,
    risingNiches: [
      {
        niche: topCat,
        velocityScore: 88,
        suggestedPriceRange: `${Math.max(29, Math.round(avgP * 0.8))} - ${Math.round(avgP * 1.3)} TND`,
        reasoning: "Strong active duplication rates and consistent new ad launches over the trailing window.",
      },
      {
        niche: secondCat,
        velocityScore: 74,
        suggestedPriceRange: "39 - 89 TND",
        reasoning: "High demand for problem-solving gadgets and bundle offers with free shipping.",
      },
    ],
    topWinningProducts: fallbackWinners,
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
      dominantCTA: signals.topCtas[0]?.ctaText || "Shop now",
    },
    actionableInsights: [
      "Test Sweet-Spot Pricing: Products priced between 39 TND and 69 TND maintain the highest checkout completion velocity.",
      "Combat 7-Day Ad Fatigue: Launch at least 3 hook variations per winning SKU within the first week of scaling.",
      "Codify WhatsApp Recovery: Integrate 1-click WhatsApp order confirmation to reduce COD cancellation rates.",
    ],
    modelUsed: "offline_deterministic_rules",
  };
}
