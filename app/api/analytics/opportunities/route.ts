import { NextRequest, NextResponse } from "next/server";
import { generateFullOpportunityReport, UnifiedOpportunityReport } from "@/lib/opportunity-seeker";
import { validateApiSecret } from "@/lib/api-guard";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const CACHE_DIR = path.join(process.cwd(), ".data");
const CACHE_FILE = path.join(CACHE_DIR, "saved-opportunity-report.json");

// In-memory caching layer
let inMemoryReport: UnifiedOpportunityReport | null = null;

async function loadPersistedReport(): Promise<UnifiedOpportunityReport | null> {
  if (inMemoryReport) return inMemoryReport;
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
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(report, null, 2), "utf-8");
  } catch (err) {
    console.error("[Opportunity Report Cache Write Error]:", err);
  }
}

/**
 * GET: Fetch the saved opportunity report from persistent storage ($0 tokens consumed)
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  const saved = await loadPersistedReport();

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
