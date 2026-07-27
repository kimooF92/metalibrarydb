import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BUCKET_NAME = "ad-thumbnails";
const MAX_BYTE_SIZE = 5 * 1024 * 1024; // 5MB limit
const FETCH_TIMEOUT_MS = 8000;

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseClient) {
    if (!supabaseUrl || !supabaseKey) {
      return null;
    }
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

export async function cacheThumbnail(
  adArchiveId: string,
  mediaUrl: string | null | undefined
): Promise<{ storagePath: string | null; publicUrl: string | null }> {
  if (!mediaUrl) return { storagePath: null, publicUrl: null };

  const client = getSupabase();
  if (!client) {
    return { storagePath: null, publicUrl: null };
  }

  try {
    const urlHash = crypto.createHash("md5").update(mediaUrl).digest("hex").substring(0, 8);
    const storagePath = `${adArchiveId}_${urlHash}.jpg`;

    // 1. Fetch image with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(mediaUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { storagePath: null, publicUrl: null };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTE_SIZE) {
      return { storagePath: null, publicUrl: null };
    }

    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // 2. Upload to Supabase storage
    const { error } = await client.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      // Bucket might not exist or permissions issue - soft fail
      return { storagePath: null, publicUrl: null };
    }

    // 3. Get public/signed URL
    const { data: publicUrlData } = client.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return {
      storagePath,
      publicUrl: publicUrlData?.publicUrl || null,
    };
  } catch {
    // Best-effort thumbnail caching — never throw or break scan
    return { storagePath: null, publicUrl: null };
  }
}
