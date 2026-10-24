import { OPPORTUNITY_AI_MODEL, OPPORTUNITY_SCHEMA_VERSION, MAX_PIPELINE_TIMEOUT_MS } from "./constants";
import {
  OpportunityAiInput,
  Stage1NicheAnalysis,
  Stage2SeasonalityAnalysis,
  Stage3ProductBlueprints,
  UnifiedOpportunityReport,
  StageResult,
} from "./types";
import {
  Stage1NicheAnalysisSchema,
  Stage2SeasonalityAnalysisSchema,
  Stage3ProductBlueprintsSchema,
  UnifiedOpportunityReportSchema,
} from "./schemas";
import { extractMarketOpportunityTelemetry } from "./telemetry";
import { calculateTunisianSeasonalityContext } from "./seasonality";
import { callMiniMaxStage } from "./openrouter-client";
import {
  buildDeterministicStage1,
  buildDeterministicStage2,
  buildDeterministicStage3,
} from "./offline-rules";

// ---------------------------------------------------------------------------
// SYSTEM PROMPTS FOR MINIMAX M3.1 FLASH
// ---------------------------------------------------------------------------

const STAGE_1_SYSTEM_PROMPT = `You are a Principal E-Commerce Market Intelligence Analyst specializing strictly in the Tunisian COD (Cash-on-Delivery) consumer market.
CRITICAL: Respond ONLY with a single valid JSON object conforming to the template below. Start directly with '{'. Do NOT write any introduction, thinking process, reasoning steps, or commentary.

OUTPUT JSON TEMPLATE:
{
  "marketOpportunityIndex": 78,
  "rankedNiches": [
    {
      "niche": "Automotive & Tools",
      "opportunityScore": 84,
      "competitionLevel": "Moderate Growth",
      "scalabilityPotential": "High",
      "saturationIndex": 48,
      "sweetSpotPriceTND": "39 - 69 TND",
      "velocitySignal": "985 new ads in 7 days across 2421 active ads signals 40.7% expansion velocity.",
      "whyNowRationale": "Autumn-winter weather transition drives immediate demand for practical vehicle care."
    }
  ],
  "redFlagNiches": [
    {
      "niche": "Generic Cloned Storage Boxes",
      "riskReason": "Saturated across 4+ stores eroding margins.",
      "descalingRateNote": "High price wars under 30 TND."
    }
  ]
}

RULES:
- Provide 3 to 6 unique ranked niches.
- Provide 1 to 3 red flag niches.
- "competitionLevel" must be one of: "Blue Ocean (Low)", "Moderate Growth", "Red Ocean (Saturated)".
- "scalabilityPotential" must be one of: "High", "Moderate", "Selective".
- Ground your analysis strictly in the provided telemetry numbers.
`;

const STAGE_2_SYSTEM_PROMPT = `You are a Strategic Cultural Seasonality & COD E-Commerce Planner for Tunisia.
CRITICAL: Respond ONLY with a single valid JSON object conforming to the template below. Start directly with '{'. Do NOT write any introduction, thinking process, reasoning steps, or commentary.

OUTPUT JSON TEMPLATE:
{
  "currentSeasonalPhase": "Autumn Home Transition & BF Ramp",
  "seasonalUrgency": "Immediate (Peak Wave)",
  "seasonalRoadmap": {
    "activeWaveThisWeek": "Test high-margin autumn home essentials and practical auto tools with video hooks.",
    "next30DaysWave": "Scale Black Friday bundles (2+1, free delivery) targeting Grand Tunis & Sahel.",
    "next60DaysWave": "Begin sourcing winter clothing accessories and initial Ramadan home prep."
  },
  "regionalDemandStrategy": [
    {
      "region": "Grand Tunis",
      "targetGovernorates": "Tunis, Ariana, Ben Arous, Manouba",
      "hotCategories": ["Beauty, Health & Care", "Electronics & Tech", "Fashion & Jewelry"],
      "actionableDirective": "Offer 24h express delivery to maximize impulse COD delivery rates."
    },
    {
      "region": "Sahel Coastal Strip",
      "targetGovernorates": "Sousse, Monastir, Mahdia",
      "hotCategories": ["Beauty, Health & Care", "Home, Kitchen & Living"],
      "actionableDirective": "Target high purchasing power with multi-item bundles above 60 TND."
    },
    {
      "region": "Sfax Hub & Central",
      "targetGovernorates": "Sfax, Kairouan",
      "hotCategories": ["Automotive & Tools", "Electronics & Tech"],
      "actionableDirective": "Focus on high-utility tools with phone confirmation to reduce COD returns."
    }
  ]
}

RULES:
- "seasonalUrgency" must be one of: "Immediate (Peak Wave)", "Ramping Up (Start Sourcing)", "Transition Window".
`;

const STAGE_3_SYSTEM_PROMPT = `You are a Direct-Response E-Commerce Creative Director & Product Blueprint Architect specializing in Tunisian Cash-on-Delivery (COD).
CRITICAL: Respond ONLY with a single valid JSON object conforming to the template below. Start directly with '{'. Do NOT write any introduction, thinking process, reasoning steps, or commentary.

OUTPUT JSON TEMPLATE:
{
  "highConvictionProducts": [
    {
      "id": "prod_1",
      "productName": "Lampe LED Solaire Multifonction",
      "niche": "Home, Kitchen & Living",
      "targetAudience": "Tunisian Homeowners & Commuters",
      "targetRegions": "Grand Tunis, Sahel, Sfax",
      "recommendedPriceTND": 49,
      "estimatedMarginTND": 24,
      "whyItWinsNow": "Seasonal shift creating urgency for backup lighting.",
      "timingRationale": "Autumn transition and storm season.",
      "saturationStatus": "Rising Trend",
      "creativeBlueprint": {
        "format": "Video (Hook-First)",
        "hookDarijaFrench": "الضوء يقص عليك؟ الحل الذكي والنهائي 💡🇹🇳",
        "visualHook3s": "Sudden blackout, instant lighting illuminates the whole room.",
        "ctaAndOffer": "Achetez 1, le 2ème à -50% + Livraison Gratuite"
      },
      "sourcingTip": "Moncef Bey wholesale or Sfax hardware market."
    }
  ],
  "winningAngleDirectives": [
    "Prioritize 24h express delivery in Grand Tunis & Sahel to maximize COD delivery rate.",
    "Offer 2+1 bundles to keep AOV above 60 TND.",
    "Use Darija voiceovers showing unboxing and package inspection."
  ]
}

REQUIREMENTS:
- "highConvictionProducts": Array of 3 to 4 complete product objects conforming to the template above.
- "saturationStatus": Must be EXACTLY one of: "Unsaturated / Blue Ocean", "Moderate Competition", "Rising Trend".
- "format": Must be EXACTLY one of: "Video (Hook-First)", "Carousel (Benefit Story)", "High-Impact Image".
`;

// ---------------------------------------------------------------------------
// PIPELINE RUNNER
// ---------------------------------------------------------------------------

export async function runStage1MiniMax(
  input: OpportunityAiInput,
  correlationId: string
): Promise<StageResult<Stage1NicheAnalysis>> {
  try {
    const response = await callMiniMaxStage({
      systemPrompt: STAGE_1_SYSTEM_PROMPT,
      userJsonPayload: JSON.stringify(input),
      stageName: "stage1_niche_analysis",
      correlationId,
      maxTokens: 1500,
    });

    // Normalize any model variance in scalabilityPotential before schema parsing
    if (response.rawJson && typeof response.rawJson === "object") {
      const rawObj = response.rawJson as Record<string, unknown>;
      if (Array.isArray(rawObj.rankedNiches)) {
        for (const item of rawObj.rankedNiches) {
          if (item && typeof item === "object" && (item as Record<string, unknown>).scalabilityPotential === "Low") {
            (item as Record<string, unknown>).scalabilityPotential = "Selective";
          }
        }
      }
    }

    const parsed = Stage1NicheAnalysisSchema.safeParse(response.rawJson);
    if (!parsed.success) {
      const errMsgs = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      console.warn(`[${correlationId}] Stage 1 validation errors:`, errMsgs);
      console.warn(`[${correlationId}] Stage 1 raw payload was:`, JSON.stringify(response.rawJson).slice(0, 500));
      return {
        ok: false,
        value: null,
        mode: "failed",
        requestedModel: OPPORTUNITY_AI_MODEL,
        returnedModel: response.returnedModel,
        validationErrors: errMsgs,
      };
    }

    return {
      ok: true,
      value: parsed.data,
      mode: "ai",
      requestedModel: OPPORTUNITY_AI_MODEL,
      returnedModel: response.returnedModel,
      validationErrors: [],
    };
  } catch (err: unknown) {
    console.warn(`[${correlationId}] Stage 1 call failed:`, (err as Error)?.message);
    return {
      ok: false,
      value: null,
      mode: "failed",
      requestedModel: OPPORTUNITY_AI_MODEL,
      returnedModel: null,
      validationErrors: [(err as Error)?.message || "Stage 1 call failed"],
    };
  }
}

export async function runStage2MiniMax(
  input: OpportunityAiInput,
  correlationId: string
): Promise<StageResult<Stage2SeasonalityAnalysis>> {
  try {
    const response = await callMiniMaxStage({
      systemPrompt: STAGE_2_SYSTEM_PROMPT,
      userJsonPayload: JSON.stringify(input),
      stageName: "stage2_seasonality_analysis",
      correlationId,
      maxTokens: 1200,
    });

    const parsed = Stage2SeasonalityAnalysisSchema.safeParse(response.rawJson);
    if (!parsed.success) {
      const errMsgs = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      console.warn(`[${correlationId}] Stage 2 validation errors:`, errMsgs);
      console.warn(`[${correlationId}] Stage 2 raw payload was:`, JSON.stringify(response.rawJson).slice(0, 500));
      return {
        ok: false,
        value: null,
        mode: "failed",
        requestedModel: OPPORTUNITY_AI_MODEL,
        returnedModel: response.returnedModel,
        validationErrors: errMsgs,
      };
    }

    return {
      ok: true,
      value: parsed.data,
      mode: "ai",
      requestedModel: OPPORTUNITY_AI_MODEL,
      returnedModel: response.returnedModel,
      validationErrors: [],
    };
  } catch (err: unknown) {
    console.warn(`[${correlationId}] Stage 2 call failed:`, (err as Error)?.message);
    return {
      ok: false,
      value: null,
      mode: "failed",
      requestedModel: OPPORTUNITY_AI_MODEL,
      returnedModel: null,
      validationErrors: [(err as Error)?.message || "Stage 2 call failed"],
    };
  }
}

function normalizeStage3RawJson(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  // Handle case where model wrapped the payload in an outer key
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    return normalizeStage3RawJson(obj.data);
  }

  // Handle case where model returned root-level product array under an alternative key
  if (!obj.highConvictionProducts && Array.isArray(obj.products)) {
    obj.highConvictionProducts = obj.products;
  }

  return obj;
}

export async function runStage3MiniMax(
  input: OpportunityAiInput,
  correlationId: string,
  timeoutMs?: number
): Promise<StageResult<Stage3ProductBlueprints>> {
  try {
    const response = await callMiniMaxStage({
      systemPrompt: STAGE_3_SYSTEM_PROMPT,
      userJsonPayload: JSON.stringify(input),
      stageName: "stage3_product_blueprints",
      correlationId,
      maxTokens: 2000,
      timeoutMs,
    });

    const normalizedJson = normalizeStage3RawJson(response.rawJson);
    const parsed = Stage3ProductBlueprintsSchema.safeParse(normalizedJson);
    if (!parsed.success) {
      const errMsgs = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      console.warn(`[${correlationId}] Stage 3 validation errors:`, errMsgs);
      return {
        ok: false,
        value: null,
        mode: "failed",
        requestedModel: OPPORTUNITY_AI_MODEL,
        returnedModel: response.returnedModel,
        validationErrors: errMsgs,
      };
    }

    return {
      ok: true,
      value: parsed.data,
      mode: "ai",
      requestedModel: OPPORTUNITY_AI_MODEL,
      returnedModel: response.returnedModel,
      validationErrors: [],
    };
  } catch (err: unknown) {
    console.warn(`[${correlationId}] Stage 3 call failed:`, (err as Error)?.message);
    return {
      ok: false,
      value: null,
      mode: "failed",
      requestedModel: OPPORTUNITY_AI_MODEL,
      returnedModel: null,
      validationErrors: [(err as Error)?.message || "Stage 3 call failed"],
    };
  }
}

/**
 * Master multi-stage on-demand pipeline runner.
 * Strictly uses OpenRouter minimax/minimax-m3.1-flash with runtime validation.
 */
export async function generateUnifiedOpportunityReport(
  workspaceId: string,
  options?: { allowOfflineFallback?: boolean }
): Promise<UnifiedOpportunityReport> {
  const pipelineStartTime = Date.now();
  const correlationId = `opp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const allowOffline = options?.allowOfflineFallback ?? (process.env.OPPORTUNITIES_ALLOW_OFFLINE_FALLBACK === "true");

  // Step 1: Telemetry snapshot
  const telemetry = await extractMarketOpportunityTelemetry(workspaceId);
  const seasonalityCtx = calculateTunisianSeasonalityContext();

  const baseInput: Omit<OpportunityAiInput, "stage"> = {
    schemaVersion: OPPORTUNITY_SCHEMA_VERSION,
    locale: { country: "TN", currency: "TND", languages: ["ar-TN", "fr"] },
    telemetryWindow: telemetry.coverage.window,
    dataQuality: {
      hasEnoughDataForInference: telemetry.coverage.hasEnoughDataForInference,
      missingSignals: telemetry.coverage.missingSignals,
    },
    telemetry,
    seasonalityContext: seasonalityCtx,
  };

  const stage1Input: OpportunityAiInput = {
    ...baseInput,
    stage: "niche_analysis",
  };

  const stage2Input: OpportunityAiInput = {
    ...baseInput,
    stage: "seasonality_analysis",
  };

  // Step 2 & 3: Run Stage 1 & Stage 2 in parallel
  const [stage1Res, stage2Res] = await Promise.all([
    runStage1MiniMax(stage1Input, correlationId),
    runStage2MiniMax(stage2Input, correlationId),
  ]);

  let stage1Value = stage1Res.value;
  let stage2Value = stage2Res.value;
  let stage3Value: Stage3ProductBlueprints | null = null;
  let returnedModel: string | null = stage1Res.returnedModel || stage2Res.returnedModel;
  const warnings: string[] = [];

  const aiFailed = !stage1Res.ok || !stage2Res.ok;

  if (aiFailed) {
    if (!allowOffline) {
      const allErrors = [...stage1Res.validationErrors, ...stage2Res.validationErrors].join("; ");
      throw new Error(`[${correlationId}] MiniMax AI analysis failed: ${allErrors}`);
    }

    warnings.push("AI generation failed or validation failed; deterministic rules were used.");
    stage1Value = buildDeterministicStage1(telemetry);
    stage2Value = buildDeterministicStage2(seasonalityCtx);
    stage3Value = buildDeterministicStage3(seasonalityCtx, stage1Value);
  } else {
    // Step 4: Run Stage 3 with validated Stage 1 and Stage 2 inputs, checking remaining time budget
    const elapsedMs = Date.now() - pipelineStartTime;
    const remainingBudgetMs = Math.max(5000, MAX_PIPELINE_TIMEOUT_MS - elapsedMs);

    if (elapsedMs > 50000) {
      if (!allowOffline) {
        throw new Error(
          `[${correlationId}] Pipeline time budget exceeded (${elapsedMs}ms elapsed). Aborted to prevent route timeout.`
        );
      }
      warnings.push("AI Stage 3 skipped due to pipeline time budget; deterministic product blueprints were used.");
      stage3Value = buildDeterministicStage3(seasonalityCtx, stage1Value!);
    } else {
      const stage3Input: OpportunityAiInput = {
        ...baseInput,
        stage: "product_blueprints",
        priorStageResults: {
          nicheAnalysis: stage1Value!,
          seasonalityAnalysis: stage2Value!,
        },
      };

      const stage3Res = await runStage3MiniMax(
        stage3Input,
        correlationId,
        Math.min(25000, remainingBudgetMs)
      );

      if (!stage3Res.ok || !stage3Res.value) {
        if (!allowOffline) {
          throw new Error(
            `[${correlationId}] MiniMax AI Stage 3 failed: ${stage3Res.validationErrors.join("; ")}`
          );
        }
        warnings.push("AI Stage 3 failed; deterministic product blueprints were used.");
        stage3Value = buildDeterministicStage3(seasonalityCtx, stage1Value!);
      } else {
        stage3Value = stage3Res.value;
        if (stage3Res.returnedModel) {
          returnedModel = stage3Res.returnedModel;
        }
      }
    }
  }

  const isFullAi = stage1Res.ok && stage2Res.ok && stage3Value !== null && !aiFailed;
  const generationMode: "ai" | "offline" = isFullAi ? "ai" : "offline";

  const report: UnifiedOpportunityReport = {
    generatedAt: new Date().toISOString(),
    modelUsed: isFullAi ? (returnedModel || OPPORTUNITY_AI_MODEL) : "Deterministic Heuristics",
    marketOpportunityIndex: stage1Value!.marketOpportunityIndex,
    generationMeta: {
      schemaVersion: OPPORTUNITY_SCHEMA_VERSION,
      generationMode,
      requestedModel: OPPORTUNITY_AI_MODEL,
      returnedModel: isFullAi ? returnedModel : null,
      generatedAt: new Date().toISOString(),
      telemetryWindow: telemetry.coverage.window,
      stageStatus: {
        telemetry: telemetry.coverage.observedAdCount > 0 ? "ok" : "empty",
        stage1: stage1Res.ok ? "ai" : "offline",
        stage2: stage2Res.ok ? "ai" : "offline",
        stage3: isFullAi ? "ai" : "offline",
      },
      warnings,
    },
    seasonality: stage2Value!,
    nicheAnalysis: stage1Value!,
    productBlueprints: stage3Value!,
    telemetrySnapshot: telemetry,
    seasonalityContext: seasonalityCtx,
  };

  // Validate entire unified report before returning
  const unifiedParsed = UnifiedOpportunityReportSchema.safeParse(report);
  if (!unifiedParsed.success) {
    const issues = unifiedParsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`[${correlationId}] Final UnifiedOpportunityReport failed validation: ${issues}`);
  }

  return unifiedParsed.data as UnifiedOpportunityReport;
}
