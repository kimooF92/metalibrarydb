import { NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { db } from "@/db";
import { adTranscripts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { setCached, forceReleaseLock } from "@/lib/cache-service";
import { executeTranscriptionOnInstaBox, EnqueueTranscriptionPayload } from "@/lib/transcription-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function handleTranscribeTask(req: Request | NextRequest) {
  try {
    const body = (await req.json()) as EnqueueTranscriptionPayload;
    const { adId, mediaUrl, mediaHash, language, model } = body;

    if (!adId || !mediaUrl || !mediaHash) {
      return NextResponse.json({ error: "Missing required payload fields" }, { status: 400 });
    }

    const lockKey = `lock:transcribe:${adId}`;

    // 1. Mark as processing in DB
    await db
      .update(adTranscripts)
      .set({
        status: "processing",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(adTranscripts.adId, adId),
          eq(adTranscripts.mediaHash, mediaHash)
        )
      );

    // 2. Dispatch to InstaBox MicroVM
    const result = await executeTranscriptionOnInstaBox({
      adId,
      mediaUrl,
      mediaHash,
      language,
      model,
    });

    if (result.success) {
      const data = result.data;

      // 3. Persist success result in DB
      await db
        .update(adTranscripts)
        .set({
          status: data.status,
          language: data.language,
          languageConfidence: data.language_confidence ? String(data.language_confidence) : null,
          fullText: data.full_text,
          hookText: data.hook_text,
          words: data.words,
          segments: data.segments,
          durationSeconds: data.duration_seconds ? String(data.duration_seconds) : null,
          isTruncated: data.is_truncated,
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(adTranscripts.adId, adId),
            eq(adTranscripts.mediaHash, mediaHash)
          )
        );

      // 4. Cache in Upstash Redis for 7 days (0 DB egress on future reads)
      await setCached(`cache:transcript:${adId}`, data, 7 * 86400).catch(() => {});
      await forceReleaseLock(lockKey).catch(() => {});

      return NextResponse.json({ success: true, status: data.status });
    } else {
      // 5. Record failure in DB
      await db
        .update(adTranscripts)
        .set({
          status: "failed",
          errorCode: `INSTABOX_ERR_${result.statusCode || 500}`,
          errorMessage: result.error,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(adTranscripts.adId, adId),
            eq(adTranscripts.mediaHash, mediaHash)
          )
        );

      await forceReleaseLock(lockKey).catch(() => {});
      return NextResponse.json({ error: result.error }, { status: result.statusCode || 500 });
    }
  } catch (error: any) {
    console.error("[QStash Transcribe Task] Unexpected error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request | NextRequest) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentSigningKey || !nextSigningKey) {
    if (process.env.NODE_ENV === "development" || !process.env.QSTASH_TOKEN) {
      return handleTranscribeTask(req);
    }
    return NextResponse.json({ error: "QStash signing keys missing" }, { status: 500 });
  }

  const verified = verifySignatureAppRouter(handleTranscribeTask, {
    currentSigningKey,
    nextSigningKey,
    clockTolerance: 60,
  });

  return verified(req);
}

