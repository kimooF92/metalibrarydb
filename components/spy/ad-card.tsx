"use client";

import { useState } from "react";
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
  ZoomIn,
  Archive,
  ArchiveRestore,
} from "lucide-react";

interface AdCardProps {
  ad: Ad;
  onArchiveToggle?: () => void;
}

export function AdCard({ ad, onArchiveToggle }: AdCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isArchived, setIsArchived] = useState(Boolean(ad.isArchived));
  const [isArchiving, setIsArchiving] = useState(false);

  const toggleArchive = async () => {
    setIsArchiving(true);
    const nextState = !isArchived;
    setIsArchived(nextState);
    try {
      const res = await fetch(`/api/spy/ads/${ad.id}`, {
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

  const duplicationCount = ad.duplicationCount || 1;
  const isScaled = duplicationCount >= 5;

  const firstVideoUrl = ad.mediaUrls?.find(
    (url) => url.includes(".mp4") || url.includes("video") || ad.mediaType === "video"
  );
  const displayImage = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0];
  const destinationUrl = resolveDestinationUrl(ad.linkUrl);
  const targetDomain = getCleanDomain(ad.linkUrl);

  const previewImages = ad.mediaUrls && ad.mediaUrls.length > 0 ? ad.mediaUrls : displayImage ? [displayImage] : [];

  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-4 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-md">
      {/* Top Section */}
      <div>
        {/* Brand Name & Status Badges */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {ad.pageName || `Page ${ad.pageId}`}
            </span>
            <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono">
              ID: {ad.adArchiveId}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isArchived ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                <Archive className="w-3 h-3" /> Archived
              </span>
            ) : ad.isActive === true ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            ) : ad.isActive === false ? (
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

        {/* Badges Bar: Launch Date & Scale */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 font-medium">
            <Calendar className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
            {formatLaunchDate(ad.startedRunningOn, ad.firstSeenAt)}
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
        </div>

        {/* Media Container */}
        <div className="relative w-full h-[280px] sm:h-[320px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-900/95 dark:bg-slate-950 mb-3 flex items-center justify-center">
          {isPlayingVideo && firstVideoUrl ? (
            <video
              src={firstVideoUrl}
              controls
              autoPlay
              className="w-full h-full object-contain bg-black rounded-xl"
            />
          ) : displayImage && !imgError ? (
            <div className="relative w-full h-full group/media cursor-pointer flex items-center justify-center" onClick={() => setIsPreviewOpen(true)}>
              {/* Ambient Blurred Background Canvas */}
              <NextImage
                src={displayImage}
                alt=""
                fill
                unoptimized
                className="object-cover blur-2xl opacity-40 dark:opacity-30 scale-125 select-none pointer-events-none"
              />

              {/* Main Crisp Uncropped Image */}
              <div className="relative w-full h-full p-2 flex items-center justify-center z-10">
                <NextImage
                  src={displayImage}
                  alt={ad.title || "Ad creative"}
                  fill
                  unoptimized
                  className="object-contain transition-transform duration-300 group-hover/media:scale-[1.02] drop-shadow-md"
                  onError={() => setImgError(true)}
                />
              </div>

              {/* Hover Zoom Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white z-20">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/85 border border-zinc-700 text-xs font-semibold shadow-lg backdrop-blur-sm">
                  <ZoomIn className="w-4 h-4 text-indigo-400" /> Click to Preview
                </span>
              </div>

              {firstVideoUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPlayingVideo(true);
                  }}
                  className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-lg hover:bg-indigo-500 hover:scale-110 transition-all cursor-pointer z-30"
                  title="Play Video"
                >
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-slate-400 font-medium">
              {ad.mediaType === "video" ? (
                <Play className="w-7 h-7 opacity-60" />
              ) : (
                <ImageIcon className="w-7 h-7 opacity-60" />
              )}
              <span className="text-[11px]">
                {imgError ? "Preview unavailable" : "No media preview"}
              </span>
            </div>
          )}
        </div>

        {/* Title */}
        {ad.title && (
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1 line-clamp-1">
            {ad.title}
          </h4>
        )}

        {/* Copy / Caption */}
        {ad.caption && (
          <div className="mb-3">
            <p
              className={`text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed ${
                isExpanded ? "" : "line-clamp-3"
              }`}
            >
              {ad.caption}
            </p>
            {ad.caption.length > 120 && (
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

      {/* Footer Actions: Direct Brand Store CTA Link */}
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
              {ad.ctaText || "Visit Store"} {targetDomain ? `• ${targetDomain}` : ""}
            </span>
            <ExternalLink className="w-3 h-3 text-indigo-200 shrink-0 ml-0.5" />
          </a>
        ) : (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 italic font-medium">No store website link</span>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
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
            <button
              onClick={() => setIsPreviewOpen(true)}
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md transition-colors cursor-pointer"
              title="Preview Image Ad"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          )}

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
            href={`https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`}
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
        title={ad.title}
        pageName={ad.pageName || `Page ${ad.pageId}`}
        caption={ad.caption}
        destinationUrl={destinationUrl}
        adArchiveId={ad.adArchiveId}
      />
    </div>
  );
}
