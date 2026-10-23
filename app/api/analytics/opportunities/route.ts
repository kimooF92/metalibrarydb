import { NextRequest, NextResponse } from "next/server";
import { validateApiSecret } from "@/lib/api-guard";
import { getActiveWorkspace } from "@/lib/workspace-server";
import {
  loadPersistedOpportunityReport,
  savePersistedOpportunityReport,
  generateUnifiedOpportunityReport,
  acquireWorkspaceGenerationLease,
  releaseWorkspaceGenerationLease,
} from "@/lib/opportunities";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// Single-flight in-memory concurrency guard per workspace
const activeGenerations = new Set<string>();

/**
 * GET: Fetch the saved opportunity report for the active workspace.
 * Strictly read-only. NEVER generates a report or calls OpenRouter.
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const saved = await loadPersistedOpportunityReport(activeWorkspace.id);

    return NextResponse.json(
      {
        report: saved,
        exists: saved !== null,
        workspaceId: activeWorkspace.id,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error: unknown) {
    console.error("[Opportunities API GET Error]:", error);
    return NextResponse.json(
      { error: "Failed to read opportunity report", report: null, exists: false },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}

/**
 * POST: Strictly explicit user-triggered generation of a fresh multi-stage AI report.
 * Guaranteed single-flight per workspace, scoped and validated against Zod schemas.
 */
export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  const correlationId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let workspaceId: string | null = null;
  let lockAcquiredInMemory = false;
  let leaseAcquiredInDb = false;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    workspaceId = activeWorkspace.id;

    // 1. Process-local fast-path concurrency check
    if (activeGenerations.has(workspaceId)) {
      return NextResponse.json(
        {
          error: "An opportunity analysis is already in progress for this workspace. Please wait.",
          correlationId,
        },
        { status: 429 }
      );
    }

    // 2. Distributed cross-process / serverless atomic lease
    const leaseGranted = await acquireWorkspaceGenerationLease(workspaceId);
    if (!leaseGranted) {
      return NextResponse.json(
        {
          error: "An opportunity analysis is already running for this workspace across server instances. Please wait.",
          correlationId,
        },
        { status: 429 }
      );
    }

    leaseAcquiredInDb = true;
    activeGenerations.add(workspaceId);
    lockAcquiredInMemory = true;

    // Run multi-stage AI pipeline
    const report = await generateUnifiedOpportunityReport(workspaceId);

    // Atomically persist to dedicated opportunity_reports table
    await savePersistedOpportunityReport(workspaceId, report);
    leaseAcquiredInDb = false; // Successfully saved as ready

    return NextResponse.json({
      report,
      exists: true,
      workspaceId,
      correlationId,
    });
  } catch (error: unknown) {
    console.error(`[Opportunities API POST Error ${correlationId}]:`, error);
    return NextResponse.json(
      {
        error: "Failed to generate market opportunities",
        correlationId,
        message: (error as Error)?.message || "An unexpected error occurred during analysis.",
      },
      { status: 500 }
    );
  } finally {
    if (lockAcquiredInMemory && workspaceId) {
      activeGenerations.delete(workspaceId);
    }
    if (leaseAcquiredInDb && workspaceId) {
      await releaseWorkspaceGenerationLease(workspaceId);
    }
  }
}
