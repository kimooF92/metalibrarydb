import { NextRequest, NextResponse } from "next/server";
import { generateAiMarketForecast, MarketForecastData } from "@/lib/market-forecaster";
import { validateApiSecret } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// In-memory persistent cache for forecast results (never auto-expires unless manually re-run)
let savedForecast: MarketForecastData | null = null;

/**
 * GET: Fetch the latest generated forecast (0 OpenRouter tokens consumed)
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  return NextResponse.json({
    forecast: savedForecast,
    exists: savedForecast !== null,
  });
}

/**
 * POST: Explicit user trigger to generate a fresh forecast with DeepSeek on OpenRouter
 */
export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const forecast = await generateAiMarketForecast();
    savedForecast = forecast;

    return NextResponse.json({
      forecast,
      exists: true,
    });
  } catch (error: any) {
    console.error("[Forecast Generation Error]:", error);
    return NextResponse.json(
      { error: "Failed to generate market forecast", details: error.message },
      { status: 500 }
    );
  }
}
