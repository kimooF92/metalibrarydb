import { db } from "@/db";
import { ads, scrapedProducts, trackedPages, adObservations } from "@/db/schema";
import { sql, desc, count, eq, gte, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// TYPES & INTERFACES
// ---------------------------------------------------------------------------

export interface TunisianSeasonalityContext {
  currentDate: string; // ISO date
  currentMonthName: string;
  activeSeasonalWindow: string; // e.g. "Late Summer Transition & Back-to-School Ramp"
  upcomingKeyEvents: {
    eventName: string;
    targetDate: string;
    daysRemaining: number;
    impactLevel: "Critical" | "High" | "Moderate";
    relevantCategories: string[];
    buyingBehaviorNote: string;
  }[];
  regionalDemographics: {
    regionName: string;
    governorates: string[];
    purchasingPower: "High" | "Upper-Mid" | "Moderate" | "COD-Sensitive";
    deliverySpeed: string;
    preferredCategories: string[];
    consumerAngleNote: string;
  }[];
  codEconomics: {
    avgConfirmationRate: string; // e.g. "75-85%"
    avgDeliverySuccessRate: string; // e.g. "70-80%"
    sweetSpotPriceBands: {
      band: string;
      label: string;
      conversionFriction: "Very Low" | "Low" | "Medium" | "High (Requires Call/Trust)";
    }[];
  };
}

export interface MarketOpportunityTelemetry {
  totalActiveAds: number;
  newAdsLast7Days: number;
  videoPercent: number;
  imagePercent: number;
  monitoredBrands: number;
  scalingBrandsCount: number;
  totalAdsScaled: number;
  descalingBrandsCount: number;
  totalAdsDescaled: number;
  netAdDelta: number;
  categoryBreakdown: {
    category: string;
    productCount: number;
    storeCount: number;
    avgPriceTND: number;
    minPriceTND: number;
    maxPriceTND: number;
    activeAdsCount: number;
    newAds7dCount: number;
  }[];
  topClonedProducts: {
    title: string;
    storeCount: number;
    category: string;
    avgPriceTND: number;
  }[];
  copyPsychology: {
    arabicScriptPercent: number;
    frenchPercent: number;
    discountTriggerPercent: number;
    freeDeliveryTriggerPercent: number;
  };
}

// Stage 1 Output Schema
export interface NicheOpportunityScorecard {
  niche: string;
  opportunityScore: number; // 0 - 100
  competitionLevel: "Blue Ocean (Low)" | "Moderate Growth" | "Red Ocean (Saturated)";
  scalabilityPotential: "High" | "Moderate" | "Selective";
  saturationIndex: number; // 0 (fresh) - 100 (heavily cloned)
  sweetSpotPriceTND: string;
  velocitySignal: string; // 1 concise sentence
  whyNowRationale: string;
}

export interface Stage1NicheAnalysis {
  marketOpportunityIndex: number; // 0 - 100
  rankedNiches: NicheOpportunityScorecard[];
  redFlagNiches: {
    niche: string;
    riskReason: string;
    descalingRateNote: string;
  }[];
}

// Stage 2 Output Schema
export interface Stage2SeasonalityAnalysis {
  currentSeasonalPhase: string;
  seasonalUrgency: "Immediate (Peak Wave)" | "Ramping Up (Start Sourcing)" | "Transition Window";
  seasonalRoadmap: {
    activeWaveThisWeek: string;
    next30DaysWave: string;
    next60DaysWave: string;
  };
  regionalDemandStrategy: {
    region: string;
    targetGovernorates: string;
    hotCategories: string[];
    actionableDirective: string;
  }[];
}

// Stage 3 Output Schema (Product Blueprints)
export interface HighConvictionProductOpportunity {
  id: string;
  productName: string;
  niche: string;
  targetAudience: string;
  targetRegions: string;
  recommendedPriceTND: number;
  estimatedMarginTND: number;
  whyItWinsNow: string;
  timingRationale: string;
  saturationStatus: "Unsaturated / Blue Ocean" | "Moderate Competition" | "Rising Trend";
  creativeBlueprint: {
    format: "Video (Hook-First)" | "Carousel (Benefit Story)" | "High-Impact Image";
    hookDarijaFrench: string; // Bilingual high-converting copy
    visualHook3s: string; // First 3 seconds visual action
    ctaAndOffer: string; // e.g. "Achetez 1, le 2ème à -50% + Livraison Gratuite"
  };
  sourcingTip: string; // AliExpress, 1688, or local Moncef Bey / Sfax wholesale
}

export interface Stage3ProductBlueprints {
  highConvictionProducts: HighConvictionProductOpportunity[];
  winningAngleDirectives: string[];
}

// Unified Aggregated Report
export interface UnifiedOpportunityReport {
  generatedAt: string;
  modelUsed: string;
  marketOpportunityIndex: number;
  seasonality: Stage2SeasonalityAnalysis;
  nicheAnalysis: Stage1NicheAnalysis;
  productBlueprints: Stage3ProductBlueprints;
  telemetrySnapshot: MarketOpportunityTelemetry;
  seasonalityContext: TunisianSeasonalityContext;
}

// ---------------------------------------------------------------------------
// TUNISIAN SEASONALITY & CALENDAR CALCULATOR
// ---------------------------------------------------------------------------

export function calculateTunisianSeasonalityContext(referenceDate: Date = new Date()): TunisianSeasonalityContext {
  const month = referenceDate.getMonth(); // 0-indexed (0 = Jan, 7 = Aug)
  const day = referenceDate.getDate();
  const year = referenceDate.getFullYear();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonthName = monthNames[month];

  // Dynamic Seasonal Window Calculation for Tunisia
  let activeSeasonalWindow = "Standard E-Commerce Trading";
  if (month === 7 && day >= 15) {
    activeSeasonalWindow = "Back-to-School (Rentrée Scolaire) Surge & Late Summer Clearance";
  } else if (month === 8) {
    activeSeasonalWindow = "Peak Back-to-School (Rentrée Scolaire) & Early Autumn Transition";
  } else if (month === 9) {
    activeSeasonalWindow = "Autumn Home & Wardrobe Transition";
  } else if (month === 10) {
    activeSeasonalWindow = "Black Friday / White Friday (Vendredi Blanc) & Cyber Month Preparation";
  } else if (month === 11) {
    activeSeasonalWindow = "Winter Warming & End of Year Gift Season";
  } else if (month === 0) {
    activeSeasonalWindow = "Winter Fitness, New Year Self-Improvement & Winter Sales (Soldes d'Hiver)";
  } else if (month >= 1 && month <= 3) {
    activeSeasonalWindow = "Spring Renewal & Ramadan Preparation Season";
  } else if (month >= 4 && month <= 6) {
    activeSeasonalWindow = "Summer Launch, Beach/Vacation & Wedding Season (Saison des Mariages)";
  } else if (month === 7 && day < 15) {
    activeSeasonalWindow = "Mid-Summer Peak & Outdoor Living";
  }

  // Key Tunisian Events Calendar (Fixed & Estimated Islamic milestones)
  const events = [
    {
      eventName: "Rentrée Scolaire (Back-to-School)",
      month: 8, // September
      day: 15,
      impactLevel: "Critical" as const,
      relevantCategories: ["Kids, Baby & Toys", "Electronics & Tech", "Fashion & Jewelry"],
      buyingBehaviorNote: "High impulse buying for backpacks, posture correctors, study lights, kids educational tablets, and stationery accessories.",
    },
    {
      eventName: "Vendredi Blanc / Black Friday Tunisia",
      month: 10, // November
      day: 27,
      impactLevel: "Critical" as const,
      relevantCategories: ["Electronics & Tech", "Beauty, Health & Care", "Home, Kitchen & Living", "Fashion & Jewelry"],
      buyingBehaviorNote: "Highest annual conversion volume. Bundles, 2+1 Free offers, and flash discount angles dominate.",
    },
    {
      eventName: "Winter Season & Cold Weather Shift",
      month: 11, // December
      day: 1,
      impactLevel: "High" as const,
      relevantCategories: ["Home, Kitchen & Living", "Fashion & Jewelry", "Automotive & Tools"],
      buyingBehaviorNote: "Space heaters, thermal clothing, dehumidifiers, hot beverage makers, and car windshield care.",
    },
    {
      eventName: "Soldes d'Hiver (Winter Official Sales)",
      month: 1, // February
      day: 1,
      impactLevel: "High" as const,
      relevantCategories: ["Fashion & Jewelry", "Beauty, Health & Care"],
      buyingBehaviorNote: "Discount-sensitive buyers actively seeking 30-70% off clearance hooks.",
    },
    {
      eventName: "Ramadan & Eid al-Fitr Season",
      month: 2, // March approx (varies by year)
      day: 1,
      impactLevel: "Critical" as const,
      relevantCategories: ["Home, Kitchen & Living", "Fashion & Jewelry", "Beauty, Health & Care", "Kids, Baby & Toys"],
      buyingBehaviorNote: "Massive spike in kitchen appliances (air fryers, choppers, chourba bowls), modest luxury fashion (Jebba/Abaya), perfumes, and Eid gifts for children.",
    },
    {
      eventName: "Saison des Mariages (Wedding Season & Wtayya)",
      month: 5, // June
      day: 15,
      impactLevel: "Critical" as const,
      relevantCategories: ["Beauty, Health & Care", "Fashion & Jewelry", "Home, Kitchen & Living"],
      buyingBehaviorNote: "High-ticket hair styling tools, skincare sets, gold-plated jewelry, evening dresses, and trousseau home appliances.",
    },
    {
      eventName: "Summer Beach & Outdoor Heatwave",
      month: 6, // July
      day: 1,
      impactLevel: "High" as const,
      relevantCategories: ["Sports, Fitness & Outdoor", "Beauty, Health & Care", "Electronics & Tech"],
      buyingBehaviorNote: "Portable mini fans, sunscreens/skincare, coolers, waterproof accessories, and camping gadgets.",
    },
  ];

  const upcomingKeyEvents = events.map((evt) => {
    let targetYear = year;
    let target = new Date(targetYear, evt.month, evt.day);
    if (target.getTime() < referenceDate.getTime()) {
      target = new Date(targetYear + 1, evt.month, evt.day);
    }
    const diffDays = Math.max(0, Math.ceil((target.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      eventName: evt.eventName,
      targetDate: target.toISOString().split("T")[0],
      daysRemaining: diffDays,
      impactLevel: evt.impactLevel,
      relevantCategories: evt.relevantCategories,
      buyingBehaviorNote: evt.buyingBehaviorNote,
    };
  }).sort((a, b) => a.daysRemaining - b.daysRemaining);

  // Regional Demographics & Purchasing Power
  const regionalDemographics = [
    {
      regionName: "Grand Tunis",
      governorates: ["Tunis", "Ariana", "Ben Arous", "Manouba"],
      purchasingPower: "High" as const,
      deliverySpeed: "Same-Day / 24h Express Available",
      preferredCategories: ["Electronics & Tech", "Beauty, Health & Care", "Trendy Fashion"],
      consumerAngleNote: "High average basket (60-150 TND). Responsive to trendy TikTok-style video hooks, premium aesthetics, and fast 24h delivery.",
    },
    {
      regionName: "Sahel Coastal Strip",
      governorates: ["Sousse", "Monastir", "Mahdia"],
      purchasingPower: "High" as const,
      deliverySpeed: "24-48h Delivery",
      preferredCategories: ["Fashion & Jewelry", "Beauty, Health & Care", "Home Appliances"],
      consumerAngleNote: "Strong fashion and beauty market. High responsiveness to wedding season, personal grooming, and lifestyle accessories.",
    },
    {
      regionName: "Cap Bon & North East",
      governorates: ["Nabeul", "Hammamet", "Bizerte", "Zaghouan"],
      purchasingPower: "Upper-Mid" as const,
      deliverySpeed: "24-48h Delivery",
      preferredCategories: ["Home & Kitchen", "Outdoor & Fitness", "Automotive"],
      consumerAngleNote: "Balanced family spending. Strong appetite for practical kitchen gadgets, home organization, and car accessories.",
    },
    {
      regionName: "Sfax & Center-South Hub",
      governorates: ["Sfax"],
      purchasingPower: "High" as const,
      deliverySpeed: "24-48h Delivery",
      preferredCategories: ["Tools & Hardware", "Electronics & Tech", "Home & Kitchen"],
      consumerAngleNote: "Pragmatic, value-driven consumers. High demand for durable tools, DIY hardware, and cost-effective multi-item bundles.",
    },
    {
      regionName: "Interior & South Governorates",
      governorates: ["Kairouan", "Gafsa", "Gabès", "Medenine", "Sidi Bouzid", "Kasserine", "Tozeur", "Kebili", "Tataouine", "Beja", "Jendouba", "Siliana", "Kef"],
      purchasingPower: "COD-Sensitive" as const,
      deliverySpeed: "48-72h Delivery (Aramex / Yalidine / First Delivery)",
      preferredCategories: ["Automotive & Tools", "Practical Household Goods", "Solar & Rechargeable Gadgets"],
      consumerAngleNote: "High COD reliability sensitivity. Prefer under 60 TND sweet-spot prices, durable goods, clear French/Darija phone confirmation, and free delivery guarantees.",
    },
  ];

  return {
    currentDate: referenceDate.toISOString(),
    currentMonthName,
    activeSeasonalWindow,
    upcomingKeyEvents: upcomingKeyEvents.slice(0, 4),
    regionalDemographics,
    codEconomics: {
      avgConfirmationRate: "78% - 86%",
      avgDeliverySuccessRate: "72% - 82%",
      sweetSpotPriceBands: [
        { band: "Under 30 TND", label: "Micro Impulse", conversionFriction: "Very Low" },
        { band: "35 - 59 TND", label: "National Sweet Spot (Highest Volume)", conversionFriction: "Low" },
        { band: "60 - 99 TND", label: "Mid-Ticket (Quality & Bundles)", conversionFriction: "Medium" },
        { band: "100+ TND", label: "High-Ticket (Requires Call Confirmation & Trust)", conversionFriction: "High (Requires Call/Trust)" },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// DATA EXTRACTION & LIVE TELEMETRY
// ---------------------------------------------------------------------------

export async function extractMarketOpportunityTelemetry(): Promise<MarketOpportunityTelemetry> {
  const priceExpr = sql`COALESCE(NULLIF(SUBSTRING(REPLACE(${scrapedProducts.currentPrice}, ',', '.') FROM '([0-9]+(?:\\.[0-9]+)?)'), '')::numeric, 0)`;

  // 1. Total Active Ads
  const [activeAdsResult] = await db
    .select({ count: count() })
    .from(ads)
    .where(eq(ads.isArchived, false));
  const totalActiveAds = Number(activeAdsResult?.count || 0);

  // 2. New ads last 7 days
  const [newAds7dResult] = await db
    .select({ count: count() })
    .from(ads)
    .where(
      sql`"first_seen_at" >= NOW() - INTERVAL '7 days' OR "last_seen_at" >= NOW() - INTERVAL '7 days'`
    );
  const newAdsLast7Days = Number(newAds7dResult?.count || 0);

  // 3. Format split
  const [videoAdsResult] = await db
    .select({ count: count() })
    .from(ads)
    .where(sql`"media_type" = 'video' AND "is_archived" = false`);
  const videoCount = Number(videoAdsResult?.count || 0);
  const videoPercent = totalActiveAds > 0 ? Math.round((videoCount / totalActiveAds) * 100) : 62;
  const imagePercent = Math.max(0, 100 - videoPercent);

  // 4. Scaling / Descaling Brands Count
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
      COUNT(CASE WHEN difference > 0 THEN 1 END) AS "scalingBrandsCount",
      COALESCE(SUM(CASE WHEN difference > 0 THEN difference ELSE 0 END), 0) AS "totalAdsScaled",
      COUNT(CASE WHEN difference < 0 THEN 1 END) AS "descalingBrandsCount",
      COALESCE(SUM(CASE WHEN difference < 0 THEN ABS(difference) ELSE 0 END), 0) AS "totalAdsDescaled"
    FROM latest_scans;
  `);

  const scalingStats = ((Array.isArray(scalingStatsRaw) ? scalingStatsRaw : (scalingStatsRaw as any).rows || [])[0] || {}) as any;
  const scalingBrandsCount = Number(scalingStats.scalingBrandsCount || 0);
  const totalAdsScaled = Number(scalingStats.totalAdsScaled || 0);
  const descalingBrandsCount = Number(scalingStats.descalingBrandsCount || 0);
  const totalAdsDescaled = Number(scalingStats.totalAdsDescaled || 0);
  const netAdDelta = totalAdsScaled - totalAdsDescaled;

  // 5. Total Monitored Brands
  const [monitoredBrandsResult] = await db.select({ count: count() }).from(trackedPages);
  const monitoredBrands = Number(monitoredBrandsResult?.count || 0);

  // 6. Category Breakdown with Pricing and Active Ad Counts
  const categoryRows = await db
    .select({
      category: sql<string>`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`,
      productCount: count(),
      storeCount: sql<number>`COUNT(DISTINCT ${scrapedProducts.domain})`.mapWith(Number),
      avgPrice: sql<number>`ROUND(AVG(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END), 1)`.mapWith(Number),
      minPrice: sql<number>`MIN(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
      maxPrice: sql<number>`MAX(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END)`.mapWith(Number),
      activeAdsCount: sql<number>`COUNT(CASE WHEN ${ads.isArchived} = false THEN ${ads.id} END)`.mapWith(Number),
      newAds7dCount: sql<number>`COUNT(CASE WHEN ${ads.firstSeenAt} >= NOW() - INTERVAL '7 days' THEN ${ads.id} END)`.mapWith(Number),
    })
    .from(scrapedProducts)
    .leftJoin(ads, eq(scrapedProducts.id, ads.productId))
    .groupBy(sql`COALESCE(NULLIF(${scrapedProducts.category}, ''), 'General & Other')`)
    .orderBy(desc(count()));

  // 7. Top Cloned / Saturated Products (Clones across multiple distinct domains)
  const cloneRows = await db
    .select({
      title: scrapedProducts.title,
      storeCount: sql<number>`COUNT(DISTINCT ${scrapedProducts.domain})`.mapWith(Number),
      category: sql<string>`MAX(${scrapedProducts.category})`,
      avgPrice: sql<number>`ROUND(AVG(CASE WHEN ${priceExpr} > 0 THEN ${priceExpr} END), 1)`.mapWith(Number),
    })
    .from(scrapedProducts)
    .where(sql`${scrapedProducts.title} IS NOT NULL AND length(${scrapedProducts.title}) > 5`)
    .groupBy(scrapedProducts.title)
    .having(sql`COUNT(DISTINCT ${scrapedProducts.domain}) > 1`)
    .orderBy(desc(sql`COUNT(DISTINCT ${scrapedProducts.domain})`))
    .limit(8);

  // 8. Copy Psychology Metrics
  const [copyTriggers] = await db
    .select({
      hasArabic: sql<number>`COUNT(CASE WHEN ${ads.caption} ~* '[\u0600-\u06FF]' THEN 1 END)`.mapWith(Number),
      hasFrench: sql<number>`COUNT(CASE WHEN ${ads.caption} ~* '(livraison|commande|prix|qualité|gratuit|boutique)' THEN 1 END)`.mapWith(Number),
      hasDiscount: sql<number>`COUNT(CASE WHEN ${ads.caption} ~* '(%|remise|تخفيض|solde|promo|خصم)' THEN 1 END)`.mapWith(Number),
      hasFreeDeliv: sql<number>`COUNT(CASE WHEN ${ads.caption} ~* '(gratuit|livraison gratuite|مجانا|توصيل مجاني)' THEN 1 END)`.mapWith(Number),
      totalCount: count(),
    })
    .from(ads);

  const totalCopy = Math.max(1, Number(copyTriggers?.totalCount || 1));
  const arabicPercent = Math.round((Number(copyTriggers?.hasArabic || 0) / totalCopy) * 100);
  const frenchPercent = Math.round((Number(copyTriggers?.hasFrench || 0) / totalCopy) * 100);
  const discountPercent = Math.round((Number(copyTriggers?.hasDiscount || 0) / totalCopy) * 100);
  const freeDelivPercent = Math.round((Number(copyTriggers?.hasFreeDeliv || 0) / totalCopy) * 100);

  return {
    totalActiveAds,
    newAdsLast7Days,
    videoPercent,
    imagePercent,
    monitoredBrands,
    scalingBrandsCount,
    totalAdsScaled,
    descalingBrandsCount,
    totalAdsDescaled,
    netAdDelta,
    categoryBreakdown: categoryRows.map((c) => ({
      category: c.category || "General & Other",
      productCount: Number(c.productCount || 0),
      storeCount: Number(c.storeCount || 1),
      avgPriceTND: Number(c.avgPrice || 49),
      minPriceTND: Number(c.minPrice || 19),
      maxPriceTND: Number(c.maxPrice || 149),
      activeAdsCount: Number(c.activeAdsCount || 0),
      newAds7dCount: Number(c.newAds7dCount || 0),
    })),
    topClonedProducts: cloneRows.map((r) => ({
      title: r.title || "Unknown Product",
      storeCount: Number(r.storeCount || 1),
      category: r.category || "General & Other",
      avgPriceTND: Number(r.avgPrice || 49),
    })),
    copyPsychology: {
      arabicScriptPercent: arabicPercent,
      frenchPercent,
      discountTriggerPercent: discountPercent,
      freeDeliveryTriggerPercent: freeDelivPercent,
    },
  };
}

// ---------------------------------------------------------------------------
// JSON CLEANER & PARSER HELPER
// ---------------------------------------------------------------------------

function cleanAndParseJson<T>(rawText: string): T | null {
  if (!rawText) return null;
  try {
    let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

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

    try {
      return JSON.parse(cleaned) as T;
    } catch {
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
    console.warn("[Opportunity Seeker JSON Parse Error]:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// MULTI-PROVIDER HIGH-SPEED AI PIPELINE (OpenRouter / Gemini / Groq / OpenAI)
// ---------------------------------------------------------------------------

const FAST_AI_MODELS = [
  "google/gemini-2.5-flash",
  "deepseek/deepseek-chat",
  "meta-llama/llama-3.3-70b-instruct",
];

async function callAiWithFallback<T>(
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number = 2200
): Promise<{ data: T | null; modelUsed: string }> {
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  // 1. Primary: OpenRouter Fast Cascade (Gemini Flash + DeepSeek + Llama 3.3)
  if (openRouterKey && openRouterKey.trim() !== "") {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterKey.trim()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://meta-ad-tracker.local",
          "X-Title": "Tunisian Meta Opportunity Seeker",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          models: FAST_AI_MODELS.slice(0, 3),
          temperature: 0.2,
          max_tokens: maxOutputTokens,
          reasoning: { max_tokens: 0 },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(18000),
      });

      if (response.ok) {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content || json.choices?.[0]?.message?.reasoning;
        const parsed = cleanAndParseJson<T>(content);
        if (parsed) {
          return { data: parsed, modelUsed: json.model || "openrouter/cascade" };
        }
      }
    } catch (err: any) {
      console.warn("[OpenRouter AI Cascade Notice]:", err?.message || err);
    }
  }

  // 2. Direct Google Gemini API Fallback
  if (geminiKey && geminiKey.trim() !== "") {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `${systemPrompt}\n\nUSER INPUT:\n${userPrompt}` }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
              maxOutputTokens: maxOutputTokens,
            },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = cleanAndParseJson<T>(rawText);
        if (parsed) {
          return { data: parsed, modelUsed: "google/gemini-2.0-flash" };
        }
      }
    } catch (geminiErr: any) {
      console.warn("[Gemini Direct Notice]:", geminiErr?.message || geminiErr);
    }
  }

  // 3. Direct Groq API Fallback
  if (groqKey && groqKey.trim() !== "") {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.2,
          max_tokens: maxOutputTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        const parsed = cleanAndParseJson<T>(rawContent);
        if (parsed) {
          return { data: parsed, modelUsed: "groq/llama-3.3-70b" };
        }
      }
    } catch (groqErr: any) {
      console.warn("[Groq Direct Notice]:", groqErr?.message || groqErr);
    }
  }

  // 4. Direct OpenAI Fallback
  if (openAiKey && openAiKey.trim() !== "") {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: maxOutputTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        const parsed = cleanAndParseJson<T>(rawContent);
        if (parsed) {
          return { data: parsed, modelUsed: "openai/gpt-4o-mini" };
        }
      }
    } catch (openAiErr: any) {
      console.warn("[OpenAI Direct Notice]:", openAiErr?.message || openAiErr);
    }
  }

  return { data: null, modelUsed: "offline_fallback" };
}

// ---------------------------------------------------------------------------
// MODULAR MULTI-PROMPT PIPELINE
// ---------------------------------------------------------------------------

/**
 * Stage 1: Market Velocity & Niche Saturation Specialist Prompt
 */
async function runStage1NicheAnalysis(
  telemetry: MarketOpportunityTelemetry
): Promise<{ result: Stage1NicheAnalysis; modelUsed: string }> {
  const systemPrompt = `You are a Senior Tunisian E-Commerce & Meta Media Buying Intelligence Specialist.
Analyze category velocity, scaling vs descaling brand signals, and clone saturation from the live telemetry.
Evaluate which niches offer high-margin Blue Ocean opportunities vs Red Ocean saturated traps.

Return ONLY a valid JSON object matching this schema:
{
  "marketOpportunityIndex": <number 0-100 overall opportunity score>,
  "rankedNiches": [
    {
      "niche": "<Niche name from categories>",
      "opportunityScore": <number 0-100>,
      "competitionLevel": "Blue Ocean (Low)" | "Moderate Growth" | "Red Ocean (Saturated)",
      "scalabilityPotential": "High" | "Moderate" | "Selective",
      "saturationIndex": <number 0-100 where 100 is highly saturated with clones>,
      "sweetSpotPriceTND": "<e.g. 39 - 69 TND>",
      "velocitySignal": "<1 concise sentence summarizing live ad velocity & brand counts>",
      "whyNowRationale": "<1 concise sentence on why this niche has momentum right now>"
    }
  ],
  "redFlagNiches": [
    {
      "niche": "<Niche name>",
      "riskReason": "<Why media buyers should avoid or tread carefully>",
      "descalingRateNote": "<Note on ad fatigue, copycat clones, or high return rate risks>"
    }
  ]
}`;

  const topCatsCompact = telemetry.categoryBreakdown.slice(0, 7).map((c) => ({
    category: c.category,
    products: c.productCount,
    stores: c.storeCount,
    avgPriceTND: Math.round(c.avgPriceTND),
    activeAds: c.activeAdsCount,
    new7d: c.newAds7dCount,
  }));

  const userContent = `LIVE TUNISIAN MARKET TELEMETRY:
- Active Ads: ${telemetry.totalActiveAds} (${telemetry.newAdsLast7Days} new in 7d)
- Scaling Brands: ${telemetry.scalingBrandsCount} (+${telemetry.totalAdsScaled} ads)
- Descaling Brands: ${telemetry.descalingBrandsCount} (-${telemetry.totalAdsDescaled} ads)
- Video Ad Dominance: ${telemetry.videoPercent}% video vs ${telemetry.imagePercent}% image
- Category Breakdown:
${JSON.stringify(topCatsCompact, null, 2)}
- Top Cloned Multi-Store Products:
${JSON.stringify(telemetry.topClonedProducts.slice(0, 5), null, 2)}`;

  const { data, modelUsed } = await callAiWithFallback<Stage1NicheAnalysis>(
    systemPrompt,
    userContent,
    1800
  );

  if (data && Array.isArray(data.rankedNiches) && data.rankedNiches.length > 0) {
    return { result: data, modelUsed };
  }

  // Deterministic Fallback for Stage 1
  return {
    result: buildDeterministicStage1(telemetry),
    modelUsed: "offline_rules",
  };
}

/**
 * Stage 2: Tunisian Seasonality, Cultural Calendar & Regional Specialist Prompt
 */
async function runStage2SeasonalityAnalysis(
  seasonalityCtx: TunisianSeasonalityContext,
  telemetry: MarketOpportunityTelemetry
): Promise<{ result: Stage2SeasonalityAnalysis; modelUsed: string }> {
  const systemPrompt = `You are a Tunisian Consumer Behavior & Seasonality Strategist.
Analyze the current calendar date, upcoming Tunisian holidays/events, and regional purchasing power across Tunisian governorates.
Map out actionable macro waves and geographic directives for COD media buying.

Return ONLY a valid JSON object matching this schema:
{
  "currentSeasonalPhase": "<Concise descriptive title of active wave>",
  "seasonalUrgency": "Immediate (Peak Wave)" | "Ramping Up (Start Sourcing)" | "Transition Window",
  "seasonalRoadmap": {
    "activeWaveThisWeek": "<What products to sell and scale immediately this week>",
    "next30DaysWave": "<What product inventory to source and prepare for the next 30 days>",
    "next60DaysWave": "<Macro seasonal shift coming in 60 days>"
  },
  "regionalDemandStrategy": [
    {
      "region": "Grand Tunis" | "Sahel Coastal Strip" | "Cap Bon & North East" | "Sfax & Center-South Hub" | "Interior & South Governorates",
      "targetGovernorates": "<List of governorates>",
      "hotCategories": ["<Category 1>", "<Category 2>"],
      "actionableDirective": "<Specific tip on pricing, delivery speed, and angle tailored to this region>"
    }
  ]
}`;

  const userContent = `CURRENT DATE & SEASONAL CONTEXT IN TUNISIA:
- Current Date: ${seasonalityCtx.currentDate.split("T")[0]} (${seasonalityCtx.currentMonthName})
- Active Seasonal Window: ${seasonalityCtx.activeSeasonalWindow}
- Upcoming Key Events & Holidays:
${JSON.stringify(seasonalityCtx.upcomingKeyEvents, null, 2)}
- COD Economics: Confirmation ${seasonalityCtx.codEconomics.avgConfirmationRate}, Delivery ${seasonalityCtx.codEconomics.avgDeliverySuccessRate}`;

  const { data, modelUsed } = await callAiWithFallback<Stage2SeasonalityAnalysis>(
    systemPrompt,
    userContent,
    1600
  );

  if (data && data.currentSeasonalPhase && data.seasonalRoadmap) {
    return { result: data, modelUsed };
  }

  // Deterministic Fallback for Stage 2
  return {
    result: buildDeterministicStage2(seasonalityCtx),
    modelUsed: "offline_rules",
  };
}

/**
 * Stage 3: High-Conviction Product Blueprint & Creative Hook Generator
 */
async function runStage3ProductBlueprints(
  stage1: Stage1NicheAnalysis,
  stage2: Stage2SeasonalityAnalysis,
  seasonalityCtx: TunisianSeasonalityContext,
  telemetry: MarketOpportunityTelemetry
): Promise<{ result: Stage3ProductBlueprints; modelUsed: string }> {
  const systemPrompt = `You are an Elite Meta Direct-Response Creative Director & Sourcing Consultant for Tunisia.
Generate 4 to 5 HIGH-CONVICTION product testing blueprints to launch and test RIGHT NOW in the Tunisian market.

Rules:
- Realistic Tunisian Dinar pricing (e.g. 39 DT, 49 DT, 59 DT, 69 DT, 79 DT, 99 DT).
- Hooks MUST be bilingual Tunisian Darija (Arabic script or Franco-Arabe) & French (the real language used in high-converting Tunisian Meta ads).
- Format recommendation (Video hook-first vs Carousel).
- 3-second visual hook (what the user actually sees on screen).
- Clear, practical sourcing advice (AliExpress, 1688, or local wholesale Moncef Bey / Souk Libya / Sfax).

Return ONLY a valid JSON object matching this schema:
{
  "highConvictionProducts": [
    {
      "id": "prod_1",
      "productName": "<Clear descriptive product concept>",
      "niche": "<Niche name>",
      "targetAudience": "<Demographics, e.g. Women 22-45 / Men 25-50 / Parents>",
      "targetRegions": "<e.g. Grand Tunis & Sahel or National All Governorates>",
      "recommendedPriceTND": <number price in TND, e.g. 49>,
      "estimatedMarginTND": <number estimated net margin in TND, e.g. 24>,
      "whyItWinsNow": "<Why this exact product wins based on current season and ad velocity>",
      "timingRationale": "<Why test this week>",
      "saturationStatus": "Unsaturated / Blue Ocean" | "Moderate Competition" | "Rising Trend",
      "creativeBlueprint": {
        "format": "Video (Hook-First)" | "Carousel (Benefit Story)" | "High-Impact Image",
        "hookDarijaFrench": "<Direct-response hook in Franco-Arabe or Darija + French, e.g. 'توصيل مجاني 24-48h لكامل تراب الجمهورية والدفع عند الاستلام'>",
        "visualHook3s": "<Visual action in first 3 seconds to stop scroll>",
        "ctaAndOffer": "<e.g. Achetez 1, le 2ème à -50% + Livraison Gratuite>"
      },
      "sourcingTip": "<Sourcing guidance>"
    }
  ],
  "winningAngleDirectives": [
    "<High-impact directive 1>",
    "<High-impact directive 2>",
    "<High-impact directive 3>"
  ]
}`;

  const topNichesSummary = stage1.rankedNiches.slice(0, 3).map((n) => `${n.niche} (Score ${n.opportunityScore}/100)`).join(", ");
  const redFlagsSummary = stage1.redFlagNiches.map((r) => r.niche).join(", ");

  const userContent = `SYNTHESIZED OPPORTUNITY CONTEXT:
- Top Niches Identified: ${topNichesSummary}
- Active Seasonal Phase: ${stage2.currentSeasonalPhase}
- Active Seasonal Wave This Week: ${stage2.seasonalRoadmap.activeWaveThisWeek}
- Next 30 Days Wave: ${stage2.seasonalRoadmap.next30DaysWave}
- Video Ad Market Share: ${telemetry.videoPercent}%
- Ad Copy Triggers: Arabic Script ${telemetry.copyPsychology.arabicScriptPercent}%, French ${telemetry.copyPsychology.frenchPercent}%, Free Delivery ${telemetry.copyPsychology.freeDeliveryTriggerPercent}%
- Avoid Red Flags in: ${redFlagsSummary || "None"}`;

  const { data, modelUsed } = await callAiWithFallback<Stage3ProductBlueprints>(
    systemPrompt,
    userContent,
    2200
  );

  if (data && Array.isArray(data.highConvictionProducts) && data.highConvictionProducts.length > 0) {
    return { result: data, modelUsed };
  }

  // Deterministic Fallback for Stage 3
  return {
    result: buildDeterministicStage3(seasonalityCtx, stage1),
    modelUsed: "offline_rules",
  };
}

// ---------------------------------------------------------------------------
// UNIFIED MASTER FUNCTION
// ---------------------------------------------------------------------------

export async function generateFullOpportunityReport(): Promise<UnifiedOpportunityReport> {
  const telemetry = await extractMarketOpportunityTelemetry();
  const seasonalityCtx = calculateTunisianSeasonalityContext();

  // Step 1 & Step 2: Run Stage 1 (Niche Velocity) and Stage 2 (Seasonality) IN PARALLEL
  const [stage1Res, stage2Res] = await Promise.all([
    runStage1NicheAnalysis(telemetry),
    runStage2SeasonalityAnalysis(seasonalityCtx, telemetry),
  ]);

  // Step 3: Run Stage 3 (Product Blueprints) with synthesized outputs from Stage 1 & Stage 2
  const stage3Res = await runStage3ProductBlueprints(
    stage1Res.result,
    stage2Res.result,
    seasonalityCtx,
    telemetry
  );

  const modelUsed = stage1Res.modelUsed !== "offline_rules" ? stage1Res.modelUsed : stage3Res.modelUsed;

  return {
    generatedAt: new Date().toISOString(),
    modelUsed,
    marketOpportunityIndex: stage1Res.result.marketOpportunityIndex,
    seasonality: stage2Res.result,
    nicheAnalysis: stage1Res.result,
    productBlueprints: stage3Res.result,
    telemetrySnapshot: telemetry,
    seasonalityContext: seasonalityCtx,
  };
}

// ---------------------------------------------------------------------------
// DETERMINISTIC HEURISTIC FALLBACK ENGINES ($0 Cost / Offline Resilient)
// ---------------------------------------------------------------------------

function buildDeterministicStage1(telemetry: MarketOpportunityTelemetry): Stage1NicheAnalysis {
  const topCategories = telemetry.categoryBreakdown.slice(0, 6);

  const rankedNiches: NicheOpportunityScorecard[] = topCategories.map((c, idx) => {
    const storeRatio = c.storeCount > 0 ? c.productCount / c.storeCount : 1;
    const isHighScale = c.newAds7dCount > 5;
    const saturationIndex = Math.min(95, Math.max(15, Math.round(storeRatio * 18)));
    const opportunityScore = Math.min(96, Math.max(40, Math.round(85 - idx * 7 + (isHighScale ? 10 : 0) - (saturationIndex > 60 ? 15 : 0))));

    return {
      niche: c.category,
      opportunityScore,
      competitionLevel: saturationIndex < 40 ? "Blue Ocean (Low)" : saturationIndex < 70 ? "Moderate Growth" : "Red Ocean (Saturated)",
      scalabilityPotential: opportunityScore > 75 ? "High" : opportunityScore > 55 ? "Moderate" : "Selective",
      saturationIndex,
      sweetSpotPriceTND: `${Math.round(c.minPriceTND || 29)} - ${Math.round(c.avgPriceTND || 59)} TND`,
      velocitySignal: `${c.productCount} active products across ${c.storeCount} stores with ${c.newAds7dCount} new creative launches this week.`,
      whyNowRationale: `Consistent buyer impulse in Tunisia with an average checkout basket of ${c.avgPriceTND} TND.`,
    };
  });

  const redFlagNiches = [
    {
      niche: "Over-Cloned Generic Gadgets",
      riskReason: "High clone saturation across 5+ stores selling identical creatives with diminishing ROAS.",
      descalingRateNote: "Frequent price undercutting down to 25 TND eroding net margins after COD delivery fees.",
    },
  ];

  const overallScore = Math.min(95, Math.max(45, Math.round(60 + (telemetry.scalingBrandsCount / Math.max(1, telemetry.scalingBrandsCount + telemetry.descalingBrandsCount)) * 35)));

  return {
    marketOpportunityIndex: overallScore,
    rankedNiches,
    redFlagNiches,
  };
}

function buildDeterministicStage2(ctx: TunisianSeasonalityContext): Stage2SeasonalityAnalysis {
  return {
    currentSeasonalPhase: ctx.activeSeasonalWindow,
    seasonalUrgency: "Immediate (Peak Wave)",
    seasonalRoadmap: {
      activeWaveThisWeek: `Capitalize on ${ctx.activeSeasonalWindow}: launch high-velocity video hooks targeting impulse buyers.`,
      next30DaysWave: ctx.upcomingKeyEvents[0]
        ? `Ramp up testing for ${ctx.upcomingKeyEvents[0].eventName} (in ${ctx.upcomingKeyEvents[0].daysRemaining} days).`
        : "Prepare autumn / winter transition catalog.",
      next60DaysWave: ctx.upcomingKeyEvents[1]
        ? `Early sourcing and creative prep for ${ctx.upcomingKeyEvents[1].eventName}.`
        : "Prepare Black Friday and End of Year scale campaigns.",
    },
    regionalDemandStrategy: ctx.regionalDemographics.map((r) => ({
      region: r.regionName,
      targetGovernorates: r.governorates.join(", "),
      hotCategories: r.preferredCategories,
      actionableDirective: `${r.consumerAngleNote} (Recommended Delivery: ${r.deliverySpeed}).`,
    })),
  };
}

function buildDeterministicStage3(
  ctx: TunisianSeasonalityContext,
  stage1: Stage1NicheAnalysis
): Stage3ProductBlueprints {
  return {
    highConvictionProducts: [
      {
        id: "prod_1",
        productName: "Ergonomic Back-to-School Posture Corrector & Study Companion",
        niche: "Kids, Baby & Toys",
        targetAudience: "Parents & Students (Grand Tunis, Sahel, Cap Bon)",
        targetRegions: "National All Governorates",
        recommendedPriceTND: 49,
        estimatedMarginTND: 26,
        whyItWinsNow: "Aligns with peak Rentrée Scolaire urgency and high parent willingness to invest in kids comfort.",
        timingRationale: "Peak annual search intent in late August & September.",
        saturationStatus: "Rising Trend",
        creativeBlueprint: {
          format: "Video (Hook-First)",
          hookDarijaFrench: "وليدك يقرا برشا وظهروا ديما يوجع فيه؟ الحل النهائي لوضعيّة صحيحة وصحة ممتازة! 🎒✨",
          visualHook3s: "Split screen: Slouching child at desk vs instantly standing upright with confidence.",
          ctaAndOffer: "عرض العودة المدرسية: إشري 1 والثاني بنصف السعر + توصيل مجاني وسريع لكامل تراب الجمهورية",
        },
        sourcingTip: "High availability locally in Moncef Bey / Sfax or rapid air shipment via AliExpress.",
      },
      {
        id: "prod_2",
        productName: "Pro Multi-Styler 5-in-1 Ceramic Hair Blowout Wand",
        niche: "Beauty, Health & Care",
        targetAudience: "Women 20-45 (Grand Tunis, Sousse, Monastir, Sfax)",
        targetRegions: "Grand Tunis & Sahel Metros",
        recommendedPriceTND: 79,
        estimatedMarginTND: 38,
        whyItWinsNow: "Evergreen high-margin cash cow with massive demand during Tunisian wedding season and event outings.",
        timingRationale: "High conversion volume and strong visual transformation power on TikTok & Instagram reels.",
        saturationStatus: "Unsaturated / Blue Ocean",
        creativeBlueprint: {
          format: "Video (Hook-First)",
          hookDarijaFrench: "بروشينغ صالون احترافي في 10 دقائق في دارك! بدون حرق الشعر وبنتيجة خيالية 😍🔥",
          visualHook3s: "Close-up 1-pass hair transformation from frizzy to silky smooth salon shine.",
          ctaAndOffer: "تخفيض 40% لفترة محدودة + الدفع عند الاستلام بعد المعاينة",
        },
        sourcingTip: "Source directly with EU 220V plug adapter from verified 1688/AliExpress suppliers.",
      },
      {
        id: "prod_3",
        productName: "Solar Waterproof Motion-Sensor Security Floodlight (120 LED)",
        niche: "Home, Kitchen & Living",
        targetAudience: "Homeowners & Drivers (Cap Bon, Sfax, South & Interior Governorates)",
        targetRegions: "Center, South & Interior Governorates",
        recommendedPriceTND: 59,
        estimatedMarginTND: 31,
        whyItWinsNow: "Solves electricity cost concerns with 0 TND electricity bill and easy wire-free installation.",
        timingRationale: "Highly sought after across villa owners, farms, and garage entries.",
        saturationStatus: "Moderate Competition",
        creativeBlueprint: {
          format: "Video (Hook-First)",
          hookDarijaFrench: "إضاءة قوية 100% بالطاقة الشمسية بدون فاتورة وبدون خيوط! ركب في دقيقة 💡☀️",
          visualHook3s: "Car pulling into pitch black driveway instantly illuminated by brilliant bright LED floodlight.",
          ctaAndOffer: "Pack 2 Pièces à 99 DT (Au lieu de 140 DT) + Livraison Gratuite",
        },
        sourcingTip: "Local wholesale readily available in Sfax hardware and Moncef Bey importers.",
      },
      {
        id: "prod_4",
        productName: "Universal Magnetic 360° Anti-Vibration Car Phone Mount",
        niche: "Automotive & Tools",
        targetAudience: "Drivers, Taxi & Delivery Couriers (Grand Tunis & National)",
        targetRegions: "National All Governorates",
        recommendedPriceTND: 39,
        estimatedMarginTND: 22,
        whyItWinsNow: "Sub-40 TND impulse price point with near-zero return rate and universal vehicle fit.",
        timingRationale: "Consistently low COD friction and fast confirmation rate (>88%).",
        saturationStatus: "Rising Trend",
        creativeBlueprint: {
          format: "Video (Hook-First)",
          hookDarijaFrench: "تلفونك ديما يطيح وأنت تسوق؟ الثبات المطلق مع الحامل المغناطيسي الأقوى في تونس 🚗📱",
          visualHook3s: "Violently shaking dashboard on bumpy road while phone stays rock solid.",
          ctaAndOffer: "Commandez Maintenant: Paiement à la livraison après vérification",
        },
        sourcingTip: "Low weight item (under 100g) ideal for bulk air sourcing at low shipping cost.",
      },
    ],
    winningAngleDirectives: [
      "Always include 'Paiement à la livraison après vérification' (COD confidence) to boost form completion by 25%.",
      "Leverage 'Pack 2 Pièces' bundle pricing (e.g. 1 for 49 DT, 2 for 79 DT) to maximize average order value (AOV) against flat delivery shipping fees.",
      "Video creatives with Darija voiceovers and high-energy first 3 seconds consistently outperform static image ads by 3.2x in scaling tests.",
    ],
  };
}
