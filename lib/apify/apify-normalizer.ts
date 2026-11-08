/**
 * Meta Ad Library / Apify dataset payload normalizers.
 * Pure deterministic transformation functions with zero database dependencies.
 */

/**
 * Robustly extracts adArchiveId from multiple candidate fields & URL parameters.
 */
export function extractAdArchiveId(item: any): string {
  const direct = String(
    item.adArchiveId ||
    item.ad_archive_id ||
    item.archiveId ||
    item.id ||
    item.ad_id ||
    item.snapshot?.ad_archive_id ||
    ""
  ).trim();

  if (direct && direct !== "0") return direct;

  // Extract from ad_library_url (e.g. https://www.facebook.com/ads/library/?id=1497424319087029)
  const urlToParse = item.ad_library_url || item.url || "";
  const match = urlToParse.match(/[?&]id=(\d+)/);
  if (match && match[1]) {
    return match[1];
  }

  return "";
}

/**
 * Extracts and normalizes media URLs from Meta Ad Library JSON items (including Dynamic Creatives, Carousels & Video previews).
 */
export function extractMedia(item: any): {
  mediaType: "image" | "video" | "carousel" | "unknown";
  mediaUrls: string[];
  thumbnailUrl: string | null;
} {
  const urls: string[] = [];
  let preferredThumbnail: string | null = null;

  // 1. Check top-level direct fields
  const topMedia = item.media_url || item.image_url || item.display_url || item.imageUrl;
  if (topMedia && typeof topMedia === "string") urls.push(topMedia);

  const topVideo = item.video_url || item.video_hd_url || item.video_sd_url || item.videoUrl;
  if (topVideo && typeof topVideo === "string" && !urls.includes(topVideo)) urls.push(topVideo);

  // 2. Check snapshot cards array (Carousels and Dynamic Creatives)
  const cards = item.snapshot?.cards || item.cards || item.ad_creative_cards || [];
  if (Array.isArray(cards)) {
    for (const card of cards) {
      const cardMedia =
        card.original_image_url ||
        card.resized_image_url ||
        card.video_preview_image_url ||
        card.video_hd_url ||
        card.video_sd_url ||
        card.image_url;
      if (cardMedia && typeof cardMedia === "string" && !urls.includes(cardMedia)) {
        urls.push(cardMedia);
      }
    }
  }

  // 3. Check snapshot images array
  const images = item.snapshot?.images || item.images || [];
  if (Array.isArray(images)) {
    for (const img of images) {
      const imgUrl =
        img.original_image_url ||
        img.resized_image_url ||
        img.url ||
        img.watermarked_resized_image_url;
      if (imgUrl && typeof imgUrl === "string" && !urls.includes(imgUrl)) {
        urls.push(imgUrl);
      }
    }
  }

  // 4. Check snapshot videos array
  const videos = item.snapshot?.videos || item.videos || [];
  let hasVideoSource = Boolean(topVideo);
  if (Array.isArray(videos)) {
    for (const vid of videos) {
      const previewImg = vid.video_preview_image_url || vid.preview_url;
      if (previewImg && typeof previewImg === "string" && !preferredThumbnail) {
        preferredThumbnail = previewImg;
      }

      const vidUrl = vid.video_hd_url || vid.video_sd_url || vid.url;
      if (vidUrl && typeof vidUrl === "string") {
        hasVideoSource = true;
        if (!urls.includes(vidUrl)) urls.push(vidUrl);
      }
    }
  }

  // Determine media type
  let mediaType: "image" | "video" | "carousel" | "unknown" = "unknown";
  if (hasVideoSource || item.video_hd_url || urls.some((u) => u.includes(".mp4") || u.includes("/videos/") || u.includes("video."))) {
    mediaType = "video";
  } else if (Array.isArray(cards) && cards.length > 1) {
    mediaType = "carousel";
  } else if (urls.length >= 1) {
    mediaType = "image";
  }

  // Thumbnail fallback (always prioritize image over video file)
  const firstNonVideoUrl = urls.find((u) => !u.includes(".mp4") && !u.includes("/videos/"));
  const thumbnailUrl =
    preferredThumbnail ||
    firstNonVideoUrl ||
    item.snapshot?.page_profile_picture_url ||
    item.pageProfilePictureUrl ||
    null;

  return { mediaType, mediaUrls: urls, thumbnailUrl };
}

/**
 * Extracts the active delivery status of an ad from Meta Ad Library / Apify item payload.
 * Returns `false` if the ad has ended, stopped, paused, or is marked inactive.
 * Returns `true` if currently delivering or actively running.
 */
export function extractAdActiveStatus(item: any): boolean {
  if (!item) return false;

  // 1. Check explicit boolean flags
  if (typeof item.isActive === "boolean") return item.isActive;
  if (typeof item.is_active === "boolean") return item.is_active;
  if (typeof item.active === "boolean") return item.active;
  if (typeof item.snapshot?.is_active === "boolean") return item.snapshot.is_active;
  if (typeof item.snapshot?.isActive === "boolean") return item.snapshot.isActive;

  // 2. Check status string values
  const statusStr = String(
    item.status ||
    item.ad_status ||
    item.adDeliveryStatus ||
    item.ad_delivery_status ||
    item.snapshot?.status ||
    item.snapshot?.ad_delivery_status ||
    ""
  ).toUpperCase().trim();

  if (["INACTIVE", "PAUSED", "ENDED", "COMPLETED", "STOPPED", "DELETED"].includes(statusStr)) {
    return false;
  }
  if (statusStr === "ACTIVE") {
    return true;
  }

  // 3. Check stop time / end date
  const rawEndDate =
    item.endDate ||
    item.end_date ||
    item.stoppedRunningOn ||
    item.ad_delivery_stop_time ||
    item.snapshot?.end_date;

  if (rawEndDate) {
    const endMs =
      typeof rawEndDate === "number"
        ? (rawEndDate < 10000000000 ? rawEndDate * 1000 : rawEndDate)
        : new Date(rawEndDate).getTime();
    if (!isNaN(endMs) && endMs <= Date.now()) {
      return false;
    }
  }

  return true;
}

/**
 * Parses ad launch date safely, handling Unix timestamps in seconds vs milliseconds.
 */
export function parseAdStartDate(item: any): Date | null {
  const raw =
    item.startedRunningOn ||
    item.startDate ||
    item.start_date ||
    item.start_date_formatted ||
    item.snapshot?.creation_time;

  if (!raw) return null;

  if (typeof raw === "number" || (/^\d+$/.test(String(raw).trim()))) {
    const num = Number(raw);
    if (!isNaN(num)) {
      const ms = num < 10000000000 ? num * 1000 : num;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(raw);
  return !isNaN(d.getTime()) ? d : null;
}

/**
 * Strict Meta Page ID and Page Name extractor.
 * Strictly extracts real numeric Meta Page IDs (e.g. 104829104820) and clean display names.
 * NEVER returns UUIDs or dummy placeholder strings (BUG-12 mitigation).
 */
export function extractPageInfo(item: any): {
  pageId: string | null;
  pageName: string | null;
  profilePicUrl: string | null;
} {
  const isNumericPageId = (str: any) => typeof str === "string" && /^\d{6,25}$/.test(str.trim());

  // Check all candidate keys in Apify dataset item & GraphQL nodes
  const candidateIds = [
    item.pageId,
    item.page_id,
    item.pageID,
    item.snapshot?.page_id,
    item.snapshot?.pageId,
    item.snapshot?.pageID,
    item.publisher_page_id,
    item.snapshot?.publisher_page_id,
    item.publisherPlatformPageId,
    item.snapshot?.publisherPlatformPageId,
    item.node?.page_id,
    item.node?.pageID,
    item.node?.snapshot?.page_id,
    typeof item.page_profile_uri === "string" ? item.page_profile_uri.match(/id=(\d+)/)?.[1] : null,
    typeof item.snapshot?.page_profile_uri === "string" ? item.snapshot.page_profile_uri.match(/id=(\d+)/)?.[1] : null,
  ];

  let resolvedPageId: string | null = null;
  for (const cid of candidateIds) {
    if (cid !== undefined && cid !== null) {
      const clean = String(cid).trim();
      if (isNumericPageId(clean)) {
        resolvedPageId = clean;
        break;
      }
    }
  }

  const candidateNames = [
    item.pageName,
    item.page_name,
    item.snapshot?.page_name,
    item.snapshot?.pageName,
    item.snapshot?.byline,
    item.page_profile_name,
    item.snapshot?.page_profile_name,
    item.publisherPlatformPageName,
    item.snapshot?.publisherPlatformPageName,
    item.node?.page_name,
    item.node?.pageName,
  ];

  let resolvedPageName: string | null = null;
  for (const cname of candidateNames) {
    if (cname && typeof cname === "string") {
      const clean = cname.trim();
      if (
        clean &&
        !clean.startsWith("http://") &&
        !clean.startsWith("https://") &&
        !clean.toLowerCase().startsWith("page ") &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)
      ) {
        resolvedPageName = clean;
        break;
      }
    }
  }

  const candidatePics = [
    item.snapshot?.page_profile_picture_url,
    item.page_profile_picture_url,
    item.pageProfilePictureUrl,
    item.snapshot?.pageProfilePictureUrl,
    item.node?.snapshot?.page_profile_picture_url,
    item.node?.page_profile_picture_url,
    item.profile_picture_url,
    item.snapshot?.profile_picture_url,
    item.page_profile_picture_uri,
    item.snapshot?.page_profile_picture_uri,
    item.publisherPlatformPageProfilePictureUrl,
    item.snapshot?.publisherPlatformPageProfilePictureUrl,
  ];

  let resolvedProfilePicUrl: string | null = null;
  for (const cpic of candidatePics) {
    if (typeof cpic === "string" && cpic.startsWith("http")) {
      resolvedProfilePicUrl = cpic.trim();
      break;
    }
  }

  return {
    pageId: resolvedPageId,
    pageName: resolvedPageName,
    profilePicUrl: resolvedProfilePicUrl,
  };
}

