/**
 * TypeScript Data Contracts for Frontier AI Prompt Generator & Wizard (TASK-16)
 * Kept separate from lib/opportunities/types.ts to prevent regressions in existing pipeline tests.
 */

export type TimeWindow = "7d" | "14d" | "30d";

export type LlmModelPreset = "claude" | "chatgpt" | "gemini" | "deepseek";

export type HtmlTheme = "tactical-dark" | "clean-slate" | "monochrome";

export interface CodParameters {
  targetPriceBands: string[]; // ["< 30 TND", "30 - 59.99 TND", "60 - 99.99 TND", "100+ TND"]
  minUnitMarginTnd: number;   // e.g. 15, 25, 35
  confirmationRatePct: number; // e.g. 80
  deliveryRatePct: number;     // e.g. 75
  returnBufferTnd: number;     // e.g. 8
}

export interface WizardConfig {
  timeWindow: TimeWindow;
  selectedCategories: string[]; // ["all"] or specific category names
  minActiveAdsThreshold: number;
  minStoreCountThreshold: number;
  includeScalingBrands: boolean;
  scalingBrandsLimit: number; // 10 | 25 | 50
  includeDescalingBrands: boolean;
  includeCloneTraps: boolean;
  codParameters: CodParameters;
  targetLlm: LlmModelPreset;
  htmlTheme: HtmlTheme;
}

export interface TelemetryCategoryRow {
  category: string;
  productCount: number;
  storeCount: number;
  activeAdsCount: number;
  newAdsWindowCount: number;
  avgPriceTnd: number | "";
  minPriceTnd: number | "";
  maxPriceTnd: number | "";
}

export interface TelemetryBrandRow {
  brandName: string;
  pageId: string;
  currentAds: number;
  netDelta: number;
  status: "scaling" | "descaling" | "stable" | "zero_ads" | string;
  category?: string;
}

export interface TelemetryProductRow {
  productTitle: string;
  domain: string;
  category: string;
  currentPriceTnd: number | "";
  storeCount: number;
  codPriceTier: string;
  isClonedTrap: boolean;
}

export interface TelemetryCreativeRow {
  adId: string;
  brandName: string;
  mediaType: "video" | "image" | string;
  daysActive: number;
  hasArabic: boolean;
  hasFrench: boolean;
  hasFreeDelivery: boolean;
  hasDiscount: boolean;
  category?: string;
}

export interface TelemetrySnapshot {
  workspaceId: string;
  rangeDays: number;
  effectiveWindow: string; // "7d" | "14d" | "30d"
  generatedAt: string;
  metrics: {
    totalActiveAds: number;
    newAdsWindow: number;
    scalingBrandsCount: number;
    descalingBrandsCount: number;
    totalProductsCount: number;
    saturatedClonesCount: number;
  };
  categories: TelemetryCategoryRow[];
  scalingBrands: TelemetryBrandRow[];
  descalingBrands: TelemetryBrandRow[];
  products: TelemetryProductRow[];
  creatives: TelemetryCreativeRow[];
}

export const DEFAULT_COD_PARAMETERS: CodParameters = {
  targetPriceBands: ["30 - 59.99 TND", "60 - 99.99 TND"],
  minUnitMarginTnd: 25,
  confirmationRatePct: 80,
  deliveryRatePct: 75,
  returnBufferTnd: 8,
};

export const DEFAULT_WIZARD_CONFIG: WizardConfig = {
  timeWindow: "7d",
  selectedCategories: ["all"],
  minActiveAdsThreshold: 10,
  minStoreCountThreshold: 1,
  includeScalingBrands: true,
  scalingBrandsLimit: 25,
  includeDescalingBrands: true,
  includeCloneTraps: true,
  codParameters: DEFAULT_COD_PARAMETERS,
  targetLlm: "claude",
  htmlTheme: "tactical-dark",
};
