import { NextRequest, NextResponse } from "next/server";
import { generateFullOpportunityReport, UnifiedOpportunityReport } from "@/lib/opportunity-seeker";
import { validateApiSecret } from "@/lib/api-guard";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const CACHE_DIR = path.join(process.cwd(), ".data");
const CACHE_FILE = path.join(CACHE_DIR, "saved-opportunity-report.json");

// In-memory memory layer
let inMemoryReport: UnifiedOpportunityReport | null = null;

async function loadPersistedReport(): Promise<UnifiedOpportunityReport | null> {
  if (inMemoryReport) return inMemoryReport;

  // 1. Try Loading from Supabase PostgreSQL (Persistent across cold starts)
  try {
    const [settings] = await db
      .select({ savedOpportunityReport: appSettings.savedOpportunityReport })
      .from(appSettings)
      .where(eq(appSettings.id, "default"))
      .limit(1);

    if (settings?.savedOpportunityReport) {
      inMemoryReport = settings.savedOpportunityReport as UnifiedOpportunityReport;
      return inMemoryReport;
    }
  } catch (dbErr) {
    console.warn("[Opportunity Report DB Read Notice]:", dbErr);
  }

  // 2. Fallback to Local Filesystem Cache
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    inMemoryReport = JSON.parse(data) as UnifiedOpportunityReport;
    return inMemoryReport;
  } catch {
    return null;
  }
}

async function savePersistedReport(report: UnifiedOpportunityReport) {
  inMemoryReport = report;

  // 1. Save to Supabase PostgreSQL
  try {
    await db
      .update(appSettings)
      .set({
        savedOpportunityReport: report as any,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, "default"));
  } catch (dbErr) {
    console.error("[Opportunity Report DB Write Error]:", dbErr);
  }

  // 2. Secondary Local Filesystem Cache
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(report, null, 2), "utf-8");
  } catch (err) {
    console.error("[Opportunity Report File Cache Write Error]:", err);
  }
}

/**
 * GET: Fetch the saved opportunity report from persistent database/cache.
 * If no report exists yet or ?auto=true is passed, automatically generates live AI report.
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const autoGenerate = searchParams.get("auto") === "true";

  let saved = await loadPersistedReport();

  // If no report exists yet, or autoGenerate requested, run multi-stage AI generator automatically
  if (!saved && autoGenerate) {
    try {
      saved = await generateFullOpportunityReport();
      await savePersistedReport(saved);
    } catch (err: any) {
      console.error("[Auto Opportunity Generation Error]:", err);
    }
  }

  return NextResponse.json({
    report: saved,
    exists: saved !== null,
  });
}

/**
 * POST: Explicit user trigger to generate fresh multi-stage AI opportunity report
 */
export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const report = await generateFullOpportunityReport();
    await savePersistedReport(report);

    return NextResponse.json({
      report,
      exists: true,
    });
  } catch (error: any) {
    console.error("[Opportunity Seeker Generation Error]:", error);
    return NextResponse.json(
      { error: "Failed to generate opportunity report", details: error.message },
      { status: 500 }
    );
  }
}
