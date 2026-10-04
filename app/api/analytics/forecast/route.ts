import { NextRequest, NextResponse } from "next/server";
import { generateAiMarketForecast, MarketOpportunityResearch } from "@/lib/market-forecaster";
import { validateApiSecret } from "@/lib/api-guard";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const CACHE_DIR = path.join(process.cwd(), ".data");

// In-memory memory layer keyed by workspaceId
const inMemoryForecasts = new Map<string, MarketOpportunityResearch>();

function getCacheFilePath(workspaceId: string) {
  return path.join(CACHE_DIR, `saved-market-forecast-${workspaceId}.json`);
}

async function loadPersistedForecast(workspaceId: string): Promise<MarketOpportunityResearch | null> {
  if (inMemoryForecasts.has(workspaceId)) {
    return inMemoryForecasts.get(workspaceId)!;
  }

  // 1. Try Loading from Supabase PostgreSQL (Persistent across cold starts)
  try {
    const [settings] = await db
      .select({ savedMarketForecast: appSettings.savedMarketForecast })
      .from(appSettings)
      .where(eq(appSettings.id, "default"))
      .limit(1);

    if (settings?.savedMarketForecast) {
      const raw = settings.savedMarketForecast as any;
      if (raw && typeof raw === "object" && raw[workspaceId]) {
        inMemoryForecasts.set(workspaceId, raw[workspaceId]);
        return raw[workspaceId];
      }
      // If legacy un-keyed format and we're querying default workspace (Tunisia)
      if (raw && typeof raw === "object" && raw.marketHealthScore !== undefined) {
        if (workspaceId === "00000000-0000-0000-0000-000000000001") {
          inMemoryForecasts.set(workspaceId, raw as MarketOpportunityResearch);
          return raw as MarketOpportunityResearch;
        }
      }
    }
  } catch (dbErr) {
    console.warn("[Forecast DB Read Notice]:", dbErr);
  }

  // 2. Fallback to Local Filesystem Cache
  try {
    const data = await fs.readFile(getCacheFilePath(workspaceId), "utf-8");
    const parsed = JSON.parse(data) as MarketOpportunityResearch;
    inMemoryForecasts.set(workspaceId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function savePersistedForecast(workspaceId: string, forecast: MarketOpportunityResearch) {
  inMemoryForecasts.set(workspaceId, forecast);

  // 1. Save to Supabase PostgreSQL (keyed by workspaceId)
  try {
    const [current] = await db
      .select({ savedMarketForecast: appSettings.savedMarketForecast })
      .from(appSettings)
      .where(eq(appSettings.id, "default"))
      .limit(1);

    let currentMap: Record<string, any> = {};
    if (current?.savedMarketForecast && typeof current.savedMarketForecast === "object") {
      const raw = current.savedMarketForecast as any;
      if (raw.marketHealthScore !== undefined) {
        currentMap = { "00000000-0000-0000-0000-000000000001": raw };
      } else {
        currentMap = { ...raw };
      }
    }
    currentMap[workspaceId] = forecast;

    await db
      .update(appSettings)
      .set({
        savedMarketForecast: currentMap as any,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, "default"));
  } catch (dbErr) {
    console.error("[Forecast DB Write Error]:", dbErr);
  }

  // 2. Secondary Local Filesystem Cache
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(getCacheFilePath(workspaceId), JSON.stringify(forecast, null, 2), "utf-8");
  } catch (err) {
    console.error("[Forecast File Cache Write Error]:", err);
  }
}

/**
 * GET: Fetch the saved forecast for the active workspace.
 * If no forecast exists yet or ?auto=true is passed, automatically generates live AI forecast.
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  const activeWorkspace = await getActiveWorkspace(req);
  const { searchParams } = new URL(req.url);
  const autoGenerate = searchParams.get("auto") === "true";

  let saved = await loadPersistedForecast(activeWorkspace.id);

  // If no forecast exists yet, or autoGenerate requested, run AI generator automatically
  if (!saved && autoGenerate) {
    try {
      saved = await generateAiMarketForecast(activeWorkspace.id);
      await savePersistedForecast(activeWorkspace.id, saved);
    } catch (err: any) {
      console.error("[Auto Forecast Generation Error]:", err);
    }
  }

  return NextResponse.json({
    forecast: saved,
    exists: saved !== null,
  });
}

/**
 * POST: Explicit user trigger to generate a fresh forecast for active workspace
 */
export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const forecast = await generateAiMarketForecast(activeWorkspace.id);
    await savePersistedForecast(activeWorkspace.id, forecast);

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
