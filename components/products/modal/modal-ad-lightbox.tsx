"use client";

import NextImage from "next/image";
import { Ad } from "@/types";
import { useToast } from "@/components/toast-context";
import {
  X,
  Sparkles,
  Copy,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";

interface ModalAdLightboxProps {
  ad: Ad | null;
  onClose: () => void;
}

export function ModalAdLightbox({ ad, onClose }: ModalAdLightboxProps) {
  const { showToast } = useToast();

  if (!ad) return null;

  const handleCopyAdCopy = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const text = ad.caption || ad.title;
    if (!text) {
      showToast({
        type: "info",
        title: "No Ad Copy",
        message: "This ad creative has no extractable text caption.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast({
        type: "success",
        title: "Ad Copy Copied!",
        message: "Headline & caption copied to clipboard.",
      });
    } catch {
      showToast({
        type: "error",
        title: "Copy Failed",
        message: "Could not access clipboard.",
      });
    }
  };

  const isArchived = Boolean(ad.isArchived || ad.isActive === false);
  const mediaUrl = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0];

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Lightbox Header */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2 truncate">
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {ad.pageName || "Ad Creative Preview"}
            </h3>
            {isArchived ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                Stopped / Archived
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                Currently Active
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lightbox Media */}
        <div className="p-4 overflow-y-auto space-y-4">
          <div className="relative aspect-video w-full rounded-xl bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center">
            {mediaUrl ? (
              <NextImage
                src={mediaUrl}
                alt="Enlarged ad creative"
                fill
                unoptimized
                referrerPolicy="no-referrer"
                className="object-contain"
              />
            ) : (
              <ImageIcon className="w-12 h-12 text-slate-600" />
            )}
          </div>

          {/* Ad Copy Body */}
          {(ad.caption || ad.title) && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Advertiser Ad Copy & Hooks
                </span>
                <button
                  type="button"
                  onClick={handleCopyAdCopy}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy Text</span>
                </button>
              </div>
              {ad.title && (
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {ad.title}
                </h4>
              )}
              {ad.caption && (
                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {ad.caption}
                </p>
              )}
            </div>
          )}

          {/* Actions in Lightbox */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-slate-400 font-mono">
              Ad ID: {ad.adArchiveId}
            </div>
            <a
              href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${ad.adArchiveId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm"
            >
              <span>View in Meta Ad Library</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
