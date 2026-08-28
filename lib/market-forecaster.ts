import { db } from "@/db";
import { ads, scrapedProducts, trackedPages } from "@/db/schema";
import { sql, desc, count, eq } from "drizzle-orm";

export interface WaveDriverAnalysis {
  underlyingPattern: string;
  consumerTriggers: string[];
  averageWinningPriceRange: string;
  velocitySignals: string;
}

export interface MarketOpportunity {
  opportunityName: string;
  targetNiche: string;
  potentialScore: number; // 1 - 100
  marketGap: string;
  entryStrategy: string;
}

export interface UnitEconomicsBlueprint {
  targetCogsMultiplier: string;
  optimalPriceBands: string;
  codDeliveryTactics: string[];
  bundleArchitecture: string;
}

export interface MediaBuyingStrategy {
  recommendedFormat: "UGC Video" | "Single Image" | "Carousel" | "Offers/Bundles";
  testingBudgetSplit: string;
  winningHookScripts: string[];
  dominantCTA: string;
  fatigueDefensePlan: string;
}

export interface ExecutionRoadmap {
  phase1_Day1to3: string;
  phase2_Day4to7: string;
  phase3_Day8to14: string;
}

export interface MarketOpportunityResearch {
  generatedAt: string;
  telemetryWindowDays: number;
  marketHealthScore: number; // 0 - 100
  marketSentiment: "Bullish (High Scaling)" | "Moderate (Selective Winners)" | "Saturated / Cautious";
  executiveSummary: string;
  waveDriversAnalysis: WaveDriverAnalysis;
  unexploitedOpportunities: MarketOpportunity[];
  unitEconomicsBlueprint: UnitEconomicsBlueprint;
  mediaBuyingStrategy: MediaBuyingStrategy;
  executionRoadmap: ExecutionRoadmap;
  modelUsed: string;
}

// Alias for backward compatibility
export type MarketForecastData = MarketOpportunityResearch;

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
        .replace(/,\s*([\]}])/g, "$1") // remove trailing commas before closing brackets
        .replace(/,\s*"[^"]*":?\s*$/, "") // remove trailing incomplete key-value pair
        .replace(/,\s*$/, ""); // remove trailing comma

      // Balance unmatched braces and brackets
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
 * Extracts 7-day telemetry and top 5 winning products from active stores (>=5 SKUs)
 */
export async function extractMarketSignals() {
  const [activeAdsResult] = await db
    .select({ count: count() })
    .from(ads)
    .where(eq(ads.isArchived, false));
  const totalActiveAds = Number(activeAdsResult?.count || 0);

  const [newAds7dResult] = await db
    .select({ count: count() })
    .from(ads)
    .where(
      sql`"first_seen_at" >= NOW() - INTERVAL '7 days' OR "last_seen_at" >= NOW() - INTERVAL '7 days'`
    );
  const newAdsLast7Days = Number(newAds7dResult?.count || 0);

  const [videoAdsResult] = await db
    .select({ count: count() })
    .from(ads)
    .where(sql`"media_type" = 'video' AND "is_archived" = false`);
  const videoCount = Number(videoAdsResult?.count || 0);
  const imageCount = Math.max(0, totalActiveAds - videoCount);

  const topCategoriesRaw = await db
    .select({
      category: scrapedProducts.category,
      count: count(),
    })
    .from(scrapedProducts)
    .where(sql`"category" IS NOT NULL`)
    .groupBy(scrapedProducts.category)
    .orderBy(desc(count()))
    .limit(8);

  const topCtasRaw = await db
    .select({
      ctaText: ads.ctaText,
      count: count(),
    })
    .from(ads)
    .where(sql`"cta_text" IS NOT NULL AND "is_archived" = false`)
    .groupBy(ads.ctaText)
    .orderBy(desc(count()))
    .limit(6);

  const [monitoredBrandsResult] = await db
    .select({ count: count() })
    .from(trackedPages);
  const monitoredBrands = Number(monitoredBrandsResult?.count || 0);

  const activeBrandsRaw = await db
    .select({ distinctPageId: sql`DISTINCT ${ads.pageId}` })
    .from(ads)
    .where(eq(ads.isArchived, false));
  const activeBrands = activeBrandsRaw.length;

  // Query top 5 winning products from active stores (stores with >=5 active products)
  const candidateProductsRaw = await db.execute(sql`
    WITH active_stores AS (
      SELECT domain
      FROM ${scrapedProducts}
      GROUP BY domain
      HAVING COUNT(*) >= 5
    ),
    active_products AS (
      SELECT 
        p.id, 
        p.title, 
        p.domain, 
        p.current_price AS "currentPrice", 
        p.category, 
        p.sub_category AS "subCategory", 
        p.main_image_url AS "mainImageUrl", 
        p.url, 
        p.created_at AS "createdAt"
      FROM ${scrapedProducts} p
      INNER JOIN active_stores s ON p.domain = s.domain
      WHERE p.scrape_status = 'success'
    )
    SELECT 
      p.*,
      COALESCE(ad_counts.cnt, 0) AS "activeAdsCount"
    FROM active_products p
    LEFT JOIN (
      SELECT product_id, COUNT(*) as cnt
      FROM ${ads}
      WHERE is_archived = false AND product_id IS NOT NULL
      GROUP BY product_id
    ) ad_counts ON p.id = ad_counts.product_id
    ORDER BY "activeAdsCount" DESC, p."createdAt" DESC
    LIMIT 5;
  `);

  const top5Winners = (Array.isArray(candidateProductsRaw) ? candidateProductsRaw : (candidateProductsRaw as any).rows || []) as any[];

  return {
    totalActiveAds,
    newAdsLast7Days,
    mediaFormatRatio: {
      videoAds: videoCount,
      imageAds: imageCount,
    },
    topCategories: topCategoriesRaw.map((c) => ({
      category: c.category || "Uncategorized",
      productCount: Number(c.count),
    })),
    topCtas: topCtasRaw.map((cta) => ({
      cta: cta.ctaText || "Unknown",
      usageCount: Number(cta.count),
    })),
    monitoredBrands,
    activeBrands,
    top5Winners,
  };
}

/**
 * Executes Deep-Dive Market Opportunity & Strategy Generation via DeepSeek v4-pro on OpenRouter
 */
export async function generateAiMarketForecast(): Promise<MarketOpportunityResearch> {
  const signals = await extractMarketSignals();
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;

  const top5Formatted = (signals.top5Winners || []).map((p: any, idx: number) => ({
    rank: idx + 1,
    title: p.title,
    domain: p.domain,
    price: p.currentPrice,
    category: p.category,
    activeAdsCount: Number(p.activeAdsCount || 0),
  }));

  const systemPrompt = `You are an elite E-Commerce Market Strategist & Media Buying Director.
Your mission is to perform an in-depth market opportunity research deep dive based on real-time market signals and the TOP 5 WINNING PRODUCTS currently driving the market wave.

Analyze WHY these 5 products are dominating and build an overarching commercial and media buying strategy to catch and ride this market wave.

Return ONLY a valid JSON object matching this exact schema:
{
  "marketHealthScore": <number 0-100>,
  "marketSentiment": "Bullish (High Scaling)" | "Moderate (Selective Winners)" | "Saturated / Cautious",
  "executiveSummary": "<3 comprehensive sentences on macro consumer behavior, pricing momentum, and competition>",
  
  "waveDriversAnalysis": {
    "underlyingPattern": "<What macro consumer behavioral shift unites these 5 winners?>",
    "consumerTriggers": ["<Trigger 1: e.g. Immediate physical relief with low impulse threshold>", "<Trigger 2>", "<Trigger 3>"],
    "averageWinningPriceRange": "<e.g. 25 - 55 TND>",
    "velocitySignals": "<Why these specific problem-solvers are scaling exponentially right now>"
  },

  "unexploitedOpportunities": [
    {
      "opportunityName": "<Opportunity title>",
      "targetNiche": "<Niche>",
      "potentialScore": <number 1-100>,
      "marketGap": "<What competitors are currently missing>",
      "entryStrategy": "<Tactical launch angle to capture this gap immediately>"
    },
    {
      "opportunityName": "<Opportunity title 2>",
      "targetNiche": "<Niche 2>",
      "potentialScore": <number 1-100>,
      "marketGap": "<Market gap 2>",
      "entryStrategy": "<Entry strategy 2>"
    },
    {
      "opportunityName": "<Opportunity title 3>",
      "targetNiche": "<Niche 3>",
      "potentialScore": <number 1-100>,
      "marketGap": "<Market gap 3>",
      "entryStrategy": "<Entry strategy 3>"
    }
  ],

  "unitEconomicsBlueprint": {
    "targetCogsMultiplier": "<e.g. 3.5x - 4.0x retail to landed cost>",
    "optimalPriceBands": "<e.g. 29.9 - 59.9 TND (Sweet spot for COD delivery)>",
    "codDeliveryTactics": [
      "<Tactic 1 to achieve 85%+ COD confirmation & delivery>",
      "<Tactic 2>",
      "<Tactic 3>"
    ],
    "bundleArchitecture": "<Specific bundle and quantity-break advice to maximize AOV>"
  },

  "mediaBuyingStrategy": {
    "recommendedFormat": "UGC Video" | "Single Image" | "Carousel" | "Offers/Bundles",
    "testingBudgetSplit": "<e.g. 65% Broad Testing / 35% Scale Campaigns>",
    "winningHookScripts": [
      "<Hook Script 1>",
      "<Hook Script 2>",
      "<Hook Script 3>"
    ],
    "dominantCTA": "<e.g. Shop now>",
    "fatigueDefensePlan": "<Tactical plan to refresh angles past Day 14>"
  },

  "executionRoadmap": {
    "phase1_Day1to3": "<Day 1-3 Validation & Creative Testing Protocol>",
    "phase2_Day4to7": "<Day 4-7 Offer Optimization & Horizontal Scaling>",
    "phase3_Day8to14": "<Day 8-14 Retargeting, WhatsApp Recovery & Vertical Scale>"
  }
}`;

  const userContent = `=== LIVE MARKET TELEMETRY ===
- Active Ads: ${signals.totalActiveAds} (${signals.newAdsLast7Days} new 7D) | Creative Split: ${signals.mediaFormatRatio.videoAds} Videos vs ${signals.mediaFormatRatio.imageAds} Images
- Active Stores Monitored: ${signals.monitoredBrands} (${signals.activeBrands} actively running ads)
- Top Categories: ${JSON.stringify(signals.topCategories)}
- Top CTAs: ${JSON.stringify(signals.topCtas)}

=== TOP 5 WINNING WAVE DRIVERS (Input for Opportunity & Strategy Formulation) ===
${JSON.stringify(top5Formatted, null, 2)}
===================================================================`;

  // 1. Call DeepSeek via OpenRouter with Model Fallback
  if (openRouterKey && openRouterKey.trim() !== "") {
    for (const model of DEEPSEEK_MODELS) {
      try {
        console.log(`[Forecaster] Requesting ${model} on OpenRouter...`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openRouterKey.trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://meta-ad-tracker.local",
            "X-Title": "DeepSeek Market Opportunity Deep-Dive",
          },
          body: JSON.stringify({
            model,
            temperature: 0.15,
            max_tokens: 2200,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(60000), // 60s timeout for deep analysis
        });

        console.log(`[Forecaster] Model ${model} responded HTTP ${response.status}`);

        if (response.ok) {
          const data = await response.json();
          const rawContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning;
          const parsed = cleanAndParseJson<Omit<MarketOpportunityResearch, "generatedAt" | "telemetryWindowDays" | "modelUsed">>(rawContent);

          if (parsed && typeof parsed.marketHealthScore === "number") {
            return {
              ...parsed,
              generatedAt: new Date().toISOString(),
              telemetryWindowDays: 7,
              modelUsed: model,
            };
          } else {
            console.warn(`[OpenRouter DeepSeek] Parse validation failed for model ${model}.`);
          }
        } else {
          const errBody = await response.text();
          console.warn(`[OpenRouter DeepSeek] Model ${model} returned HTTP ${response.status}: ${errBody}`);
        }
      } catch (modelErr: any) {
        console.warn(`[OpenRouter DeepSeek Warning] Model ${model} encountered an issue: ${modelErr?.message || modelErr}`);
      }
    }
  }

  // 2. Deterministic Rule-Based Fallback Engine
  return buildDeterministicFallback(signals);
}

/**
 * Deterministic heuristic fallback matching the new deep-dive strategy schema
 */
function buildDeterministicFallback(signals: any): MarketOpportunityResearch {
  const isVideoDominant = signals.mediaFormatRatio.videoAds >= signals.mediaFormatRatio.imageAds;
  const healthScore = Math.min(
    95,
    Math.max(45, Math.round(50 + (signals.newAdsLast7Days / Math.max(1, signals.totalActiveAds)) * 50))
  );

  return {
    generatedAt: new Date().toISOString(),
    telemetryWindowDays: 7,
    marketHealthScore: healthScore,
    marketSentiment: healthScore >= 70 ? "Bullish (High Scaling)" : "Moderate (Selective Winners)",
    executiveSummary: `The market displays solid momentum with ${signals.totalActiveAds} active creatives across ${signals.activeBrands} active stores. Video ads account for ${Math.round((signals.mediaFormatRatio.videoAds / Math.max(1, signals.totalActiveAds)) * 100)}% of placements, signaling intense competition around high-engagement visual hooks and problem-solving products.`,
    waveDriversAnalysis: {
      underlyingPattern: "Consumers gravitate towards immediately demonstrable problem-solvers in health, home convenience, and fitness with fast cash-on-delivery turnaround.",
      consumerTriggers: [
        "Instant relief from physical discomfort at a low-barrier price point",
        "Home and personal convenience that eliminates daily friction",
        "High perceived bundle value with zero upfront risk (COD)",
      ],
      averageWinningPriceRange: "29.9 - 59.9 TND",
      velocitySignals: "Products with short before-and-after demo videos and straightforward pricing are monopolizing ad shelf space.",
    },
    unexploitedOpportunities: [
      {
        opportunityName: "Orthopedic Ergonomic Support Line",
        targetNiche: "Office workers and drivers (25-55)",
        potentialScore: 88,
        marketGap: "Existing competitors run generic image ads without focusing on long-shift relief or posture before/after proof.",
        entryStrategy: "Deploy 15s UGC video showing desk fatigue contrast, priced at 39.9 DT with free shipping bonus.",
      },
      {
        opportunityName: "Smart Kitchen & Drainage Maintenance",
        targetNiche: "Homeowners & homemakers",
        potentialScore: 82,
        marketGap: "Low ad creative diversity; competitors fail to show multi-room versatility.",
        entryStrategy: "Create relatable sink splash and odor prevention scenarios; bundle 3-pack for 49.9 DT.",
      },
      {
        opportunityName: "Compact Resistance & Mobility Kits",
        targetNiche: "Busy professionals & home fitness beginners",
        potentialScore: 78,
        marketGap: "High-ticket machines create price resistance; lack of lightweight guided workout bundles.",
        entryStrategy: "Package portability and 10-min workout angle at 55 DT with quick-start PDF guide.",
      },
    ],
    unitEconomicsBlueprint: {
      targetCogsMultiplier: "3.5x - 4.2x landed cost vs retail",
      optimalPriceBands: "29.9 - 59.9 TND (Sweet spot for high-conversion COD delivery)",
      codDeliveryTactics: [
        "Automated WhatsApp confirmation message within 5 minutes of checkout",
        "SMS reminder 1 hour before dispatch with driver contact",
        "Pack bundle discounts directly on COD confirmation calls",
      ],
      bundleArchitecture: "Offer 2-for-1 quantity breaks or tiered complementary accessories (+15 TND add-on) to boost AOV.",
    },
    mediaBuyingStrategy: {
      recommendedFormat: isVideoDominant ? "UGC Video" : "Single Image",
      testingBudgetSplit: "65% Broad Testing / 35% Scale Duplications",
      winningHookScripts: [
        "'If you suffer from [problem], stop scrolling — this 10-second fix changes everything.'",
        "'Why are thousands in Tunisia switching to this instead of expensive alternatives?'",
        "'Watch what happens when you use this for just 3 days...'",
      ],
      dominantCTA: "Shop Now",
      fatigueDefensePlan: "Rotate fresh opening 3-second visual hooks weekly while preserving the high-performing body copy.",
    },
    executionRoadmap: {
      phase1_Day1to3: "Launch 4-5 UGC angle variants broad targeting (CBO). Kill ad sets with CTR < 1.8% by Day 3.",
      phase2_Day4to7: "Duplicate top 2 winning creatives into dedicated scaling CBOs. Implement WhatsApp cart recovery.",
      phase3_Day8to14: "Deploy retargeting (video 50%+ viewers) with exclusive 2-pack bundle offer; refresh top hook angles.",
    },
    modelUsed: "offline_deterministic_rules",
  };
}
