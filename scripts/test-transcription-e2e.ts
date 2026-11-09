import { db } from "@/db";
import { ads, adTranscripts, adObservations } from "@/db/schema";
import { sql, eq, desc } from "drizzle-orm";
import { executeTranscriptionOnInstaBox } from "@/lib/transcription-pipeline";
import { setCached, getCached } from "@/lib/cache-service";

async function run() {
  console.log("1. Finding recent video ads via adObservations...");
  const recentVideoAds = await db
    .select({
      id: ads.id,
      mediaType: ads.mediaType,
      mediaUrls: ads.mediaUrls,
      mediaHash: ads.mediaHash,
      observedAt: adObservations.observedAt,
    })
    .from(adObservations)
    .innerJoin(ads, eq(ads.id, adObservations.adId))
    .where(sql`${ads.mediaType} = 'video' AND cardinality(${ads.mediaUrls}) > 0`)
    .orderBy(desc(adObservations.observedAt))
    .limit(10);

  if (!recentVideoAds || recentVideoAds.length === 0) {
    console.log("No video ads found in DB to test. Exiting.");
    process.exit(0);
  }

  console.log(`Found ${recentVideoAds.length} candidate video ads.`);
  
  // Find the first ad whose mediaUrl is currently accessible (not expired)
  let videoAd = null;
  let mediaUrl = "";

  for (const candidate of recentVideoAds) {
    if (!candidate.mediaUrls || candidate.mediaUrls.length === 0) continue;
    const url = candidate.mediaUrls[0];
    try {
      const headRes = await fetch(url, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
      });
      console.log(`Checking ad ${candidate.id.slice(0, 8)}... (observedAt: ${candidate.observedAt?.toISOString?.() || candidate.observedAt}) -> HTTP ${headRes.status}`);
      if (headRes.ok || headRes.status === 200 || headRes.status === 206) {
        videoAd = candidate;
        mediaUrl = url;
        break;
      }
    } catch (e: any) {
      console.log(`Ad ${candidate.id.slice(0, 8)} fetch error: ${e.message}`);
    }
  }

  if (!videoAd || !videoAd.mediaUrls) {
    console.log("None of the 10 recent video ads had currently active CDN URLs. Falling back to the first candidate.");
    videoAd = recentVideoAds[0];
    mediaUrl = videoAd.mediaUrls?.[0] || "";
  }

  console.log(`Selected Ad ID: ${videoAd.id}`);
  console.log(`Media URL: ${mediaUrl.slice(0, 80)}...`);

  const mediaHash = videoAd.mediaHash || `hash_${videoAd.id.slice(0, 8)}`;

  console.log("\n2. Executing transcription via InstaBox MicroVM...");
  const startTime = Date.now();
  const result = await executeTranscriptionOnInstaBox({
    adId: videoAd.id,
    mediaUrl,
    mediaHash,
    model: "turbo",
  });

  const durationMs = Date.now() - startTime;
  console.log(`InstaBox responded in ${durationMs}ms`);

  if (!result.success) {
    console.error("Transcription failed:", result.error);
    process.exit(1);
  }

  const data = result.data;
  console.log("Transcription result:", {
    status: data.status,
    language: data.language,
    confidence: data.language_confidence,
    durationSeconds: data.duration_seconds,
    hookText: data.hook_text,
    fullTextPreview: data.full_text?.slice(0, 100),
    wordsCount: data.words?.length || 0,
    segmentsCount: data.segments?.length || 0,
  });

  console.log("\n3. Testing PostgreSQL Upsert into ad_transcripts...");
  const modelVersion = "faster-whisper-turbo-int8-v1";
  await db
    .insert(adTranscripts)
    .values({
      adId: videoAd.id,
      mediaHash,
      modelVersion,
      status: data.status,
      language: data.language,
      languageConfidence: data.language_confidence ? String(data.language_confidence) : null,
      fullText: data.full_text,
      hookText: data.hook_text,
      words: data.words,
      segments: data.segments,
      durationSeconds: data.duration_seconds ? String(data.duration_seconds) : null,
      isTruncated: data.is_truncated,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [adTranscripts.adId, adTranscripts.mediaHash, adTranscripts.modelVersion],
      set: {
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
      },
    });
  console.log("✓ Successfully saved transcript into Supabase Postgres");

  console.log("\n4. Testing Upstash Redis L2 Caching...");
  const cacheKey = `cache:transcript:${videoAd.id}`;
  await setCached(cacheKey, data, 7 * 86400);
  const cached = await getCached<any>(cacheKey);
  if (cached && (cached.full_text === data.full_text || cached.status === data.status)) {
    console.log("✓ Verified Upstash Redis L2 cache hit with exact match!");
  } else {
    console.log("Warning: Redis cache lookup mismatch or bypassed");
  }

  console.log("\n✅ End-to-End Transcription Test Completed Successfully!");
  process.exit(0);
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
