import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ads, adTranscripts, adObservations, trackedPages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { validateApiSecret } from "@/lib/api-guard";
import { getActiveWorkspace } from "@/lib/workspace-server";
import { getCached, setCached, acquireLockDetailed, forceReleaseLock } from "@/lib/cache-service";
import { isQStashConfigured } from "@/lib/qstash";
import { enqueueAdTranscription, executeTranscriptionOnInstaBox } from "@/lib/transcription-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/spy/ads/[id]/transcription-jobs
 * Fetches the transcript status and result for a specific ad.
 * Reads through Upstash Redis L2 cache first (0 DB egress), falling back to PostgreSQL.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  const { id: adId } = await params;
  if (!adId) {
    return NextResponse.json({ error: "Missing ad id" }, { status: 400 });
  }

  const activeWorkspace = await getActiveWorkspace(req);
  const cacheKey = `cache:transcript:${adId}`;

  // 1. Check L2 Redis cache first (0 Supabase DB egress)
  const cached = await getCached<any>(cacheKey);
  if (cached) {
    return NextResponse.json({
      status: cached.status || "completed",
      source: "cache",
      transcript: cached,
    });
  }

  // 2. Query DB with strict lean projection (never SELECT *)
  const [record] = await db
    .select({
      id: adTranscripts.id,
      adId: adTranscripts.adId,
      status: adTranscripts.status,
      language: adTranscripts.language,
      languageConfidence: adTranscripts.languageConfidence,
      fullText: adTranscripts.fullText,
      hookText: adTranscripts.hookText,
      words: adTranscripts.words,
      segments: adTranscripts.segments,
      durationSeconds: adTranscripts.durationSeconds,
      isTruncated: adTranscripts.isTruncated,
      errorCode: adTranscripts.errorCode,
      errorMessage: adTranscripts.errorMessage,
      createdAt: adTranscripts.createdAt,
      updatedAt: adTranscripts.updatedAt,
    })
    .from(adTranscripts)
    .where(eq(adTranscripts.adId, adId))
    .limit(1);

  if (!record) {
    return NextResponse.json({ status: "none", message: "No transcription found" }, { status: 404 });
  }

  // If completed, cache in Redis for 7 days
  if (record.status === "completed" && record.fullText) {
    await setCached(cacheKey, record, 7 * 86400).catch(() => {});
  }

  return NextResponse.json({
    status: record.status,
    source: "db",
    transcript: record,
  });
}

/**
 * POST /api/spy/ads/[id]/transcription-jobs
 * Enqueues or starts an on-demand transcription for a video ad.
 * Protects against race conditions with distributed Redis locks.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await validateApiSecret(req);
  if (authError) return authError;

  const { id: adId } = await params;
  if (!adId) {
    return NextResponse.json({ error: "Missing ad id" }, { status: 400 });
  }

  const activeWorkspace = await getActiveWorkspace(req);

  // 1. Verify workspace authorization and resolve video ad details
  const [adRecord] = await db
    .select({
      id: ads.id,
      mediaType: ads.mediaType,
      mediaHash: ads.mediaHash,
      mediaUrls: ads.mediaUrls,
    })
    .from(ads)
    .innerJoin(adObservations, eq(adObservations.adId, ads.id))
    .innerJoin(trackedPages, eq(trackedPages.id, adObservations.trackedPageId))
    .where(
      and(
        eq(ads.id, adId),
        eq(trackedPages.workspaceId, activeWorkspace.id)
      )
    )
    .limit(1);

  if (!adRecord) {
    return NextResponse.json({ error: "Ad not found or unauthorized in this workspace" }, { status: 404 });
  }

  if (adRecord.mediaType !== "video" && (!adRecord.mediaUrls || adRecord.mediaUrls.length === 0)) {
    return NextResponse.json({ error: "Ad creative is not a video or has no media URLs" }, { status: 400 });
  }

  const videoUrl = adRecord.mediaUrls?.[0];
  if (!videoUrl) {
    return NextResponse.json({ error: "Video URL not found on ad record" }, { status: 400 });
  }

  const mediaHash = adRecord.mediaHash || `hash_${adId.slice(0, 8)}`;
  const modelVersion = "faster-whisper-turbo-int8-v1";
  const lockKey = `lock:transcribe:${adId}`;

  // 2. Check if already completed in DB or Redis
  const cached = await getCached<any>(`cache:transcript:${adId}`);
  if (cached && (cached.status === "completed" || cached.status === "no_speech")) {
    return NextResponse.json({
      status: cached.status,
      source: "cache",
      jobId: cached.id,
      transcript: cached,
    });
  }

  const [existing] = await db
    .select({ id: adTranscripts.id, status: adTranscripts.status })
    .from(adTranscripts)
    .where(
      and(
        eq(adTranscripts.adId, adId),
        eq(adTranscripts.mediaHash, mediaHash),
        eq(adTranscripts.modelVersion, modelVersion)
      )
    )
    .limit(1);

  if (existing && (existing.status === "completed" || existing.status === "processing")) {
    return NextResponse.json({ jobId: existing.id, status: existing.status }, { status: 200 });
  }

  // 3. Acquire distributed Redis lock to prevent double-click stampedes
  const lockResult = await acquireLockDetailed(lockKey, 60);
  if (!lockResult.acquired) {
    return NextResponse.json(
      { jobId: existing?.id, status: "processing", message: "Transcription is already in progress" },
      { status: 202 }
    );
  }

  // 4. Upsert processing record in DB
  const [job] = await db
    .insert(adTranscripts)
    .values({
      adId,
      mediaHash,
      modelVersion,
      status: "processing",
    })
    .onConflictDoUpdate({
      target: [adTranscripts.adId, adTranscripts.mediaHash, adTranscripts.modelVersion],
      set: {
        status: "processing",
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: adTranscripts.id });

  const jobId = job?.id || existing?.id || adId;

  // 5. If QStash is configured, dispatch the job to the Upstash QStash queue
  if (isQStashConfigured()) {
    const enqueueRes = await enqueueAdTranscription({
      adId,
      mediaUrl: videoUrl,
      mediaHash,
    });

    if (enqueueRes.success) {
      return NextResponse.json({
        jobId,
        status: "pending",
        message: "Transcription job queued in Upstash QStash",
        messageId: enqueueRes.messageId,
      }, { status: 202 });
    }

    console.warn("[Transcription Jobs] QStash enqueue failed, falling back to direct execution:", enqueueRes.error);
  }

  // 6. Direct execution fallback (when QStash is unconfigured or during offline dev)
  try {
    const res = await executeTranscriptionOnInstaBox({ adId, mediaUrl: videoUrl, mediaHash });
    if (res.success) {
      const d = res.data;
      const [updatedRecord] = await db
        .update(adTranscripts)
        .set({
          status: d.status,
          language: d.language,
          languageConfidence: d.language_confidence ? String(d.language_confidence) : null,
          fullText: d.full_text,
          hookText: d.hook_text,
          words: d.words,
          segments: d.segments,
          durationSeconds: d.duration_seconds ? String(d.duration_seconds) : null,
          isTruncated: d.is_truncated,
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(adTranscripts.id, jobId))
        .returning({
          id: adTranscripts.id,
          adId: adTranscripts.adId,
          status: adTranscripts.status,
          language: adTranscripts.language,
          languageConfidence: adTranscripts.languageConfidence,
          fullText: adTranscripts.fullText,
          hookText: adTranscripts.hookText,
          words: adTranscripts.words,
          segments: adTranscripts.segments,
          durationSeconds: adTranscripts.durationSeconds,
          isTruncated: adTranscripts.isTruncated,
          updatedAt: adTranscripts.updatedAt,
        });

      const responsePayload = updatedRecord || d;
      await setCached(`cache:transcript:${adId}`, responsePayload, 7 * 86400).catch(() => {});
      await forceReleaseLock(lockKey).catch(() => {});

      return NextResponse.json({
        jobId,
        status: d.status,
        transcript: responsePayload,
      });
    } else {
      await db
        .update(adTranscripts)
        .set({
          status: "failed",
          errorCode: "INSTABOX_FAILED",
          errorMessage: res.error,
          updatedAt: new Date(),
        })
        .where(eq(adTranscripts.id, jobId));

      await forceReleaseLock(lockKey).catch(() => {});

      return NextResponse.json(
        { jobId, status: "failed", error: res.error },
        { status: res.statusCode || 400 }
      );
    }
  } catch (err: any) {
    await db
      .update(adTranscripts)
      .set({
        status: "failed",
        errorCode: "UNHANDLED_EXCEPTION",
        errorMessage: err.message,
        updatedAt: new Date(),
      })
      .where(eq(adTranscripts.id, jobId));

    await forceReleaseLock(lockKey).catch(() => {});

    return NextResponse.json(
      { jobId, status: "failed", error: err.message || "Transcription failed" },
      { status: 500 }
    );
  }
}
