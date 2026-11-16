/**
 * lib/ad-media-utils.ts
 *
 * Pure deterministic utilities for Meta Ad Library DOM status evaluation,
 * creative asset filtering, and safe media consolidation during refresh routines.
 */

const ZERO_AD_REGEX =
  /no\s+ads?\s+match|no\s+results?\s+found|no\s+active\s+ads|ad\s+isn['’]?t\s+in\s+the\s+ad\s+library|ad\s+is\s+not\s+in\s+the\s+ad\s+library|aucun\s+résultat|sin\s+resultados|keine\s+ergebnisse|there\s+are\s+no\s+ads|0\s+matching\s+ads|0\s+ads\s+match|aucun\s+résultat\s+ne\s+correspond|ningún\s+anuncio\s+coincide|keine\s+anzeigen\s+stimmen|this\s+ad\s+has\s+expired|ad\s+not\s+found|ce\s+contenu\s+n'est\s+pas\s+disponible|ne\s+figure\s+pas\s+dans\s+la\s+bibliothèque|الإعلان\s+غير\s+موجود|\b0\s+results\b|~\s?0\s+results/i;

const RATE_LIMIT_REGEX =
  /confirm it'?s you|security check|enter the code below|unusual activity|prouvez que vous êtes un humain|rate limit exceeded|too many requests|temporarily blocked/i;

const INACTIVE_CARD_REGEX =
  /Inactive|Inactif|Inactivo|Inaktiv|غير نشط/i;

const ACTIVE_CARD_REGEX =
  /Active|Actif|Activo|Aktiv|نشط|Started running|Lancé le|En cours|Diffusé/i;

const AVATAR_OR_ICON_PATTERN =
  /\/t39\.30808-1\/|s148x148|s50x50|s60x60|s100x100|s150x150|_s\d+x\d+|_p\d+x\d+|\/profile\/|\/avatar\/|emoji|rsrc\.php/i;

/**
 * Checks whether a text snippet indicates 0 results, expired ad, or not found on Meta Ad Library.
 */
export function isZeroAdResultText(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  return ZERO_AD_REGEX.test(text);
}

/**
 * Checks whether page text indicates a Meta CAPTCHA or rate limit block.
 */
export function isRateLimitedText(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  return RATE_LIMIT_REGEX.test(text);
}

/**
 * Checks whether card text indicates an inactive / ended ad delivery status.
 */
export function isInactiveCardText(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  return INACTIVE_CARD_REGEX.test(text);
}

/**
 * Checks whether card text indicates an actively running ad.
 */
export function isActiveCardText(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  return !isInactiveCardText(text) && ACTIVE_CARD_REGEX.test(text);
}

/**
 * Validates whether an image URL represents a genuine ad creative
 * rather than a page profile avatar, Meta UI icon, or static system asset.
 */
export function isAdCreativeImage(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim();
  if (!clean.startsWith("http")) return false;
  if (clean.startsWith("data:") || clean.startsWith("blob:")) return false;
  if (AVATAR_OR_ICON_PATTERN.test(clean)) return false;
  return true;
}

export interface ConsolidateMediaParams {
  existingMediaUrls?: string[] | null;
  existingThumbnailUrl?: string | null;
  cardImages?: string[] | null;
  videoSrc?: string | null;
  videoPoster?: string | null;
  hasVideoElement?: boolean;
  interceptedVideos?: string[] | null;
  isNotFound?: boolean;
}

export interface ConsolidateMediaResult {
  updatedMediaUrls: string[];
  updatedThumbnailUrl: string | null;
  discoveredVideoUrl: string | null;
  discoveredThumbnailUrl: string | null;
  videoRefreshed: boolean;
  thumbnailRefreshed: boolean;
}

/**
 * Pure consolidation logic for refreshed media assets.
 * Guarantees:
 * 1. If an ad is expired or not found, preserves existing media (never overwrites with false media).
 * 2. Only assigns video streams if the card container explicitly had a video element.
 * 3. Never injects random page-level intercepted images when card creative images are missing.
 * 4. Preserves last-known good media when a refresh yields no new creative elements.
 */
export function consolidateRefreshedMedia(
  params: ConsolidateMediaParams
): ConsolidateMediaResult {
  const {
    existingMediaUrls,
    existingThumbnailUrl,
    cardImages,
    videoSrc,
    videoPoster,
    hasVideoElement,
    interceptedVideos,
    isNotFound,
  } = params;

  const originalMediaUrls = existingMediaUrls || [];
  const originalThumbnail = existingThumbnailUrl || null;

  // 1. If ad is not found / expired on Meta, preserve existing assets 100% untouched
  if (isNotFound) {
    return {
      updatedMediaUrls: originalMediaUrls,
      updatedThumbnailUrl: originalThumbnail,
      discoveredVideoUrl: null,
      discoveredThumbnailUrl: null,
      videoRefreshed: false,
      thumbnailRefreshed: false,
    };
  }

  // 2. Discover video source strictly if card container contains a video element
  let discoveredVideoUrl: string | null = null;
  if (videoSrc && videoSrc.startsWith("http") && !videoSrc.startsWith("blob:")) {
    discoveredVideoUrl = videoSrc;
  } else if (hasVideoElement && interceptedVideos && interceptedVideos.length > 0) {
    discoveredVideoUrl = interceptedVideos[interceptedVideos.length - 1];
  }

  // 3. Filter valid creative images
  const validCardImages = (cardImages || []).filter(isAdCreativeImage);

  // 4. Discover thumbnail
  let discoveredThumbnailUrl: string | null = null;
  if (videoPoster && isAdCreativeImage(videoPoster)) {
    discoveredThumbnailUrl = videoPoster;
  } else if (validCardImages.length > 0) {
    discoveredThumbnailUrl = validCardImages[0];
  }

  const finalThumbnailUrl = discoveredThumbnailUrl || originalThumbnail;

  // 5. Build updated mediaUrls
  let updatedMediaUrls: string[];
  if (discoveredVideoUrl) {
    updatedMediaUrls = [
      discoveredVideoUrl,
      ...originalMediaUrls.filter((u) => u !== discoveredVideoUrl && !u.includes(".mp4")),
    ];
  } else if (validCardImages.length > 0) {
    updatedMediaUrls = validCardImages;
  } else {
    // Preserve existing mediaUrls; NEVER substitute with random page-intercepted images
    updatedMediaUrls = originalMediaUrls;
  }

  const videoRefreshed = Boolean(
    discoveredVideoUrl && discoveredVideoUrl !== originalMediaUrls[0]
  );
  const thumbnailRefreshed = Boolean(
    discoveredThumbnailUrl && discoveredThumbnailUrl !== originalThumbnail
  );

  return {
    updatedMediaUrls,
    updatedThumbnailUrl: finalThumbnailUrl,
    discoveredVideoUrl,
    discoveredThumbnailUrl,
    videoRefreshed,
    thumbnailRefreshed,
  };
}
