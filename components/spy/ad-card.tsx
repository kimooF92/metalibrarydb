"use client";

import { useState, useEffect } from "react";
import NextImage from "next/image";
import { Ad } from "@/types";
import { resolveDestinationUrl, getCleanDomain } from "@/lib/utils";
import { ImagePreviewModal } from "./image-preview-modal";
import {
  Calendar,
  Layers,
  ExternalLink,
  Download,
  Play,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Flame,
  Globe,
  Archive,
  ArchiveRestore,
  Clock,
  RotateCw,
  Ban,
} from "lucide-react";

interface AdCardProps {
  ad: Ad;
  onArchiveToggle?: () => void;
  onExcludeBrand?: (pageId: string) => void;
  onMediaRefreshed?: (newAd: Ad) => void;
}

export function AdCard({ ad, onArchiveToggle, onExcludeBrand, onMediaRefreshed }: AdCardProps) {
  const [currentAd, setCurrentAd] = useState<Ad>(ad);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [isProxied, setIsProxied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isArchived, setIsArchived] = useState(Boolean(ad.isArchived));
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false);

  // Sync when prop updates
  useEffect(() => {
    setCurrentAd(ad);
    setIsArchived(Boolean(ad.isArchived));
  }, [ad]);

  const initialDisplayImage = currentAd.signedThumbnailUrl || currentAd.thumbnailUrl || currentAd.mediaUrls?.[0];
  const activeImageSrc = isProxied && initialDisplayImage
    ? `/api/spy/image-proxy?url=${encodeURIComponent(initialDisplayImage)}`
    : initialDisplayImage;

  const handleImageError = () => {
    if (!isProxied && initialDisplayImage) {
      setIsProxied(true);
    } else {
      setImgError(true);
    }
  };

  const toggleArchive = async () => {
    setIsArchiving(true);
    const nextState = !isArchived;
    setIsArchived(nextState);
    try {
      const res = await fetch(`/api/spy/ads/${currentAd.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: nextState }),
      });
      if (res.ok) {
        onArchiveToggle?.();
      } else {
        setIsArchived(!nextState);
      }
    } catch {
      setIsArchived(!nextState);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRefreshMedia = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshingMedia(true);
    try {
      const res = await fetch(`/api/spy/ads/${currentAd.id}/refresh`, { method: "POST" });
      const contentType = res.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        alert("Server temporary error (" + res.status + "). Click 'Watch on Meta Ad Library' to view.");
        return;
      }

      const data = await res.json();
      if (data.success && data.ad) {
        setCurrentAd(data.ad);
        setVideoError(false);
        setImgError(false);
        setIsProxied(false);
        onMediaRefreshed?.(data.ad);
      } else {
        alert(data.message || "Could not extract fresh media right now. Use 'Watch on Meta Ad Library' link.");
      }
    } catch (err: any) {
      alert("Failed to refresh media: " + (err.message || "Network error"));
    } finally {
      setIsRefreshingMedia(false);
    }
  };

  // Format launch date
  const formatLaunchDate = (dateStr: string | null, firstSeenStr?: string | null) => {
    const isFirstSeen = !dateStr;
    const targetStr = dateStr || firstSeenStr;
    if (!targetStr) return "Unknown launch date";
    const date = new Date(targetStr);
    if (isNaN(date.getTime())) return "Unknown launch date";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const launchDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diffTime = today.getTime() - launchDay.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const prefix = isFirstSeen ? "First seen " : "Launched ";

    if (diffDays <= 0) return `${prefix}today`;
    if (diffDays === 1) return `${prefix}yesterday`;
    if (diffDays < 30) return `${prefix}${diffDays}d ago`;
    return `${prefix}${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  };

  const formatFreshnessDate = (dateStr?: string | Date | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const diffHours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return "Verified just now";
    if (diffHours < 24) return `Verified ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Verified ${diffDays}d ago`;
  };

  const duplicationCount = currentAd.duplicationCount || 1;
  const isScaled = duplicationCount >= 5;
  const freshnessLabel = formatFreshnessDate(currentAd.lastSeenAt);

  const firstVideoUrl = currentAd.mediaUrls?.find(
    (url) => url.includes(".mp4") || url.includes("video") || currentAd.mediaType === "video"
  );
  const displayImage = currentAd.signedThumbnailUrl || currentAd.thumbnailUrl || currentAd.mediaUrls?.[0];
  const destinationUrl = resolveDestinationUrl(currentAd.linkUrl);
  const targetDomain = getCleanDomain(currentAd.linkUrl);

  const previewImages = currentAd.mediaUrls && currentAd.mediaUrls.length > 0 ? currentAd.mediaUrls : displayImage ? [displayImage] : [];

  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-4 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-md">
      {/* Top Section */}
      <div>
        {/* Brand Name & Status Badges */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {currentAd.pageName || `Page ${currentAd.pageId}`}
              </span>
              {onExcludeBrand && (
                <button
                  type="button"
                  onClick={() => onExcludeBrand(currentAd.pageId)}
                  title={`Hide "${currentAd.pageName || currentAd.pageId}" from feed`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded shrink-0 cursor-pointer"
                >
                  <Ban className="w-3 h-3" />
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
              ID: {currentAd.adArchiveId}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isArchived ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                <Archive className="w-3 h-3" /> Archived
              </span>
            ) : currentAd.isActive === true ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            ) : currentAd.isActive === false ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-150 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-2 py-0.5 rounded-full">
                <XCircle className="w-3 h-3 text-slate-600 dark:text-slate-400" /> Inactive
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 px-2 py-0.5 rounded-full">
                <HelpCircle className="w-3 h-3" /> Unknown
              </span>
            )}
          </div>
        </div>

        {/* Badges Bar: Launch Date, Scale & Freshness */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 font-medium">
            <Calendar className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
            {formatLaunchDate(currentAd.startedRunningOn, currentAd.firstSeenAt)}
          </span>

          <span
            className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border font-semibold ${
              isScaled
                ? "bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30"
                : "bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-300 border-slate-250 dark:border-slate-800"
            }`}
          >
            {isScaled ? (
              <Flame className="w-3 h-3 text-amber-600 dark:text-amber-400 fill-amber-500/20 animate-pulse" />
            ) : (
              <Layers className="w-3 h-3 text-slate-600 dark:text-slate-400" />
            )}
            {duplicationCount} {duplicationCount === 1 ? "Copy" : "Copies running"}
            {isScaled && <span className="ml-0.5">🔥 Scaled</span>}
          </span>

          {freshnessLabel && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/60 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
              <Clock className="w-2.5 h-2.5 text-slate-400" />
              {freshnessLabel}
            </span>
          )}
        </div>

        {/* Media Container */}
        <div className="relative w-full h-[280px] sm:h-[320px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-900/95 dark:bg-slate-950 mb-3 flex items-center justify-center">
          {isPlayingVideo && firstVideoUrl && !videoError ? (
            <video
              src={firstVideoUrl}
              controls
              autoPlay
              {...({ referrerPolicy: "no-referrer" } as any)}
              onError={() => setVideoError(true)}
              className="w-full h-full object-contain bg-black rounded-xl"
            />
          ) : isPlayingVideo && videoError ? (
            <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-slate-200 w-full h-full gap-3">
              <Play className="w-10 h-10 text-indigo-400 opacity-60" />
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-white">Direct CDN stream expired</span>
                <span className="text-[11px] text-slate-400">Meta CDN links expire after 24–72 hours</span>
              </div>
              <a
                href={`https://www.facebook.com/ads/library/?id=${currentAd.adArchiveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium shadow-md transition-all"
              >
                Watch on Meta Ad Library
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <div className="relative w-full h-full group/media cursor-pointer flex items-center justify-center" onClick={() => setIsPreviewOpen(true)}>
              {activeImageSrc && !imgError ? (
                <>
                  {/* Ambient Blurred Background Canvas */}
                  <NextImage
                    src={activeImageSrc}
                    alt=""
                    fill
                    unoptimized
                    referrerPolicy="no-referrer"
                    className="object-cover blur-2xl opacity-40 dark:opacity-30 scale-125 select-none pointer-events-none"
                  />

                  {/* Main Crisp Uncropped Image */}
                  <div className="relative w-full h-full p-2 flex items-center justify-center z-10">
                    <NextImage
                      src={activeImageSrc}
                      alt={currentAd.title || "Ad creative"}
                      fill
                      unoptimized
                      referrerPolicy="no-referrer"
                      className="object-contain transition-transform duration-300 group-hover/media:scale-[1.02] drop-shadow-md"
                      onError={handleImageError}
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400 font-medium">
                  {currentAd.mediaType === "video" ? (
                    <Play className="w-8 h-8 text-indigo-400 opacity-70" />
                  ) : (
                    <ImageIcon className="w-8 h-8 opacity-60" />
                  )}
                  <span className="text-[11px] text-slate-400">
                    {currentAd.mediaType === "video" ? "Video Creative" : "Image Creative"}
                  </span>
                </div>
              )}

              {firstVideoUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPlayingVideo(true);
                  }}
                  className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl hover:bg-indigo-500 hover:scale-110 transition-all cursor-pointer z-30"
                  title="Play Video Creative"
                >
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Title */}
        {currentAd.title && (
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1 line-clamp-1">
            {currentAd.title}
          </h4>
        )}

        {/* Copy / Caption */}
        {currentAd.caption && (
          <div className="mb-3">
            <p
              className={`text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed ${
                isExpanded ? "" : "line-clamp-3"
              }`}
            >
              {currentAd.caption}
            </p>
            {currentAd.caption.length > 120 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-1 cursor-pointer"
              >
                {isExpanded ? "Show less" : "Read full copy..."}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-2 mt-auto text-xs">
        {destinationUrl ? (
          <a
            href={destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg shadow-sm transition-all truncate max-w-[72%]"
            title={`Direct Brand Website: ${destinationUrl}`}
          >
            <Globe className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
            <span className="truncate">
              {currentAd.ctaText || "Visit Store"} {targetDomain ? `• ${targetDomain}` : ""}
            </span>
            <ExternalLink className="w-3 h-3 text-indigo-200 shrink-0 ml-0.5" />
          </a>
        ) : (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 italic font-medium">No store website link</span>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRefreshMedia}
            disabled={isRefreshingMedia}
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors cursor-pointer"
            title="Refresh Single Ad Media Links"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshingMedia ? "animate-spin text-indigo-500" : ""}`} />
          </button>

          <button
            onClick={toggleArchive}
            disabled={isArchiving}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              isArchived
                ? "text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                : "text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            }`}
            title={isArchived ? "Unarchive Ad (Move to Active Feed)" : "Archive Ad (Move to Vault)"}
          >
            {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          </button>

          {(firstVideoUrl || displayImage) && (
            <a
              href={firstVideoUrl || displayImage}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors"
              title="Download Media File"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}

          <a
            href={`https://www.facebook.com/ads/library/?id=${currentAd.adArchiveId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-slate-700 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline inline-flex items-center gap-1 p-1 rounded-md"
            title="Open in Meta Ad Library"
          >
            Meta
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        imageUrls={previewImages}
        title={currentAd.title}
        pageName={currentAd.pageName || `Page ${currentAd.pageId}`}
        caption={currentAd.caption}
        destinationUrl={destinationUrl}
        adArchiveId={currentAd.adArchiveId}
      />
    </div>
  );
}
