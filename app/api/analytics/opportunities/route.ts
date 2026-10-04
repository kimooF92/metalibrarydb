import { NextRequest, NextResponse } from "next/server";
import { generateFullOpportunityReport, UnifiedOpportunityReport } from "@/lib/opportunity-seeker";
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
const inMemoryReports = new Map<string, UnifiedOpportunityReport>();

function getCacheFilePath(workspaceId: string) {
  return path.join(CACHE_DIR, `saved-opportunity-report-${workspaceId}.json`);
}

async function loadPersistedReport(workspaceId: string): Promise<UnifiedOpportunityReport | null> {
  if (inMemoryReports.has(workspaceId)) {
    return inMemoryReports.get(workspaceId)!;
  }

  // 1. Try Loading from Supabase PostgreSQL (Persistent across cold starts)
  try {
    const [settings] = await db
      .select({ savedOpportunityReport: appSettings.savedOpportunityReport })
      .from(appSettings)
      .where(eq(appSettings.id, "default"))
      .limit(1);

    if (settings?.savedOpportunityReport) {
      const raw = settings.savedOpportunityReport as any;
      if (raw && typeof raw === "object" && raw[workspaceId]) {
        inMemoryReports.set(workspaceId, raw[workspaceId]);
        return raw[workspaceId];
      }
      // If legacy un-keyed format and we're querying default workspace (Tunisia)
      if (raw && typeof raw === "object" && raw.marketOpportunityIndex !== undefined) {
        if (workspaceId === "00000000-0000-0000-0000-000000000001") {
          inMemoryReports.set(workspaceId, raw as UnifiedOpportunityReport);
          return raw as UnifiedOpportunityReport;
        }
      }
    }
  } catch (dbErr) {
    console.warn("[Opportunity Report DB Read Notice]:", dbErr);
  }

  // 2. Fallback to Local Filesystem Cache
  try {
    const data = await fs.readFile(getCacheFilePath(workspaceId), "utf-8");
    const parsed = JSON.parse(data) as UnifiedOpportunityReport;
    inMemoryReports.set(workspaceId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function savePersistedReport(workspaceId: string, report: UnifiedOpportunityReport) {
  inMemoryReports.set(workspaceId, report);

  // 1. Save to Supabase PostgreSQL (keyed by workspaceId)
  try {
    const [current] = await db
      .select({ savedOpportunityReport: appSettings.savedOpportunityReport })
      .from(appSettings)
      .where(eq(appSettings.id, "default"))
      .limit(1);

    let currentMap: Record<string, any> = {};
    if (current?.savedOpportunityReport && typeof current.savedOpportunityReport === "object") {
      const raw = current.savedOpportunityReport as any;
      if (raw.marketOpportunityIndex !== undefined) {
        // legacy root
        currentMap = { "00000000-0000-0000-0000-000000000001": raw };
      } else {
        currentMap = { ...raw };
      }
    }
    currentMap[workspaceId] = report;

    await db
      .update(appSettings)
      .set({
        savedOpportunityReport: currentMap as any,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, "default"));
  } catch (dbErr) {
    console.error("[Opportunity Report DB Write Error]:", dbErr);
  }

  // 2. Secondary Local Filesystem Cache
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(getCacheFilePath(workspaceId), JSON.stringify(report, null, 2), "utf-8");
  } catch (err) {
    console.error("[Opportunity Report File Cache Write Error]:", err);
  }
}

/**
 * GET: Fetch the saved opportunity report for active workspace.
 * If no report exists yet or ?auto=true is passed, automatically generates live AI report.
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  const activeWorkspace = await getActiveWorkspace(req);
  const { searchParams } = new URL(req.url);
  const autoGenerate = searchParams.get("auto") === "true";

  let saved = await loadPersistedReport(activeWorkspace.id);

  // If no report exists yet, or autoGenerate requested, run multi-stage AI generator automatically
  if (!saved && autoGenerate) {
    try {
      saved = await generateFullOpportunityReport(activeWorkspace.id);
      await savePersistedReport(activeWorkspace.id, saved);
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
 * POST: Explicit user trigger to generate fresh multi-stage AI opportunity report for active workspace
 */
export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const report = await generateFullOpportunityReport(activeWorkspace.id);
    await savePersistedReport(activeWorkspace.id, report);

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
