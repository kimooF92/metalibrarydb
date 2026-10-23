import { z } from "zod";
import { OPPORTUNITY_SCHEMA_VERSION } from "./constants";

// ---------------------------------------------------------------------------
// STAGE 1 SCHEMAS: Niche Analysis
// ---------------------------------------------------------------------------

export const NicheOpportunityScorecardSchema = z.object({
  niche: z.string().trim().min(1).max(100),
  opportunityScore: z.number().int().min(0).max(100),
  competitionLevel: z.enum([
    "Blue Ocean (Low)",
    "Moderate Growth",
    "Red Ocean (Saturated)",
  ]),
  scalabilityPotential: z.enum(["High", "Moderate", "Selective"]),
  saturationIndex: z.number().int().min(0).max(100),
  sweetSpotPriceTND: z.string().trim().min(1).max(80),
  velocitySignal: z.string().trim().min(1).max(1000),
  whyNowRationale: z.string().trim().min(1).max(1000),
});

export const RedFlagNicheSchema = z.object({
  niche: z.string().trim().min(1).max(100),
  riskReason: z.string().trim().min(1).max(1000),
  descalingRateNote: z.string().trim().min(1).max(1000),
});

export const Stage1NicheAnalysisSchema = z.object({
  marketOpportunityIndex: z.number().int().min(0).max(100),
  rankedNiches: z
    .array(NicheOpportunityScorecardSchema)
    .min(1)
    .max(10)
    .refine(
      (items) => {
        const names = items.map((i) => i.niche.toLowerCase().trim());
        return new Set(names).size === names.length;
      },
      { message: "Ranked niches must not contain duplicate niche names." }
    ),
  redFlagNiches: z.array(RedFlagNicheSchema).max(6),
});

// ---------------------------------------------------------------------------
// STAGE 2 SCHEMAS: Seasonality & Regional Demand
// ---------------------------------------------------------------------------

export const RegionalDemandDirectiveSchema = z.object({
  region: z.string().trim().min(1).max(100),
  targetGovernorates: z.string().trim().min(1).max(250),
  hotCategories: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  actionableDirective: z.string().trim().min(1).max(1000),
});

export const Stage2SeasonalityAnalysisSchema = z.object({
  currentSeasonalPhase: z.string().trim().min(1).max(200),
  seasonalUrgency: z.enum([
    "Immediate (Peak Wave)",
    "Ramping Up (Start Sourcing)",
    "Transition Window",
  ]),
  seasonalRoadmap: z.object({
    activeWaveThisWeek: z.string().trim().min(1).max(1000),
    next30DaysWave: z.string().trim().min(1).max(1000),
    next60DaysWave: z.string().trim().min(1).max(1000),
  }),
  regionalDemandStrategy: z
    .array(RegionalDemandDirectiveSchema)
    .min(1)
    .max(8)
    .refine(
      (items) => {
        const regions = items.map((r) => r.region.toLowerCase().trim());
        return new Set(regions).size === regions.length;
      },
      { message: "Regional demand strategy must not contain duplicate regions." }
    ),
});

// ---------------------------------------------------------------------------
// STAGE 3 SCHEMAS: Product Blueprints
// ---------------------------------------------------------------------------

export const CreativeBlueprintSchema = z.object({
  format: z.enum([
    "Video (Hook-First)",
    "Carousel (Benefit Story)",
    "High-Impact Image",
  ]),
  hookDarijaFrench: z.string().trim().min(3).max(600),
  visualHook3s: z.string().trim().min(3).max(600),
  ctaAndOffer: z.string().trim().min(3).max(600),
});

export const HighConvictionProductOpportunitySchema = z.object({
  id: z.string().trim().min(1).max(50),
  productName: z.string().trim().min(1).max(150),
  niche: z.string().trim().min(1).max(100),
  targetAudience: z.union([
    z.string().trim().min(1).max(350),
    z.array(z.string().trim().min(1).max(100)).transform((arr) => arr.join(", ")),
  ]),
  targetRegions: z.union([
    z.string().trim().min(1).max(350),
    z.array(z.string().trim().min(1).max(100)).transform((arr) => arr.join(", ")),
  ]),
  recommendedPriceTND: z.coerce.number().finite().positive().max(1000),
  estimatedMarginTND: z.coerce.number().finite().positive().max(1000),
  whyItWinsNow: z.string().trim().min(1).max(1000),
  timingRationale: z.string().trim().min(1).max(1000),
  saturationStatus: z.enum([
    "Unsaturated / Blue Ocean",
    "Moderate Competition",
    "Rising Trend",
  ]),
  creativeBlueprint: CreativeBlueprintSchema,
  sourcingTip: z.string().trim().min(1).max(1000),
});

export const Stage3ProductBlueprintsSchema = z.object({
  highConvictionProducts: z
    .array(HighConvictionProductOpportunitySchema)
    .min(1)
    .max(8)
    .refine(
      (items) => {
        const ids = items.map((p) => p.id.toLowerCase().trim());
        return new Set(ids).size === ids.length;
      },
      { message: "High-conviction products must not contain duplicate IDs." }
    ),
  winningAngleDirectives: z
    .array(z.string().trim().min(1).max(1000))
    .min(1)
    .max(8)
    .default([
      "Prioritize 24h express delivery guarantees in Grand Tunis & Sahel to lift checkout completion.",
      "Bundle complementary accessories with 2+1 offers to push AOV above 60 TND for COD delivery profitability.",
      "Always include video voiceovers in natural Tunisian Darija addressing trust, return policy, and package inspection at delivery.",
    ]),
});

// ---------------------------------------------------------------------------
// GENERATION METADATA & TELEMETRY SCHEMAS
// ---------------------------------------------------------------------------

export const OpportunityGenerationMetaSchema = z.object({
  schemaVersion: z.literal(OPPORTUNITY_SCHEMA_VERSION),
  generationMode: z.enum(["ai", "offline"]),
  requestedModel: z.string().min(1),
  returnedModel: z.string().nullable(),
  generatedAt: z.string().datetime(),
  telemetryWindow: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  stageStatus: z.object({
    telemetry: z.enum(["ok", "empty", "failed"]),
    stage1: z.enum(["ai", "offline", "failed"]),
    stage2: z.enum(["ai", "offline", "failed"]),
    stage3: z.enum(["ai", "offline", "failed"]),
  }),
  warnings: z.array(z.string()),
});

export const TelemetryCoverageSchema = z.object({
  window: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  workspaceId: z
    .string()
    .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID format"),
  observedAdCount: z.number().int().min(0),
  hasEnoughDataForInference: z.boolean(),
  missingSignals: z.array(z.string()),
});

export const MarketOpportunityTelemetrySchema = z.object({
  totalActiveAds: z.number().int().min(0),
  newAdsLast7Days: z.number().int().min(0),
  videoPercent: z.number().min(0).max(100).nullable(),
  imagePercent: z.number().min(0).max(100).nullable(),
  monitoredBrands: z.number().int().min(0),
  scalingBrandsCount: z.number().int().min(0),
  totalAdsScaled: z.number().int().min(0),
  descalingBrandsCount: z.number().int().min(0),
  totalAdsDescaled: z.number().int().min(0),
  netAdDelta: z.number().int(),
  categoryBreakdown: z.array(
    z.object({
      category: z.string(),
      productCount: z.number().int().min(0),
      storeCount: z.number().int().min(0),
      avgPriceTND: z.number().nullable(),
      minPriceTND: z.number().nullable(),
      maxPriceTND: z.number().nullable(),
      activeAdsCount: z.number().int().min(0),
      newAds7dCount: z.number().int().min(0),
    })
  ),
  topClonedProducts: z.array(
    z.object({
      title: z.string(),
      storeCount: z.number().int().min(0),
      category: z.string(),
      avgPriceTND: z.number().nullable(),
    })
  ),
  copyPsychology: z.object({
    arabicScriptPercent: z.number().min(0).max(100),
    frenchPercent: z.number().min(0).max(100),
    discountTriggerPercent: z.number().min(0).max(100),
    freeDeliveryTriggerPercent: z.number().min(0).max(100),
  }),
  coverage: TelemetryCoverageSchema,
});

// ---------------------------------------------------------------------------
// SEASONALITY CONTEXT SCHEMA
// ---------------------------------------------------------------------------

export const TunisianSeasonalityContextSchema = z.object({
  currentDate: z.string(),
  currentMonthName: z.string(),
  activeSeasonalWindow: z.string(),
  upcomingKeyEvents: z.array(
    z.object({
      eventName: z.string(),
      targetDate: z.string(),
      daysRemaining: z.number().int(),
      impactLevel: z.enum(["Critical", "High", "Moderate"]),
      relevantCategories: z.array(z.string()),
      buyingBehaviorNote: z.string(),
    })
  ),
  regionalDemographics: z.array(
    z.object({
      regionName: z.string(),
      governorates: z.array(z.string()),
      purchasingPower: z.enum(["High", "Upper-Mid", "Moderate", "COD-Sensitive"]),
      deliverySpeed: z.string(),
      preferredCategories: z.array(z.string()),
      consumerAngleNote: z.string(),
    })
  ),
  codEconomics: z.object({
    avgConfirmationRate: z.string(),
    avgDeliverySuccessRate: z.string(),
    sweetSpotPriceBands: z.array(
      z.object({
        band: z.string(),
        label: z.string(),
        conversionFriction: z.enum([
          "Very Low",
          "Low",
          "Medium",
          "High (Requires Call/Trust)",
        ]),
      })
    ),
  }),
});

// ---------------------------------------------------------------------------
// UNIFIED REPORT SCHEMA
// ---------------------------------------------------------------------------

export const UnifiedOpportunityReportSchema = z.object({
  generatedAt: z.string().datetime(),
  modelUsed: z.string().min(1),
  marketOpportunityIndex: z.number().int().min(0).max(100),
  generationMeta: OpportunityGenerationMetaSchema,
  seasonality: Stage2SeasonalityAnalysisSchema,
  nicheAnalysis: Stage1NicheAnalysisSchema,
  productBlueprints: Stage3ProductBlueprintsSchema,
  telemetrySnapshot: MarketOpportunityTelemetrySchema,
  seasonalityContext: TunisianSeasonalityContextSchema,
});
