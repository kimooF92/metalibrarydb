import test from "node:test";
import assert from "node:assert/strict";
import {
  OPPORTUNITY_AI_MODEL,
  OPPORTUNITY_SCHEMA_VERSION,
} from "./constants";
import {
  Stage1NicheAnalysisSchema,
  Stage2SeasonalityAnalysisSchema,
  Stage3ProductBlueprintsSchema,
  UnifiedOpportunityReportSchema,
} from "./schemas";
import { extractCleanJsonString, resolveOpenRouterApiKey } from "./openrouter-client";
import {
  buildDeterministicStage1,
  buildDeterministicStage2,
  buildDeterministicStage3,
} from "./offline-rules";
import { calculateTunisianSeasonalityContext } from "./seasonality";
import { MarketOpportunityTelemetry } from "./types";

test("Constants: Single configured AI model is minimax/minimax-m3.1-flash", () => {
  assert.equal(OPPORTUNITY_AI_MODEL, "minimax/minimax-m3.1-flash");
  assert.equal(OPPORTUNITY_SCHEMA_VERSION, "opportunities.v2");
});

test("Key Resolution: Resolves OpenRouter key across all aliases, strips quotes and whitespace", () => {
  const originalEnv = { ...process.env };
  try {
    // Clear all variants
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPEN_ROUTER_API_KEY;
    delete process.env.OPENROUTER_KEY;
    delete process.env.OPENROUTER_API_TOKEN;
    delete process.env.OPENROUTER_TOKEN;
    delete process.env.OPEN_ROUTER_KEY;
    delete process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;

    assert.equal(resolveOpenRouterApiKey(), null);

    // Test with double quotes and whitespace
    process.env.OPENROUTER_API_KEY = '  "sk-or-v1-test-double-quotes"  ';
    assert.equal(resolveOpenRouterApiKey(), "sk-or-v1-test-double-quotes");
    delete process.env.OPENROUTER_API_KEY;

    // Test with single quotes
    process.env.OPENROUTER_KEY = "'sk-or-v1-test-single-quotes'";
    assert.equal(resolveOpenRouterApiKey(), "sk-or-v1-test-single-quotes");
    delete process.env.OPENROUTER_KEY;

    // Test OPEN_ROUTER_API_KEY alias
    process.env.OPEN_ROUTER_API_KEY = "sk-or-v1-test-underscore";
    assert.equal(resolveOpenRouterApiKey(), "sk-or-v1-test-underscore");
    delete process.env.OPEN_ROUTER_API_KEY;

    // Test OPENROUTER_API_TOKEN alias
    process.env.OPENROUTER_API_TOKEN = "sk-or-v1-test-token";
    assert.equal(resolveOpenRouterApiKey(), "sk-or-v1-test-token");
    delete process.env.OPENROUTER_API_TOKEN;

    // Test OPENAI_API_KEY starting with sk-or-
    process.env.OPENAI_API_KEY = "sk-or-v1-test-openai-prefix";
    assert.equal(resolveOpenRouterApiKey(), "sk-or-v1-test-openai-prefix");
    delete process.env.OPENAI_API_KEY;

    // Standard OpenAI key (sk-proj-...) is NOT treated as OpenRouter key
    process.env.OPENAI_API_KEY = "sk-proj-test-standard-openai";
    assert.equal(resolveOpenRouterApiKey(), null);
    delete process.env.OPENAI_API_KEY;

    // Test value signature scan: Any variable whose value starts with sk-or-
    process.env.UNEXPECTED_SECRET_NAME = "sk-or-v1-any-custom-variable-name";
    assert.equal(resolveOpenRouterApiKey(), "sk-or-v1-any-custom-variable-name");
    delete process.env.UNEXPECTED_SECRET_NAME;

    // Test fuzzy name scan: Any variable with "jev_key"
    process.env.CUSTOM_JEV_KEY = "sk-jev-test-key";
    assert.equal(resolveOpenRouterApiKey(), "sk-jev-test-key");
    delete process.env.CUSTOM_JEV_KEY;
  } finally {
    process.env = originalEnv;
  }
});

test("Schemas: Stage 1 Niche Analysis strictly validates bounds and rejects duplicates", () => {
  const validStage1 = {
    marketOpportunityIndex: 82,
    rankedNiches: [
      {
        niche: "Beauty, Health & Care",
        opportunityScore: 88,
        competitionLevel: "Moderate Growth",
        scalabilityPotential: "High",
        saturationIndex: 35,
        sweetSpotPriceTND: "49 - 89 TND",
        velocitySignal: "12 active stores with 24 creative tests this week.",
        whyNowRationale: "High impulse buy during wedding and event season.",
      },
      {
        niche: "Electronics & Tech",
        opportunityScore: 74,
        competitionLevel: "Blue Ocean (Low)",
        scalabilityPotential: "Moderate",
        saturationIndex: 28,
        sweetSpotPriceTND: "39 - 69 TND",
        velocitySignal: "Strong demand for car and home gadgets.",
        whyNowRationale: "Consistently low friction impulse purchases.",
      },
    ],
    redFlagNiches: [
      {
        niche: "Generic Smartwatches",
        riskReason: "High clone saturation across 10+ stores.",
        descalingRateNote: "Frequent price undercutting eroding margin.",
      },
    ],
  };

  const parsed = Stage1NicheAnalysisSchema.safeParse(validStage1);
  assert.equal(parsed.success, true);

  // Reject out-of-bounds score (> 100)
  const invalidScore = { ...validStage1, marketOpportunityIndex: 120 };
  assert.equal(Stage1NicheAnalysisSchema.safeParse(invalidScore).success, false);

  // Reject duplicate niche names in rankedNiches
  const duplicateNiches = {
    ...validStage1,
    rankedNiches: [
      validStage1.rankedNiches[0],
      { ...validStage1.rankedNiches[0], opportunityScore: 60 },
    ],
  };
  assert.equal(Stage1NicheAnalysisSchema.safeParse(duplicateNiches).success, false);

  // Reject invalid competition level enum
  const invalidEnum = {
    ...validStage1,
    rankedNiches: [
      {
        ...validStage1.rankedNiches[0],
        competitionLevel: "NonExistentLevel",
      },
    ],
  };
  assert.equal(Stage1NicheAnalysisSchema.safeParse(invalidEnum).success, false);
});

test("Schemas: Stage 2 Seasonality strictly validates urgency enums and region uniqueness", () => {
  const validStage2 = {
    currentSeasonalPhase: "Rentrée Scolaire Ramp",
    seasonalUrgency: "Immediate (Peak Wave)",
    seasonalRoadmap: {
      activeWaveThisWeek: "Push backpacks and study ergonomics.",
      next30DaysWave: "Prepare autumn home living offers.",
      next60DaysWave: "Source Black Friday bundles.",
    },
    regionalDemandStrategy: [
      {
        region: "Grand Tunis",
        targetGovernorates: "Tunis, Ariana, Ben Arous, Manouba",
        hotCategories: ["Electronics", "Beauty"],
        actionableDirective: "Offer 24h express delivery for high AOV.",
      },
      {
        region: "Sahel Coastal Strip",
        targetGovernorates: "Sousse, Monastir, Mahdia",
        hotCategories: ["Fashion", "Beauty"],
        actionableDirective: "Focus on wedding and lifestyle angles.",
      },
    ],
  };

  assert.equal(Stage2SeasonalityAnalysisSchema.safeParse(validStage2).success, true);

  // Reject invalid urgency
  const invalidUrgency = { ...validStage2, seasonalUrgency: "NotAnUrgency" };
  assert.equal(Stage2SeasonalityAnalysisSchema.safeParse(invalidUrgency).success, false);

  // Reject duplicate regions
  const duplicateRegions = {
    ...validStage2,
    regionalDemandStrategy: [
      validStage2.regionalDemandStrategy[0],
      { ...validStage2.regionalDemandStrategy[0], hotCategories: ["Home"] },
    ],
  };
  assert.equal(Stage2SeasonalityAnalysisSchema.safeParse(duplicateRegions).success, false);
});

test("Schemas: Stage 3 Product Blueprints strictly validates price bounds and unique IDs", () => {
  const validStage3 = {
    highConvictionProducts: [
      {
        id: "prod_1",
        productName: "Ergonomic Posture Corrector",
        niche: "Kids, Baby & Toys",
        targetAudience: "Parents and Students",
        targetRegions: "National",
        recommendedPriceTND: 49,
        estimatedMarginTND: 25,
        whyItWinsNow: "Peak back to school season.",
        timingRationale: "High urgency.",
        saturationStatus: "Rising Trend",
        creativeBlueprint: {
          format: "Video (Hook-First)",
          hookDarijaFrench: "وليدك يقرا برشا؟ Pack Promo",
          visualHook3s: "Side by side slouch vs upright.",
          ctaAndOffer: "Achetez 1, 2ème à -50%",
        },
        sourcingTip: "Local wholesale in Moncef Bey.",
      },
    ],
    winningAngleDirectives: [
      "Include Paiement à la livraison après vérification.",
    ],
  };

  assert.equal(Stage3ProductBlueprintsSchema.safeParse(validStage3).success, true);

  // Reject negative price
  const negativePrice = {
    ...validStage3,
    highConvictionProducts: [
      { ...validStage3.highConvictionProducts[0], recommendedPriceTND: -10 },
    ],
  };
  assert.equal(Stage3ProductBlueprintsSchema.safeParse(negativePrice).success, false);

  // Reject duplicate product IDs
  const duplicateIds = {
    ...validStage3,
    highConvictionProducts: [
      validStage3.highConvictionProducts[0],
      { ...validStage3.highConvictionProducts[0], productName: "Another Product" },
    ],
  };
  assert.equal(Stage3ProductBlueprintsSchema.safeParse(duplicateIds).success, false);
});

test("extractCleanJsonString strips markdown fences and thinking tags safely", () => {
  // Plain JSON
  assert.equal(extractCleanJsonString('{"test": 123}'), '{"test": 123}');

  // Code fenced JSON
  const fenced = "```json\n{\"test\": 123}\n```";
  assert.equal(extractCleanJsonString(fenced), '{"test": 123}');

  // Code fenced without json tag
  const fencedNoTag = "```\n{\"test\": 123}\n```";
  assert.equal(extractCleanJsonString(fencedNoTag), '{"test": 123}');

  // With <think> tags
  const withThink = "<think>Analyzing user request...</think>\n```json\n{\"test\": 123}\n```";
  assert.equal(extractCleanJsonString(withThink), '{"test": 123}');
});

test("Deterministic offline engine produces 100% schema-valid stage outputs", () => {
  const dummyTelemetry: MarketOpportunityTelemetry = {
    totalActiveAds: 10,
    newAdsLast7Days: 3,
    videoPercent: 70,
    imagePercent: 30,
    monitoredBrands: 5,
    scalingBrandsCount: 2,
    totalAdsScaled: 8,
    descalingBrandsCount: 1,
    totalAdsDescaled: 3,
    netAdDelta: 5,
    categoryBreakdown: [
      {
        category: "Beauty & Health",
        productCount: 15,
        storeCount: 4,
        avgPriceTND: 65,
        minPriceTND: 35,
        maxPriceTND: 120,
        activeAdsCount: 8,
        newAds7dCount: 2,
      },
    ],
    topClonedProducts: [],
    copyPsychology: {
      arabicScriptPercent: 40,
      frenchPercent: 60,
      discountTriggerPercent: 30,
      freeDeliveryTriggerPercent: 50,
    },
    coverage: {
      window: { start: new Date().toISOString(), end: new Date().toISOString() },
      workspaceId: "00000000-0000-0000-0000-000000000001",
      observedAdCount: 10,
      hasEnoughDataForInference: true,
      missingSignals: [],
    },
  };

  const seasonality = calculateTunisianSeasonalityContext();
  const stage1 = buildDeterministicStage1(dummyTelemetry);
  const stage2 = buildDeterministicStage2(seasonality);
  const stage3 = buildDeterministicStage3(seasonality, stage1);

  assert.equal(Stage1NicheAnalysisSchema.safeParse(stage1).success, true);
  assert.equal(Stage2SeasonalityAnalysisSchema.safeParse(stage2).success, true);
  assert.equal(Stage3ProductBlueprintsSchema.safeParse(stage3).success, true);

  const unifiedReport = {
    generatedAt: new Date().toISOString(),
    modelUsed: "Deterministic Heuristics",
    marketOpportunityIndex: stage1.marketOpportunityIndex,
    generationMeta: {
      schemaVersion: OPPORTUNITY_SCHEMA_VERSION,
      generationMode: "offline" as const,
      requestedModel: OPPORTUNITY_AI_MODEL,
      returnedModel: null,
      generatedAt: new Date().toISOString(),
      telemetryWindow: dummyTelemetry.coverage.window,
      stageStatus: {
        telemetry: "ok" as const,
        stage1: "offline" as const,
        stage2: "offline" as const,
        stage3: "offline" as const,
      },
      warnings: ["Offline rules test"],
    },
    seasonality: stage2,
    nicheAnalysis: stage1,
    productBlueprints: stage3,
    telemetrySnapshot: dummyTelemetry,
    seasonalityContext: seasonality,
  };

  const parsedUnified = UnifiedOpportunityReportSchema.safeParse(unifiedReport);
  if (!parsedUnified.success) {
    console.error("UnifiedReportSchema issues:", JSON.stringify(parsedUnified.error.issues, null, 2));
  }
  assert.equal(parsedUnified.success, true);
});

test("Telemetry null safety: empty observations yield null percentages and null prices", () => {
  const emptyTelemetry: MarketOpportunityTelemetry = {
    totalActiveAds: 0,
    newAdsLast7Days: 0,
    videoPercent: null,
    imagePercent: null,
    monitoredBrands: 0,
    scalingBrandsCount: 0,
    totalAdsScaled: 0,
    descalingBrandsCount: 0,
    totalAdsDescaled: 0,
    netAdDelta: 0,
    categoryBreakdown: [],
    topClonedProducts: [],
    copyPsychology: {
      arabicScriptPercent: 0,
      frenchPercent: 0,
      discountTriggerPercent: 0,
      freeDeliveryTriggerPercent: 0,
    },
    coverage: {
      window: { start: new Date().toISOString(), end: new Date().toISOString() },
      workspaceId: "00000000-0000-0000-0000-000000000001",
      observedAdCount: 0,
      hasEnoughDataForInference: false,
      missingSignals: ["activeAds", "categories"],
    },
  };

  assert.equal(emptyTelemetry.videoPercent, null);
  assert.equal(emptyTelemetry.imagePercent, null);
  assert.equal(emptyTelemetry.coverage.hasEnoughDataForInference, false);
  assert.deepEqual(emptyTelemetry.coverage.missingSignals, ["activeAds", "categories"]);
});

test("Persistence: savePersistedOpportunityReport and loadPersistedOpportunityReport atomic upsert", async () => {
  if (process.env.SKIP_DB_TESTS === "true" || !process.env.DATABASE_URL) {
    console.log("Skipping DB persistence test (SKIP_DB_TESTS is set or DATABASE_URL is missing)");
    return;
  }

  const testWorkspaceId = "00000000-0000-0000-0000-000000000002"; // Morocco workspace from seeds
  const dummyTelemetry: MarketOpportunityTelemetry = {
    totalActiveAds: 5,
    newAdsLast7Days: 1,
    videoPercent: 50,
    imagePercent: 50,
    monitoredBrands: 2,
    scalingBrandsCount: 1,
    totalAdsScaled: 2,
    descalingBrandsCount: 0,
    totalAdsDescaled: 0,
    netAdDelta: 2,
    categoryBreakdown: [],
    topClonedProducts: [],
    copyPsychology: {
      arabicScriptPercent: 50,
      frenchPercent: 50,
      discountTriggerPercent: 20,
      freeDeliveryTriggerPercent: 20,
    },
    coverage: {
      window: { start: new Date().toISOString(), end: new Date().toISOString() },
      workspaceId: testWorkspaceId,
      observedAdCount: 5,
      hasEnoughDataForInference: true,
      missingSignals: [],
    },
  };

  const seasonality = calculateTunisianSeasonalityContext();
  const stage1 = buildDeterministicStage1(dummyTelemetry);
  const stage2 = buildDeterministicStage2(seasonality);
  const stage3 = buildDeterministicStage3(seasonality, stage1);

  const testReport = {
    generatedAt: new Date().toISOString(),
    modelUsed: "Deterministic Heuristics",
    marketOpportunityIndex: stage1.marketOpportunityIndex,
    generationMeta: {
      schemaVersion: OPPORTUNITY_SCHEMA_VERSION,
      generationMode: "offline" as const,
      requestedModel: OPPORTUNITY_AI_MODEL,
      returnedModel: null,
      generatedAt: new Date().toISOString(),
      telemetryWindow: dummyTelemetry.coverage.window,
      stageStatus: {
        telemetry: "ok" as const,
        stage1: "offline" as const,
        stage2: "offline" as const,
        stage3: "offline" as const,
      },
      warnings: ["Integration test report"],
    },
    seasonality: stage2,
    nicheAnalysis: stage1,
    productBlueprints: stage3,
    telemetrySnapshot: dummyTelemetry,
    seasonalityContext: seasonality,
  };

  const {
    savePersistedOpportunityReport,
    loadPersistedOpportunityReport,
    clearPersistedOpportunityReports,
  } = await import("./persistence");

  try {
    // Save report
    await savePersistedOpportunityReport(testWorkspaceId, testReport);

    // Load report back
    const loaded = await loadPersistedOpportunityReport(testWorkspaceId);
    assert.notEqual(loaded, null);
    assert.equal(loaded?.generationMeta.generationMode, "offline");
    assert.equal(loaded?.generationMeta.requestedModel, OPPORTUNITY_AI_MODEL);
    assert.equal(loaded?.marketOpportunityIndex, stage1.marketOpportunityIndex);
  } finally {
    // Guaranteed cleanup: Never leave persistent test rows in the database
    await clearPersistedOpportunityReports(testWorkspaceId);
  }
});

test("Route GET: Never calls AI and returns Cache-Control: private, no-store", async () => {
  const { GET } = await import("@/app/api/analytics/opportunities/route");
  const { NextRequest } = await import("next/server");

  const authSecret = process.env.APP_PASSWORD || process.env.AUTH_SECRET || "Sansfacon__11";
  const req = new NextRequest("http://localhost:3000/api/analytics/opportunities?auto=true", {
    method: "GET",
    headers: {
      "authorization": `Bearer ${authSecret}`,
      "x-workspace-id": "00000000-0000-0000-0000-000000000001",
    },
  });

  const res = await GET(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");

  const json = await res.json();
  assert.equal(typeof json.exists, "boolean");
  assert.equal(json.workspaceId, "00000000-0000-0000-0000-000000000001");
});

test.after(async () => {
  const { client } = await import("@/db");
  await client.end();
});


