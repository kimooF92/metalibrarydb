import { NextRequest, NextResponse } from "next/server";
import { getScanScheduleStatus } from "@/lib/scan-scheduler";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { validateApiSecret } from "@/lib/api-guard";
import { getCached } from "@/lib/cache-service";
import {
  ScanStepBroadcastPayload,
  ScanBatchSummaryPayload,
  broadcastEngineState,
} from "@/lib/realtime-scan";
import { enqueueAllPagesForRefresh } from "@/worker/db";
import { triggerGitHubWorkflow } from "@/lib/github";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/scan-status
 * Delivers full situational scan telemetry, countdown timer state, active job, and last summary.
 */
export async function GET(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const activeWorkspace = await getActiveWorkspace(req);
    const scheduleStatus = await getScanScheduleStatus(activeWorkspace.id);

    const [activeScan, lastBatchSummary] = await Promise.all([
      getCached<ScanStepBroadcastPayload>("active_scan_job"),
      getCached<ScanBatchSummaryPayload>("last_batch_summary"),
    ]);

    return NextResponse.json({
      success: true,
      ...scheduleStatus,
      activeScan: activeScan || null,
      lastBatchSummary: lastBatchSummary || null,
    });
  } catch (err: any) {
    console.error("[Scan Status API] Failed to fetch scan status:", err);
    return NextResponse.json(
      { error: "Failed to fetch scan status", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scan-status
 * Trigger on-demand batch scan ("Scan Now" button).
 */
export async function POST(req: NextRequest) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const forceAll = searchParams.get("force") === "true";

    // Enqueue pages (0 cooldown if forceAll, else 12h cooldown)
    const enqueued = await enqueueAllPagesForRefresh(forceAll ? 0 : 12);

    // Optionally dispatch GitHub action runner if available
    let githubDispatched = false;
    try {
      const ghRes = await triggerGitHubWorkflow("worker.yml", {
        refresh_all: forceAll ? "true" : "false",
      });
      githubDispatched = Boolean(ghRes);
    } catch {
      // Local runners or manual runners might handle the queue
    }

    // Broadcast state update to all active dashboards
    await broadcastEngineState({
      isPaused: false,
      circuitBreakerTripped: false,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      enqueuedCount: enqueued,
      githubDispatched,
      message: `Enqueued ${enqueued} page(s) for refresh.`,
    });
  } catch (err: any) {
    console.error("[Scan Status API] Failed to trigger scan:", err);
    return NextResponse.json(
      { error: "Failed to trigger scan", details: err?.message },
      { status: 500 }
    );
  }
}
