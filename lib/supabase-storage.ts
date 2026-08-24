import { getSupabase } from "./supabase";

const BUCKET_NAME = "ad-media";

/**
 * Uploads a Buffer asset directly to Supabase Storage (ad-media bucket).
 * Returns the public CDN URL if successful, or null on error.
 */
export async function uploadBufferToSupabase(
  buffer: Buffer,
  storagePath: string,
  contentType: string = "application/octet-stream"
): Promise<string | null> {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn(`[Supabase Storage] Upload error for ${storagePath}:`, error.message);
      return null;
    }

    const { data } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return data?.publicUrl || null;
  } catch (err: any) {
    console.warn(`[Supabase Storage] Failed to upload ${storagePath}:`, err.message);
    return null;
  }
}
