import { NextRequest, NextResponse } from "next/server";
import { generateAiMarketForecast, MarketOpportunityResearch } from "@/lib/market-forecaster";
import { validateApiSecret } from "@/lib/api-guard";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const CACHE_DIR = path.join(process.cwd(), ".data");
const CACHE_FILE = path.join(CACHE_DIR, "saved-market-forecast.json");

// In-memory memory layer
let inMemoryForecast: MarketOpportunityResearch | null = null;

async function loadPersistedForecast(): Promise<MarketOpportunityResearch | null> {
  if (inMemoryForecast) return inMemoryForecast;
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    inMemoryForecast = JSON.parse(data) as MarketOpportunityResearch;
    return inMemoryForecast;
  } catch {
    return null;
  }
}

async function savePersistedForecast(forecast: MarketOpportunityResearch) {
  inMemoryForecast = forecast;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(forecast, null, 2), "utf-8");
  } catch (err) {
    console.error("[Forecast Cache Write Error]:", err);
  }
}

/**
 * GET: Fetch the saved forecast from persistent storage ($0 OpenRouter tokens consumed)
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  const saved = await loadPersistedForecast();

  return NextResponse.json({
    forecast: saved,
    exists: saved !== null,
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
    await savePersistedForecast(forecast);

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
