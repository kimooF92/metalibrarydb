"use client";

import { useState, useEffect, useRef } from "react";
import { Ad } from "@/types";
import { resolveDestinationUrl, getCleanDomain } from "@/lib/utils";
import { calculateWinnerScore } from "@/lib/winner-score";
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
  Ban,
  RotateCw,
  X,
  VolumeX,
  Volume2,
  Award,
  Rocket,
  Zap,
  Sparkles,
  Trophy,
} from "lucide-react";

interface AdRowProps {
  ad: Ad;
  onArchiveToggle?: () => void;
  onExcludeBrand?: (pageId: string) => void;
  onMediaRefreshed?: (newAd: Ad) => void;
}

export function AdRow({ ad, onArchiveToggle, onExcludeBrand, onMediaRefreshed }: AdRowProps) {
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
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync when prop updates
  useEffect(() => {
    setCurrentAd(ad);
    setIsArchived(Boolean(ad.isArchived));
  }, [ad]);

  // Clean up hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

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
  const formatLaunchDate = (dateStr: string | null) => {
    if (!dateStr) return "Unknown date";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Unknown date";

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Launched today";
    if (diffDays === 1) return "Launched yesterday";
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

  // Calculate Winner Metrics
  const winnerMetrics = calculateWinnerScore({
    startedRunningOn: currentAd.startedRunningOn,
    firstSeenAt: currentAd.firstSeenAt,
    lastSeenAt: currentAd.lastSeenAt,
    duplicationCount,
    isActive: currentAd.isActive,
    isArchived: currentAd.isArchived,
    mediaType: currentAd.mediaType,
  });

  const firstVideoUrl = currentAd.mediaUrls?.find(
    (url: string) => url.includes(".mp4") || url.includes("video") || currentAd.mediaType === "video"
  );
  const displayImage = currentAd.signedThumbnailUrl || currentAd.thumbnailUrl || currentAd.mediaUrls?.[0];
  const destinationUrl = resolveDestinationUrl(currentAd.linkUrl);
  const targetDomain = getCleanDomain(currentAd.linkUrl);

  const previewImages = currentAd.mediaUrls && currentAd.mediaUrls.length > 0 ? currentAd.mediaUrls : displayImage ? [displayImage] : [];

  const handleMouseEnter = () => {
    if (!firstVideoUrl || isPlayingVideo || videoError) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
  };

  return (
    <div className="group relative flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-3.5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-md transition-all">
      {/* Left: Thumbnail & Brand Details */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Media Thumbnail */}
        <div
          className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shrink-0 flex items-center justify-center"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isPlayingVideo && firstVideoUrl && !videoError ? (
            <div className="relative w-full h-full bg-black flex items-center justify-center">
              <video
                src={firstVideoUrl}
                controls
                autoPlay
                {...({ referrerPolicy: "no-referrer" } as any)}
                onError={() => setVideoError(true)}
                className="w-full h-full object-contain bg-black"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlayingVideo(false);
                }}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/80 hover:bg-black text-white hover:text-rose-400 transition-all cursor-pointer z-30 shadow-md border border-white/20"
                title="Close Video"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : isPlayingVideo && videoError ? (
            <a
              href={`https://www.facebook.com/ads/library/?id=${currentAd.adArchiveId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center p-2 text-center bg-slate-950 text-indigo-300 w-full h-full gap-1 hover:text-indigo-200"
              title="Watch on Meta Ad Library"
            >
              <Play className="w-5 h-5 text-indigo-400" />
              <span className="text-[9px] font-semibold">Meta Library</span>
            </a>
          ) : isHovered && firstVideoUrl && !videoError ? (
            <div
              className="relative w-full h-full bg-black flex items-center justify-center cursor-pointer group/hovervid"
              onClick={() => setIsPlayingVideo(true)}
            >
              <video
                src={firstVideoUrl}
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
                {...({ referrerPolicy: "no-referrer" } as any)}
                onError={() => {
                  setIsHovered(false);
                  setVideoError(true);
                }}
                className="w-full h-full object-contain bg-black select-none"
              />
              <div className="absolute top-1 left-1 z-20 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/80 border border-white/15 text-[9px] font-semibold text-white pointer-events-none shadow-sm">
                <VolumeX className="w-2.5 h-2.5 text-indigo-400" />
                <span>Muted</span>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full group/media cursor-pointer flex items-center justify-center bg-slate-900 overflow-hidden" onClick={() => setIsPreviewOpen(true)}>
              {activeImageSrc && !imgError ? (
                /* eslint-disable-next-html-shortcut */
                <img
                  src={activeImageSrc}
                  alt={currentAd.title || "Ad creative"}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain transition-transform duration-300 group-hover/media:scale-105"
                  onError={handleImageError}
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-slate-400">
                  {currentAd.mediaType === "video" ? (
                    <Play className="w-6 h-6 text-indigo-400 opacity-70" />
                  ) : (
                    <ImageIcon className="w-6 h-6 opacity-50" />
                  )}
                </div>
              )}

              {firstVideoUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPlayingVideo(true);
                  }}
                  className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-lg hover:bg-indigo-500 hover:scale-110 transition-all cursor-pointer z-10"
                  title="Play Video"
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Info Column */}
        <div className="flex flex-col min-w-0 flex-1 gap-1">
          {/* Header Row: Page Name, Winner Score, Status */}
          <div className="flex items-center gap-2 flex-wrap">
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
                  <Ban className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
              ID: {currentAd.adArchiveId}
            </span>

            {/* Winner Score Badge in List View */}
            <span
              title={`Winner Score: ${winnerMetrics.winnerScore}/100 (Longevity: ${winnerMetrics.daysRunning}d, Scale: ${duplicationCount} copies)`}
              className={`inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-extrabold shadow-sm ${
                winnerMetrics.winnerScore >= 85
                  ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 border border-amber-300"
                  : winnerMetrics.winnerScore >= 68
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                  : winnerMetrics.winnerScore >= 45
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
              }`}
            >
              {winnerMetrics.winnerScore >= 85 ? (
                <Trophy className="w-2.5 h-2.5 fill-slate-950" />
              ) : winnerMetrics.winnerScore >= 68 ? (
                <Flame className="w-2.5 h-2.5 fill-white" />
              ) : (
                <Zap className="w-2.5 h-2.5 text-indigo-500" />
              )}
              <span>{winnerMetrics.winnerScore} Score</span>
            </span>

            {/* Breakout Velocity Badge */}
            {winnerMetrics.isBreakout && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/60 border border-pink-200 dark:border-pink-800 px-1.5 py-0.2 rounded-full animate-pulse">
                <Rocket className="w-2.5 h-2.5 text-pink-500" />
                <span>🚀 Breakout</span>
              </span>
            )}

            {/* Evergreen Badge */}
            {winnerMetrics.isEvergreen && !winnerMetrics.isBreakout && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 rounded-full">
                <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                <span>💎 Evergreen</span>
              </span>
            )}

            {isArchived ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.2 rounded-full">
                <Archive className="w-2.5 h-2.5" /> Archived
              </span>
            ) : currentAd.isActive === true ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.2 rounded-full">
                <CheckCircle2 className="w-2.5 h-2.5" /> Active
              </span>
            ) : currentAd.isActive === false ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.2 rounded-full">
                <XCircle className="w-2.5 h-2.5" /> Inactive
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.2 rounded-full">
                <HelpCircle className="w-2.5 h-2.5" /> Unknown
              </span>
            )}
          </div>

          {/* Badges: Launch Date, Scale & Freshness */}
          <div className="flex items-center gap-2 flex-wrap my-0.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800 font-medium">
              <Calendar className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
              {formatLaunchDate(currentAd.startedRunningOn)}
            </span>

            <span
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border font-semibold ${
                isScaled
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800"
              }`}
            >
              {isScaled ? (
                <Flame className="w-3 h-3 text-amber-500 dark:text-amber-400 fill-amber-500/20" />
              ) : (
                <Layers className="w-3 h-3 text-slate-400" />
              )}
              {duplicationCount} {duplicationCount === 1 ? "Copy" : "Copies"}
              {isScaled && <span className="ml-0.5">🔥 Scaled</span>}
            </span>

            {freshnessLabel && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/60 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                <Clock className="w-2.5 h-2.5 text-slate-400" />
                {freshnessLabel}
              </span>
            )}
          </div>

          {/* Ad Title & Copy Text */}
          {currentAd.title && (
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {currentAd.title}
            </h4>
          )}
          {currentAd.caption && (
            <div>
              <p
                className={`text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed ${
                  isExpanded ? "" : "line-clamp-2"
                }`}
              >
                {currentAd.caption}
              </p>
              {currentAd.caption.length > 100 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer mt-0.5"
                >
                  {isExpanded ? "Show less" : "Expand copy..."}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Direct Brand Store CTA Link & Actions */}
      <div className="flex md:flex-col items-center md:items-end justify-between gap-2 border-t md:border-t-0 pt-2 md:pt-0 border-slate-200 dark:border-slate-800/60 shrink-0">
        {destinationUrl ? (
          <a
            href={destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg shadow-sm transition-all truncate max-w-[220px]"
            title={`Direct Brand Website: ${destinationUrl}`}
          >
            <Globe className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
            <span className="truncate">
              {currentAd.ctaText || "Visit Store"} {targetDomain ? `• ${targetDomain}` : ""}
            </span>
            <ExternalLink className="w-3 h-3 text-indigo-200 shrink-0 ml-0.5" />
          </a>
        ) : (
          <span className="text-[11px] text-slate-400 italic">No store website link</span>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRefreshMedia}
            disabled={isRefreshingMedia}
            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors cursor-pointer"
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
                : "text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-900"
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
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors"
              title="Download Media File"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}

          <a
            href={`https://www.facebook.com/ads/library/?id=${currentAd.adArchiveId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline inline-flex items-center gap-1 p-1 rounded-md"
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
