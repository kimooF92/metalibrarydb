/**
 * Supplier Facebook Page Scraper Engine
 * Implements the Two-Phase Quota-Protective Watchdog Architecture:
 * Phase 1: Checks for recent posts using `apify/facebook-posts-scraper` (resultsLimit: 5, onlyPostsNewerThan).
 * Phase 2: If a new album/post is detected, extracts full photos using `apify/facebook-photos-scraper` (or direct post media)
 *          and re-hosts them to permanent storage (Backblaze B2 / Supabase Storage) via uploadMediaWithHashing.
 */

import { db } from "@/db";
import { suppliers, supplierPhotos } from "@/db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getApifyTokens } from "@/lib/apify";
import { uploadMediaWithHashing } from "@/lib/b2-storage";
import { logSupplierAlbumDropNotification } from "@/lib/notifications";

const APIFY_BASE_URL = "https://api.apify.com/v2";
const DEFAULT_POSTS_ACTOR = "apify/facebook-posts-scraper";
const DEFAULT_PHOTOS_ACTOR = "apify/facebook-photos-scraper";

interface ApifyRunItem {
  id?: string;
  postId?: string;
  postUrl?: string;
  url?: string;
  link?: string;
  attachedUrl?: string;
  text?: string;
  postText?: string;
  message?: string;
  publishedAt?: string;
  time?: string;
  date?: string;
  mediaUrls?: string[];
  media?: Array<{
    type?: string;
    url?: string;
    thumbnail?: string;
    image?: any;
    imageUrl?: string;
    [key: string]: any;
  }>;
  imageUrl?: string;
  image?: any;
  albumUrl?: string;
  albumName?: string;
  albumTitle?: string;
  [key: string]: any;
}

/**
 * Validates that a string is a genuine image file URL, not an HTML page/permalink.
 */
export function isValidImageUrl(u: any): u is string {
  if (!u || typeof u !== "string") return false;
  const clean = u.trim();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) return false;
  // Disallow HTML Facebook web links
  if (
    clean.includes("permalink.php") ||
    clean.includes("/posts/") ||
    clean.includes("/story.php") ||
    clean.includes("facebook.com/profile.php")
  ) {
    return false;
  }
  // Check if it's from a known CDN or has image extension
  return (
    clean.includes("fbcdn.net") ||
    clean.includes("fbsbx.com") ||
    clean.includes("cloudinary.com") ||
    clean.includes("backblazeb2.com") ||
    clean.includes("supabase.co") ||
    /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(clean)
  );
}

/**
 * Safely extracts authentic image URLs from post media objects or arrays,
 * inspecting image uri, thumbnail, and nested shared post media.
 */
export function extractValidImagesFromPost(post: ApifyRunItem): string[] {
  const images: string[] = [];

  const addIfValid = (candidate: any) => {
    if (isValidImageUrl(candidate) && !images.includes(candidate)) {
      images.push(candidate);
    }
  };

  // 1. Direct post fields
  addIfValid(post.imageUrl);
  addIfValid(post.thumbnail);
  addIfValid(post.image);

  // 2. post.media array
  if (Array.isArray(post.media)) {
    for (const m of post.media) {
      if (!m) continue;
      addIfValid(m.image?.uri);
      addIfValid(m.thumbnail);
      addIfValid(m.imageUrl);
      if (isValidImageUrl(m.url)) addIfValid(m.url);
    }
  }

  // 3. post.sharedPost media
  if (post.sharedPost) {
    addIfValid(post.sharedPost.imageUrl);
    addIfValid(post.sharedPost.thumbnail);
    if (Array.isArray(post.sharedPost.media)) {
      for (const m of post.sharedPost.media) {
        if (!m) continue;
        addIfValid(m.image?.uri);
        addIfValid(m.thumbnail);
        addIfValid(m.imageUrl);
        if (isValidImageUrl(m.url)) addIfValid(m.url);
      }
    }
  }

  // 4. mediaUrls array
  if (Array.isArray(post.mediaUrls)) {
    for (const u of post.mediaUrls) {
      addIfValid(u);
    }
  }

  return images;
}

/**
 * Normalizes a raw Facebook URL into a clean canonical page URL.
 */
export function normalizeFacebookPageUrl(rawUrl: string): string {
  try {
    let clean = rawUrl.trim();
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    const urlObj = new URL(clean);
    // Strip common tracking and referral params
    const trackingParams = ["fbclid", "mibextid", "rdid", "ref", "hc_ref", "fref"];
    for (const p of trackingParams) {
      urlObj.searchParams.delete(p);
    }
    let pathname = urlObj.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";
    return `${urlObj.protocol}//${urlObj.hostname}${pathname}${urlObj.search}`;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Extracts a Facebook Album URL from post links, attachments, or text if present.
 */
function extractAlbumUrlFromPost(post: ApifyRunItem): { albumUrl: string | null; albumTitle: string | null } {
  const potentialUrls: string[] = [
    post.albumUrl,
    post.attachedUrl,
    post.link,
    post.postUrl,
    ...(post.mediaUrls || []),
  ].filter((u): u is string => Boolean(u && typeof u === "string"));

  let foundAlbumUrl: string | null = null;
  for (const url of potentialUrls) {
    if (url.includes("/media/set/") || url.includes("set=a.") || url.includes("/photos_albums/")) {
      foundAlbumUrl = url;
      break;
    }
  }

  // Attempt to parse album title from post text (e.g., "Added 40 photos to album: Winter Collection 2026")
  let albumTitle: string | null = post.albumName || post.albumTitle || null;
  if (!albumTitle && post.postText) {
    const match = post.postText.match(/album:?\s*["'“]?([^"'\n\r”]+)["'”]?/i);
    if (match && match[1]) {
      albumTitle = match[1].trim();
    }
  }

  return { albumUrl: foundAlbumUrl, albumTitle };
}

/**
 * Executes an Apify actor synchronously with token failover and fetches output items.
 */
async function runApifyActor(actorId: string, input: Record<string, any>, timeoutSec = 90): Promise<ApifyRunItem[]> {
  const tokens = getApifyTokens();
  if (tokens.length === 0) {
    throw new Error("No Apify API tokens available. Configure APIFY_API_TOKEN in environment.");
  }

  const actorPath = actorId.includes("/") ? actorId.replace("/", "~") : actorId;
  let lastError: Error | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    try {
      const runUrl = `${APIFY_BASE_URL}/acts/${actorPath}/runs?token=${token}&waitForFinish=${timeoutSec}&memory=512`;
      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout((timeoutSec + 15) * 1000),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Apify run failed with status ${res.status}: ${errorText.slice(0, 150)}`);
      }

      const runJson = await res.json();
      const datasetId = runJson.data?.defaultDatasetId;
      if (!datasetId) {
        return [];
      }

      // Fetch dataset results
      const datasetRes = await fetch(`${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${token}&limit=100`, {
        signal: AbortSignal.timeout(20000),
      });

      if (!datasetRes.ok) {
        throw new Error(`Failed to fetch dataset ${datasetId}: ${datasetRes.status}`);
      }

      const items = (await datasetRes.json()) as ApifyRunItem[];
      return Array.isArray(items) ? items : [];
    } catch (err: any) {
      console.warn(`[Supplier Scraper] Run failed with token #${i + 1} (${actorId}):`, err?.message || err);
      lastError = err;
      // Continue to next failover token
    }
  }

  throw lastError || new Error(`All Apify tokens failed for actor ${actorId}`);
}

/**
 * Scrapes a single supplier page for new product drops.
 * Phase 1: Micro-Watchdog (Checks for new posts newer than lastPostDate).
 * Phase 2: Targeted Album / Media extraction if new items found.
 */
export async function scanSupplierNow(supplierId: string): Promise<{
  success: boolean;
  newPhotosCount: number;
  albumDetected: boolean;
  error?: string;
}> {
  // 1. Fetch supplier with explicit columns (Rule: No SELECT *)
  const [supplier] = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      facebookUrl: suppliers.facebookUrl,
      lastPostDate: suppliers.lastPostDate,
      lastPostUrl: suppliers.lastPostUrl,
      lastPostText: suppliers.lastPostText,
      workspaceId: suppliers.workspaceId,
      status: suppliers.status,
    })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!supplier) {
    return { success: false, newPhotosCount: 0, albumDetected: false, error: "Supplier not found" };
  }

  // Set status to scanning
  await db
    .update(suppliers)
    .set({
      lastScrapeStatus: "scanning",
      lastScrapeError: null,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, supplier.id));

  try {
    // ==========================================
    // STAGE 1: Micro-Watchdog Check
    // ==========================================
    const postsActorId = process.env.APIFY_FB_POSTS_ACTOR_ID || DEFAULT_POSTS_ACTOR;
    const postsInput: Record<string, any> = {
      startUrls: [{ url: supplier.facebookUrl }],
      resultsLimit: 5,
    };

    if (supplier.lastPostDate) {
      // Temporal watermark: Apify only returns posts newer than this date
      postsInput.onlyPostsNewerThan = supplier.lastPostDate.toISOString();
    }

    console.log(`[Supplier Scraper] Running watchdog for "${supplier.name}" (${supplier.facebookUrl})...`);
    const recentPosts = await runApifyActor(postsActorId, postsInput, 75);

    if (recentPosts.length === 0) {
      // No new posts! Cost is $0 item charges.
      await db
        .update(suppliers)
        .set({
          lastCheckedAt: new Date(),
          lastScrapeStatus: "success",
          lastScrapeError: null,
          updatedAt: new Date(),
        })
        .where(eq(suppliers.id, supplier.id));

      console.log(`[Supplier Scraper] 0 new posts for "${supplier.name}". Watermark preserved.`);
      return { success: true, newPhotosCount: 0, albumDetected: false };
    }

    // ==========================================
    // STAGE 2: Album & Photos Extraction
    // ==========================================
    let totalPhotosIngested = 0;
    let newestPostDate = supplier.lastPostDate ? new Date(supplier.lastPostDate) : new Date(0);
    let latestPostUrl: string | null = null;
    let latestPostText: string | null = null;
    let latestAlbumUrl: string | null = null;
    let latestAlbumTitle: string | null = null;
    let previewImages: string[] = [];

    const photosActorId = process.env.APIFY_FB_PHOTOS_ACTOR_ID || DEFAULT_PHOTOS_ACTOR;

    for (const post of recentPosts) {
      // 1. Extract Post Date
      const postDateStr =
        post.time ||
        (post.timestamp ? new Date(post.timestamp * 1000).toISOString() : null) ||
        post.publishedAt ||
        post.date;
      let currentPostDate: Date | null = null;
      if (postDateStr) {
        const parsed = new Date(postDateStr);
        if (!isNaN(parsed.getTime())) {
          currentPostDate = parsed;
          if (parsed > newestPostDate) {
            newestPostDate = parsed;
          }
        }
      }

      // 2. Extract Canonical Post URL
      const postUrl = post.topLevelUrl || post.url || post.link || post.postUrl;
      if (!latestPostUrl && postUrl) {
        latestPostUrl = postUrl;
      }

      // 3. Extract Clean Post Text
      const postText = post.text || post.postText || post.message || post.sharedPost?.text || null;
      if (!latestPostText && postText) {
        latestPostText = postText;
      }

      const { albumUrl, albumTitle } = extractAlbumUrlFromPost(post);
      if (albumUrl) {
        latestAlbumUrl = albumUrl;
        latestAlbumTitle = albumTitle || "Supplier Collection";
      }

      // Case A: Targeted Album Scrape
      if (albumUrl) {
        console.log(`[Supplier Scraper] Album detected for "${supplier.name}": ${albumUrl}. Dispatching photos scraper...`);
        const albumPhotos = await runApifyActor(
          photosActorId,
          {
            startUrls: [{ url: albumUrl }],
            resultsLimit: 60,
          },
          120
        );

        for (const item of albumPhotos) {
          const rawUrl =
            item.imageUrl ||
            (typeof item.image === "object" ? item.image?.uri : item.image) ||
            item.thumbnail ||
            item.url ||
            (item.media && item.media[0]?.url);
          if (!isValidImageUrl(rawUrl)) continue;

          // Re-host image to permanent storage to survive Facebook CDN expiry
          const uploadRes = await uploadMediaWithHashing(rawUrl, "images", `supplier_${supplier.id}`).catch(() => null);
          const finalPhotoUrl = uploadRes?.url || rawUrl;
          if (previewImages.length < 4) {
            previewImages.push(finalPhotoUrl);
          }

          // Insert photo with unique index protection (Rule: ON CONFLICT DO NOTHING)
          await db
            .insert(supplierPhotos)
            .values({
              supplierId: supplier.id,
              albumUrl,
              albumTitle: latestAlbumTitle,
              photoUrl: finalPhotoUrl,
              rawMetaUrl: rawUrl,
              mediaHash: uploadRes?.mediaHash || null,
              caption: item.text || item.caption || postText || null,
              postedAt: item.publishedAt ? new Date(item.publishedAt) : (currentPostDate || new Date()),
            })
            .onConflictDoNothing();

          totalPhotosIngested++;
        }
      } else {
        // Case B: Standard Post with genuine image extraction (filtering out HTML permalinks)
        const validPhotos = extractValidImagesFromPost(post);

        for (const rawUrl of validPhotos) {
          const uploadRes = await uploadMediaWithHashing(rawUrl, "images", `supplier_${supplier.id}`).catch(() => null);
          const finalPhotoUrl = uploadRes?.url || rawUrl;
          if (previewImages.length < 4) {
            previewImages.push(finalPhotoUrl);
          }

          await db
            .insert(supplierPhotos)
            .values({
              supplierId: supplier.id,
              albumUrl: postUrl || null,
              albumTitle: null,
              photoUrl: finalPhotoUrl,
              rawMetaUrl: rawUrl,
              mediaHash: uploadRes?.mediaHash || null,
              caption: postText,
              postedAt: currentPostDate || new Date(),
            })
            .onConflictDoNothing();

          totalPhotosIngested++;
        }
      }
    }

    // ==========================================
    // STAGE 3: Finalize Supplier & Send Alert
    // ==========================================
    const hasNewPhotos = totalPhotosIngested > 0;
    const hasActivity = hasNewPhotos || Boolean(latestPostUrl && latestPostUrl !== supplier.lastPostUrl);

    await db
      .update(suppliers)
      .set({
        lastCheckedAt: new Date(),
        lastPostDate: newestPostDate > new Date(0) ? newestPostDate : supplier.lastPostDate,
        lastPostUrl: latestPostUrl || supplier.lastPostUrl,
        lastPostText: latestPostText || supplier.lastPostText,
        lastAlbumUrl: latestAlbumUrl || undefined,
        lastAlbumTitle: latestAlbumTitle || undefined,
        lastAlbumPhotoCount: totalPhotosIngested > 0 ? totalPhotosIngested : undefined,
        hasUnseenDrop: hasActivity ? true : undefined,
        lastScrapeStatus: "success",
        lastScrapeError: null,
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, supplier.id));

    if (hasActivity) {
      await logSupplierAlbumDropNotification({
        supplierId: supplier.id,
        supplierName: supplier.name,
        albumTitle: latestAlbumTitle,
        photoCount: totalPhotosIngested,
        previewImages,
        albumUrl: latestAlbumUrl,
        postUrl: latestPostUrl,
        postText: latestPostText,
        postDate: newestPostDate > new Date(0) ? newestPostDate.toISOString() : null,
        workspaceId: supplier.workspaceId,
      });
      console.log(`🎉 [Supplier Scraper] Successfully recorded drop for "${supplier.name}" (${totalPhotosIngested} photos).`);
    }

    return {
      success: true,
      newPhotosCount: totalPhotosIngested,
      albumDetected: Boolean(latestAlbumUrl),
    };
  } catch (err: any) {
    const errorMsg = err?.message || "Scrape failed";
    console.error(`❌ [Supplier Scraper] Error scanning supplier "${supplier.name}":`, errorMsg);

    await db
      .update(suppliers)
      .set({
        lastScrapeStatus: "failed",
        lastScrapeError: errorMsg.slice(0, 300),
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, supplier.id));

    return {
      success: false,
      newPhotosCount: 0,
      albumDetected: false,
      error: errorMsg,
    };
  }
}

