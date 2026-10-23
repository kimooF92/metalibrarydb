import { OPPORTUNITY_SCHEMA_VERSION } from "./constants";

export interface TunisianSeasonalityContext {
  currentDate: string; // ISO date
  currentMonthName: string;
  activeSeasonalWindow: string;
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
    avgConfirmationRate: string;
    avgDeliverySuccessRate: string;
    sweetSpotPriceBands: {
      band: string;
      label: string;
      conversionFriction: "Very Low" | "Low" | "Medium" | "High (Requires Call/Trust)";
    }[];
  };
}

export interface TelemetryCoverage {
  window: { start: string; end: string };
  workspaceId: string;
  observedAdCount: number;
  hasEnoughDataForInference: boolean;
  missingSignals: string[];
}

export interface MarketOpportunityTelemetry {
  totalActiveAds: number;
  newAdsLast7Days: number;
  videoPercent: number | null;
  imagePercent: number | null;
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
    avgPriceTND: number | null;
    minPriceTND: number | null;
    maxPriceTND: number | null;
    activeAdsCount: number;
    newAds7dCount: number;
  }[];
  topClonedProducts: {
    title: string;
    storeCount: number;
    category: string;
    avgPriceTND: number | null;
  }[];
  copyPsychology: {
    arabicScriptPercent: number;
    frenchPercent: number;
    discountTriggerPercent: number;
    freeDeliveryTriggerPercent: number;
  };
  coverage: TelemetryCoverage;
}

export interface NicheOpportunityScorecard {
  niche: string;
  opportunityScore: number; // 0 - 100
  competitionLevel: "Blue Ocean (Low)" | "Moderate Growth" | "Red Ocean (Saturated)";
  scalabilityPotential: "High" | "Moderate" | "Selective";
  saturationIndex: number; // 0 - 100
  sweetSpotPriceTND: string;
  velocitySignal: string;
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
    hookDarijaFrench: string;
    visualHook3s: string;
    ctaAndOffer: string;
  };
  sourcingTip: string;
}

export interface Stage3ProductBlueprints {
  highConvictionProducts: HighConvictionProductOpportunity[];
  winningAngleDirectives: string[];
}

export interface OpportunityGenerationMeta {
  schemaVersion: typeof OPPORTUNITY_SCHEMA_VERSION;
  generationMode: "ai" | "offline";
  requestedModel: string;
  returnedModel: string | null;
  generatedAt: string;
  telemetryWindow: { start: string; end: string };
  stageStatus: {
    telemetry: "ok" | "empty" | "failed";
    stage1: "ai" | "offline" | "failed";
    stage2: "ai" | "offline" | "failed";
    stage3: "ai" | "offline" | "failed";
  };
  warnings: string[];
}

export interface UnifiedOpportunityReport {
  generatedAt: string;
  modelUsed: string;
  marketOpportunityIndex: number;
  generationMeta: OpportunityGenerationMeta;
  seasonality: Stage2SeasonalityAnalysis;
  nicheAnalysis: Stage1NicheAnalysis;
  productBlueprints: Stage3ProductBlueprints;
  telemetrySnapshot: MarketOpportunityTelemetry;
  seasonalityContext: TunisianSeasonalityContext;
}

export interface OpportunityAiInput {
  schemaVersion: typeof OPPORTUNITY_SCHEMA_VERSION;
  stage: "niche_analysis" | "seasonality_analysis" | "product_blueprints";
  locale: { country: "TN"; currency: "TND"; languages: ["ar-TN", "fr"] };
  telemetryWindow: { start: string; end: string };
  dataQuality: {
    hasEnoughDataForInference: boolean;
    missingSignals: string[];
  };
  telemetry: MarketOpportunityTelemetry;
  seasonalityContext: TunisianSeasonalityContext;
  priorStageResults?: {
    nicheAnalysis?: Stage1NicheAnalysis;
    seasonalityAnalysis?: Stage2SeasonalityAnalysis;
  };
}

export type StageResult<T> = {
  ok: boolean;
  value: T | null;
  mode: "ai" | "offline" | "failed";
  requestedModel: string;
  returnedModel: string | null;
  validationErrors: string[];
};
