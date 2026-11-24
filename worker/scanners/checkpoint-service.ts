import fs from "fs";
import path from "path";
import type { ExtractedAdData } from "./scanner-types";

const CHECKPOINT_DIR = path.join(process.cwd(), ".cache", "scans");
const STALE_CHECKPOINT_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the sanitized local JSONL checkpoint file path for a creative scan.
 */
export function getCheckpointPath(scanId: string): string {
  const safeId = scanId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CHECKPOINT_DIR, `${safeId}.jsonl`);
}

/**
 * Deletes stale `.jsonl` checkpoint files older than `maxAgeMs` (default 24h)
 * left behind by killed processes or failed batch dispatches.
 */
export function sweepStaleCheckpoints(maxAgeMs: number = STALE_CHECKPOINT_AGE_MS): number {
  if (!fs.existsSync(CHECKPOINT_DIR)) return 0;

  let removed = 0;
  const now = Date.now();
  try {
    const entries = fs.readdirSync(CHECKPOINT_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const fullPath = path.join(CHECKPOINT_DIR, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
          removed++;
        }
      } catch {
        // Ignore transient per-file stat/unlink failures
      }
    }
  } catch {
    // Ignore directory read errors
  }
  return removed;
}

/**
 * Initializes the checkpoint directory, sweeps stale files, and resets any
 * existing checkpoint for `scanId`.
 */
export function initScanCheckpoint(scanId: string): string {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  sweepStaleCheckpoints();

  const filePath = getCheckpointPath(scanId);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Best-effort reset
    }
  }
  return filePath;
}

/**
 * Synchronously appends extracted ad items as newline-delimited JSON so
 * concurrent response handlers cannot interleave across await boundaries.
 */
export function appendScanCheckpoint(scanId: string, ads: ExtractedAdData[]): number {
  if (ads.length === 0) return 0;

  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  const filePath = getCheckpointPath(scanId);
  const payload = ads.map((ad) => JSON.stringify(ad)).join("\n") + "\n";
  fs.appendFileSync(filePath, payload, "utf8");
  return ads.length;
}

function hydrateDateValue(raw: unknown): Date | null {
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === "string" || typeof raw === "number") {
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Reads checkpointed ads from disk, skipping malformed/truncated lines (e.g.
 * from a mid-write SIGKILL), deduplicating by `adArchiveId`, and reviving
 * serialized `startedRunningOn` timestamps back into `Date` objects.
 */
export function readScanCheckpoint(scanId: string): {
  ads: ExtractedAdData[];
  skippedCorruptLines: number;
} {
  const filePath = getCheckpointPath(scanId);
  if (!fs.existsSync(filePath)) {
    return { ads: [], skippedCorruptLines: 0 };
  }

  const rawText = fs.readFileSync(filePath, "utf8");
  const lines = rawText.split(/\r?\n/);
  const deduped = new Map<string, ExtractedAdData>();
  let skippedCorruptLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || typeof parsed.adArchiveId !== "string" || !parsed.adArchiveId) {
        skippedCorruptLines++;
        continue;
      }

      const hydrated: ExtractedAdData = {
        ...parsed,
        startedRunningOn: hydrateDateValue(parsed.startedRunningOn),
        mediaUrls: Array.isArray(parsed.mediaUrls) ? parsed.mediaUrls : [],
        secondaryProductUrls: Array.isArray(parsed.secondaryProductUrls)
          ? parsed.secondaryProductUrls
          : undefined,
      };

      deduped.set(hydrated.adArchiveId, hydrated);
    } catch {
      skippedCorruptLines++;
    }
  }

  return {
    ads: Array.from(deduped.values()),
    skippedCorruptLines,
  };
}

/**
 * Removes the checkpoint file once ads have been safely ingested.
 */
export function cleanupScanCheckpoint(scanId: string): void {
  const filePath = getCheckpointPath(scanId);
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Non-fatal cleanup error
  }
}
