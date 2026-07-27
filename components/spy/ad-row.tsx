"use client";

import { useState } from "react";
import { Ad } from "@/types";
import { resolveDestinationUrl, getCleanDomain } from "@/lib/utils";
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
} from "lucide-react";

interface AdRowProps {
  ad: Ad;
}

export function AdRow({ ad }: AdRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);

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

  const duplicationCount = ad.duplicationCount || 1;
  const isScaled = duplicationCount >= 5;

  const firstVideoUrl = ad.mediaUrls?.find(
    (url) => url.includes(".mp4") || url.includes("video") || ad.mediaType === "video"
  );
  const displayImage = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0];
  const destinationUrl = resolveDestinationUrl(ad.linkUrl);
  const targetDomain = getCleanDomain(ad.linkUrl);

  return (
    <div className="group relative flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 p-3.5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700/80 hover:shadow-md transition-all">
      {/* Left: Thumbnail & Brand Details */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Media Thumbnail */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shrink-0 flex items-center justify-center">
          {isPlayingVideo && firstVideoUrl ? (
            <video
              src={firstVideoUrl}
              controls
              autoPlay
              className="w-full h-full object-contain bg-black"
            />
          ) : displayImage ? (
            <div className="relative w-full h-full group/media">
              {/* eslint-disable-next-html-shortcut */}
              <img
                src={displayImage}
                alt={ad.title || "Ad creative"}
                className="w-full h-full object-cover transition-transform duration-300 group-hover/media:scale-105"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
              {firstVideoUrl && (
                <button
                  onClick={() => setIsPlayingVideo(true)}
                  className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-lg hover:bg-indigo-500 hover:scale-110 transition-all cursor-pointer"
                  title="Play Video"
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </button>
              )}
            </div>
          ) : (
            <ImageIcon className="w-6 h-6 text-slate-400 opacity-50" />
          )}
        </div>

        {/* Info Column */}
        <div className="flex flex-col min-w-0 flex-1 gap-1">
          {/* Header Row: Page Name & Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {ad.pageName || `Page ${ad.pageId}`}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
              ID: {ad.adArchiveId}
            </span>

            {ad.isActive === true && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.2 rounded-full">
                <CheckCircle2 className="w-2.5 h-2.5" /> Active
              </span>
            )}
            {ad.isActive === false && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.2 rounded-full">
                <XCircle className="w-2.5 h-2.5" /> Inactive
              </span>
            )}
            {ad.isActive === undefined && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.2 rounded-full">
                <HelpCircle className="w-2.5 h-2.5" /> Unknown
              </span>
            )}
          </div>

          {/* Badges: Launch Date & Scale */}
          <div className="flex items-center gap-2 flex-wrap my-0.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800 font-medium">
              <Calendar className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
              {formatLaunchDate(ad.startedRunningOn)}
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
          </div>

          {/* Ad Title & Copy Text */}
          {ad.title && (
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {ad.title}
            </h4>
          )}
          {ad.caption && (
            <div>
              <p
                className={`text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed ${
                  isExpanded ? "" : "line-clamp-2"
                }`}
              >
                {ad.caption}
              </p>
              {ad.caption.length > 100 && (
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

      {/* Right Column: Direct Brand Store CTA Link */}
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
              {ad.ctaText || "Visit Store"} {targetDomain ? `• ${targetDomain}` : ""}
            </span>
            <ExternalLink className="w-3 h-3 text-indigo-200 shrink-0 ml-0.5" />
          </a>
        ) : (
          <span className="text-[11px] text-slate-400 italic">No store website link</span>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
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
            href={`https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`}
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
    </div>
  );
}
