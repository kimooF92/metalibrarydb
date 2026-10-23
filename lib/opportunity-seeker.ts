import {
  generateUnifiedOpportunityReport,
  extractMarketOpportunityTelemetry as extractTelemetry,
  calculateTunisianSeasonalityContext as calcSeasonality,
  loadPersistedOpportunityReport,
  savePersistedOpportunityReport,
} from "./opportunities";
import type {
  UnifiedOpportunityReport,
  MarketOpportunityTelemetry,
  TunisianSeasonalityContext,
  Stage1NicheAnalysis,
  Stage2SeasonalityAnalysis,
  Stage3ProductBlueprints,
  NicheOpportunityScorecard,
  HighConvictionProductOpportunity,
} from "./opportunities";

export * from "./opportunities";

const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Backward compatibility wrapper for extracting telemetry.
 */
export async function extractMarketOpportunityTelemetry(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<MarketOpportunityTelemetry> {
  return extractTelemetry(workspaceId);
}

/**
 * Backward compatibility wrapper for calculating seasonality.
 */
export function calculateTunisianSeasonalityContext(
  referenceDate: Date = new Date()
): TunisianSeasonalityContext {
  return calcSeasonality(referenceDate);
}

/**
 * Backward compatibility wrapper for generating the full report.
 * Strictly uses the new MiniMax-targeted, schema-validated pipeline.
 */
export async function generateFullOpportunityReport(
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<UnifiedOpportunityReport> {
  const report = await generateUnifiedOpportunityReport(workspaceId, {
    allowOfflineFallback: true,
  });
  return report;
}
