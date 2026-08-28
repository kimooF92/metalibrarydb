import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { generateFullOpportunityReport, extractMarketOpportunityTelemetry, calculateTunisianSeasonalityContext } from "@/lib/opportunity-seeker";

async function main() {
  console.log("=== Testing Tunisian Seasonality Calculator ===");
  const seasonalityCtx = calculateTunisianSeasonalityContext();
  console.log("Current Window:", seasonalityCtx.activeSeasonalWindow);
  console.log("Upcoming Events:", seasonalityCtx.upcomingKeyEvents.map(e => `${e.eventName} in ${e.daysRemaining}d`));

  console.log("\n=== Testing Market Telemetry Extraction ===");
  const telemetry = await extractMarketOpportunityTelemetry();
  console.log("Active Ads:", telemetry.totalActiveAds);
  console.log("Scaling Brands:", telemetry.scalingBrandsCount, `(+${telemetry.totalAdsScaled} ads)`);
  console.log("Descaling Brands:", telemetry.descalingBrandsCount, `(-${telemetry.totalAdsDescaled} ads)`);
  console.log("Video %:", telemetry.videoPercent);
  console.log("Categories Found:", telemetry.categoryBreakdown.length);
  console.log("Top Cloned Products:", telemetry.topClonedProducts.length);

  console.log("\n=== Testing Full Multi-Prompt Opportunity Generation ===");
  const start = Date.now();
  const report = await generateFullOpportunityReport();
  const duration = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`Generated report in ${duration}s using model: ${report.modelUsed}`);
  console.log("Market Opportunity Index:", report.marketOpportunityIndex);
  console.log("Ranked Niches Count:", report.nicheAnalysis.rankedNiches.length);
  console.log("High Conviction Products Count:", report.productBlueprints.highConvictionProducts.length);

  console.log("\nSample Product Blueprint 1:");
  console.log(JSON.stringify(report.productBlueprints.highConvictionProducts[0], null, 2));

  console.log("\nSample Regional Demand Strategy 1:");
  console.log(JSON.stringify(report.seasonality.regionalDemandStrategy[0], null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
