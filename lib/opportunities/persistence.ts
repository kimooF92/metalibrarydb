import { db } from "@/db";
import { opportunityReports, appSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { OPPORTUNITY_SCHEMA_VERSION, OPPORTUNITY_AI_MODEL } from "./constants";
import { UnifiedOpportunityReport } from "./types";
import { UnifiedOpportunityReportSchema } from "./schemas";

const MAX_REPORT_SIZE_BYTES = 500 * 1024; // 500 KB limit for report json

/**
 * Loads the persisted opportunity report for a given workspace.
 * Queries the dedicated opportunity_reports table.
 * Falls back to legacy app_settings during migration if no dedicated row exists.
 */
export async function loadPersistedOpportunityReport(
  workspaceId: string
): Promise<UnifiedOpportunityReport | null> {
  if (!workspaceId) return null;

  try {
    // 1. Dedicated workspace-keyed opportunity_reports table
    const [row] = await db
      .select({
        reportJson: opportunityReports.reportJson,
        status: opportunityReports.status,
      })
      .from(opportunityReports)
      .where(eq(opportunityReports.workspaceId, workspaceId))
      .limit(1);

    if (row && row.status === "ready" && row.reportJson) {
      const parsed = row.reportJson as Record<string, unknown>;
      const validation = UnifiedOpportunityReportSchema.safeParse(parsed);
      if (validation.success) {
        return validation.data as UnifiedOpportunityReport;
      }
      console.warn("[loadPersistedOpportunityReport] Report in DB failed schema validation, skipping corrupt data.");
      return null;
    }
  } catch (err) {
    console.warn("[loadPersistedOpportunityReport] DB read error:", err);
  }

  // 2. Legacy fallback from app_settings during migration period
  try {
    const [settings] = await db
      .select({ savedOpportunityReport: appSettings.savedOpportunityReport })
      .from(appSettings)
      .where(eq(appSettings.id, "default"))
      .limit(1);

    if (settings?.savedOpportunityReport) {
      const raw = settings.savedOpportunityReport as Record<string, unknown>;
      if (raw && typeof raw === "object") {
        let legacyCandidate: unknown = null;
        if (raw[workspaceId]) {
          legacyCandidate = raw[workspaceId];
        } else if (raw.marketOpportunityIndex !== undefined && workspaceId === "00000000-0000-0000-0000-000000000001") {
          legacyCandidate = raw;
        }

        if (legacyCandidate) {
          const validation = UnifiedOpportunityReportSchema.safeParse(legacyCandidate);
          if (validation.success) {
            return validation.data as UnifiedOpportunityReport;
          }
          console.warn("[loadPersistedOpportunityReport] Legacy report failed schema validation, skipping corrupt data.");
        }
      }
    }
  } catch (legacyErr) {
    console.warn("[loadPersistedOpportunityReport] Legacy read notice:", legacyErr);
  }

  return null;
}

/**
 * Atomically saves or updates the opportunity report for a given workspace.
 * Performs an atomic upsert on conflict (workspace_id).
 */
export async function savePersistedOpportunityReport(
  workspaceId: string,
  report: UnifiedOpportunityReport
): Promise<void> {
  if (!workspaceId) {
    throw new Error("workspaceId is required to persist an opportunity report.");
  }

  const serialized = JSON.stringify(report);
  if (Buffer.byteLength(serialized, "utf-8") > MAX_REPORT_SIZE_BYTES) {
    throw new Error(`Report exceeds size limit of ${MAX_REPORT_SIZE_BYTES} bytes.`);
  }

  const generatedAt = new Date(report.generatedAt);
  const telemetryStart = new Date(report.generationMeta.telemetryWindow.start);
  const telemetryEnd = new Date(report.generationMeta.telemetryWindow.end);

  await db
    .insert(opportunityReports)
    .values({
      workspaceId,
      reportJson: report,
      schemaVersion: report.generationMeta.schemaVersion || OPPORTUNITY_SCHEMA_VERSION,
      generationMode: report.generationMeta.generationMode,
      requestedModel: report.generationMeta.requestedModel,
      returnedModel: report.generationMeta.returnedModel,
      generatedAt,
      telemetryStart,
      telemetryEnd,
      status: "ready",
      errorCode: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: opportunityReports.workspaceId,
      set: {
        reportJson: report,
        schemaVersion: report.generationMeta.schemaVersion || OPPORTUNITY_SCHEMA_VERSION,
        generationMode: report.generationMeta.generationMode,
        requestedModel: report.generationMeta.requestedModel,
        returnedModel: report.generationMeta.returnedModel,
        generatedAt,
        telemetryStart,
        telemetryEnd,
        status: "ready",
        errorCode: null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Deletes the persisted opportunity report row for a workspace (or all workspaces if omitted).
 */
export async function clearPersistedOpportunityReports(workspaceId?: string): Promise<void> {
  try {
    if (workspaceId) {
      await db.delete(opportunityReports).where(eq(opportunityReports.workspaceId, workspaceId));
    } else {
      await db.delete(opportunityReports);
    }
  } catch (err) {
    console.warn("[clearPersistedOpportunityReports] DB delete error:", err);
  }
}

/**
 * Attempts to acquire an atomic distributed generation lease on a workspace.
 * Returns true if the lease was acquired, or false if an active generation is already underway.
 * Automatically clears abandoned leases older than 3 minutes.
 */
export async function acquireWorkspaceGenerationLease(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false;

  try {
    const result = await db.execute<{ workspace_id: string }>(sql`
      INSERT INTO opportunity_reports (
        workspace_id,
        status,
        updated_at,
        report_json,
        schema_version,
        generation_mode,
        requested_model
      )
      VALUES (
        ${workspaceId}::uuid,
        'generating',
        NOW(),
        '{}'::jsonb,
        ${OPPORTUNITY_SCHEMA_VERSION},
        'ai',
        ${OPPORTUNITY_AI_MODEL}
      )
      ON CONFLICT (workspace_id) DO UPDATE
      SET 
        status = 'generating',
        updated_at = NOW()
      WHERE opportunity_reports.status != 'generating'
         OR opportunity_reports.updated_at < NOW() - INTERVAL '3 minutes'
      RETURNING workspace_id;
    `);

    return result.length > 0;
  } catch (err) {
    console.warn("[acquireWorkspaceGenerationLease] Lease check error:", err);
    // On unexpected DB connection glitch, allow request to proceed guarded by in-memory lock
    return true;
  }
}

/**
 * Releases the workspace generation lease if generation failed or was aborted before saving.
 */
export async function releaseWorkspaceGenerationLease(workspaceId: string): Promise<void> {
  if (!workspaceId) return;

  try {
    await db.execute(sql`
      UPDATE opportunity_reports
      SET status = 'failed', updated_at = NOW()
      WHERE workspace_id = ${workspaceId}::uuid
        AND status = 'generating';
    `);
  } catch (err) {
    console.warn("[releaseWorkspaceGenerationLease] Error releasing lease:", err);
  }
}
