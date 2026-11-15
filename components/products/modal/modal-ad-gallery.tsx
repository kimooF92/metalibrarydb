"use client";

import { useState, useMemo } from "react";
import NextImage from "next/image";
import { Ad } from "@/types";
import { useToast } from "@/components/toast-context";
import { getSmartMediaUrl } from "@/lib/image-proxy-url";
import { isGenuineVideoUrl } from "@/lib/fb-cdn";
import { cn } from "@/lib/utils";
import {
  RotateCw,
  Plus,
  AlertCircle,
  Play,
  Copy,
  ExternalLink,
  Trash2,
  Image as ImageIcon,
  Link2,
} from "lucide-react";

interface ModalAdGalleryProps {
  productId: string;
  linkedAds: Ad[];
  loadingAds: boolean;
  onRefreshAds: () => Promise<void>;
  onRefreshProduct?: (productId: string) => Promise<void>;
  onQueueVerify: () => void;
  isQueueingVerify: boolean;
  onOpenLightbox: (ad: Ad, filteredAds?: Ad[]) => void;
}

export function ModalAdGallery({
  productId,
  linkedAds,
  loadingAds,
  onRefreshAds,
  onRefreshProduct,
  onQueueVerify,
  isQueueingVerify,
  onOpenLightbox,
}: ModalAdGalleryProps) {
  const { showToast } = useToast();
  const [adFilter, setAdFilter] = useState<"all" | "active" | "stopped" | "video" | "image">("all");
  const [newAdInput, setNewAdInput] = useState("");
  const [isLinkingAd, setIsLinkingAd] = useState(false);
  const [unlinkingAdId, setUnlinkingAdId] = useState<string | null>(null);

  // Deduplicate linkedAds by id, adArchiveId, and primary media signature
  const uniqueLinkedAds = useMemo(() => {
    const seenArchiveIds = new Set<string>();
    const seenMediaSignatures = new Set<string>();
    const seenIds = new Set<string>();
    const result: Ad[] = [];

    for (const ad of linkedAds) {
      if (!ad || !ad.id) continue;
      if (seenIds.has(ad.id)) continue;

      const archiveId = ad.adArchiveId?.trim();
      if (archiveId && seenArchiveIds.has(archiveId)) continue;

      const rawThumb = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0] || "";
      const baseThumb = rawThumb.split("?")[0].trim();
      const sig = baseThumb && baseThumb.length > 10 ? `${ad.mediaType}:${baseThumb}` : null;
      if (sig && seenMediaSignatures.has(sig)) continue;

      seenIds.add(ad.id);
      if (archiveId) seenArchiveIds.add(archiveId);
      if (sig) seenMediaSignatures.add(sig);
      result.push(ad);
    }
    return result;
  }, [linkedAds]);

  const activeLinkedAds = uniqueLinkedAds.filter((a: any) => !a.isArchived && a.isActive !== false);
  const inactiveLinkedAds = uniqueLinkedAds.filter((a: any) => a.isArchived || a.isActive === false);
  const videoLinkedAds = uniqueLinkedAds.filter((a: any) => a.mediaType === "video");
  const imageLinkedAds = uniqueLinkedAds.filter((a: any) => a.mediaType === "image" || a.mediaType === "carousel");
  const isAllInactive = uniqueLinkedAds.length > 0 && activeLinkedAds.length === 0;

  const displayAds = uniqueLinkedAds.filter((a: any) => {
    const isAdArchived = Boolean(a.isArchived || a.isActive === false);
    if (adFilter === "active") return !isAdArchived;
    if (adFilter === "stopped") return isAdArchived;
    if (adFilter === "video") return a.mediaType === "video";
    if (adFilter === "image") return a.mediaType === "image" || a.mediaType === "carousel";
    return true;
  });

  const getAdDuration = (ad: any) => {
    const dateStr = ad.startedRunningOn || ad.firstSeenAt;
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const days = Math.max(1, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
    return `${days}d`;
  };

  const handleLinkAd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!productId || !newAdInput.trim() || isLinkingAd) return;
    setIsLinkingAd(true);
    try {
      const res = await fetch(`/api/products/${productId}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adUrl: newAdInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Ad Linked",
          message: data.message || "Specific Meta Ad creative linked to product.",
        });
        setNewAdInput("");
        await onRefreshAds();
        onRefreshProduct?.(productId);
      } else {
        showToast({
          type: "error",
          title: "Failed to Link Ad",
          message: data.error || "Could not link ad",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Network error linking ad",
      });
    } finally {
      setIsLinkingAd(false);
    }
  };

  const handleUnlinkAd = async (adId: string, adArchiveId: string) => {
    if (!productId || unlinkingAdId) return;
    setUnlinkingAdId(adId);
    try {
      const res = await fetch(`/api/products/${productId}/ads`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, adArchiveId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast({
          type: "success",
          title: "Ad Unlinked",
          message: "Ad creative removed from this product.",
        });
        await onRefreshAds();
        onRefreshProduct?.(productId);
      } else {
        showToast({
          type: "error",
          title: "Error",
          message: data.error || "Could not unlink ad",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Network error unlinking ad",
      });
    } finally {
      setUnlinkingAdId(null);
    }
  };

  const handleCopyAdCopy = async (ad: Ad, e?: React.MouseEvent) => {
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

  const firstValidPageId = linkedAds.find(
    (a: any) => a.pageId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.pageId)
  )?.pageId;

  return (
    <div className="space-y-3">
      {/* Streamlined Quick Filters Bar (No Headline, No Emojis) */}
      {uniqueLinkedAds.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap pb-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setAdFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                adFilter === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              All ({uniqueLinkedAds.length})
            </button>
            <button
              type="button"
              onClick={() => setAdFilter("active")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                adFilter === "active"
                  ? "bg-emerald-600 text-white font-bold shadow-xs"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
              )}
            >
              Active ({activeLinkedAds.length})
            </button>
            {videoLinkedAds.length > 0 && (
              <button
                type="button"
                onClick={() => setAdFilter("video")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  adFilter === "video"
                    ? "bg-indigo-600 text-white font-bold shadow-xs"
                    : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                )}
              >
                Videos ({videoLinkedAds.length})
              </button>
            )}
            {imageLinkedAds.length > 0 && (
              <button
                type="button"
                onClick={() => setAdFilter("image")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  adFilter === "image"
                    ? "bg-purple-600 text-white font-bold shadow-xs"
                    : "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/60"
                )}
              >
                Images ({imageLinkedAds.length})
              </button>
            )}
            {inactiveLinkedAds.length > 0 && (
              <button
                type="button"
                onClick={() => setAdFilter("stopped")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  adFilter === "stopped"
                    ? "bg-rose-600 text-white font-bold shadow-xs"
                    : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60"
                )}
              >
                Stopped ({inactiveLinkedAds.length})
              </button>
            )}
          </div>

          {activeLinkedAds.length >= 3 && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold border border-amber-500/20 shrink-0">
              Scaled Winner
            </span>
          )}
        </div>
      )}

      {isAllInactive && (
        <div className="mb-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <span>All linked ad creatives have stopped running or were archived by the advertiser.</span>
        </div>
      )}

      {/* Quick Add Ad Creative Form */}
      <form onSubmit={handleLinkAd} className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={newAdInput}
            onChange={(e) => setNewAdInput(e.target.value)}
            placeholder="Paste Meta Ad URL or Ad ID to link..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono"
            disabled={isLinkingAd}
          />
        </div>
        <button
          type="submit"
          disabled={!newAdInput.trim() || isLinkingAd}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all cursor-pointer shrink-0"
        >
          {isLinkingAd ? (
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          <span>Link Ad</span>
        </button>
      </form>

      {loadingAds ? (
        <div className="py-8 text-center text-xs text-slate-400">
          Loading linked creatives...
        </div>
      ) : displayAds.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
          {linkedAds.length === 0
            ? "No active ad creatives linked yet. Paste a Meta Ad Library URL with id=... above to link one."
            : `No ad creatives match the "${adFilter}" filter.`}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          {displayAds.map((ad: any) => {
            const isAdArchived = Boolean(ad.isArchived || ad.isActive === false);
            const isVideo = ad.mediaType === "video" || (ad.mediaUrls && ad.mediaUrls.some((u: string) => isGenuineVideoUrl(u)));
            const rawThumb = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.find((u: string) => !isGenuineVideoUrl(u)) || null;
            const smartThumb = rawThumb ? getSmartMediaUrl(rawThumb) : null;
            const isThisUnlinking = unlinkingAdId === ad.id;
            const duration = getAdDuration(ad);

            return (
              <div
                key={ad.id}
                onClick={() => onOpenLightbox(ad, displayAds)}
                className={cn(
                  "group relative flex flex-col bg-white dark:bg-slate-900 rounded-xl border overflow-hidden transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md",
                  isAdArchived
                    ? "border-rose-500/25 opacity-80 hover:opacity-100 hover:border-rose-500/60"
                    : "border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500"
                )}
              >
                {/* Card Header Strip: Status, Duration & Actions */}
                <div
                  className="px-2.5 py-1.5 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                        isAdArchived
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", isAdArchived ? "bg-rose-500" : "bg-emerald-500 animate-pulse")} />
                      <span>{isAdArchived ? "Stopped" : "Active"}</span>
                    </span>
                    {duration && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                        • {duration}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {(ad.caption || ad.title) && (
                      <button
                        type="button"
                        onClick={(e) => handleCopyAdCopy(ad, e)}
                        className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors"
                        title="Copy caption"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {ad.adArchiveId && (
                      <a
                        href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${ad.adArchiveId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors"
                        title="Open in Meta Ad Library"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleUnlinkAd(ad.id, ad.adArchiveId)}
                      disabled={isThisUnlinking}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors"
                      title="Unlink ad"
                    >
                      {isThisUnlinking ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin text-rose-500" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Media Viewport */}
                <div className="relative aspect-[4/3] w-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center overflow-hidden">
                  {smartThumb ? (
                    <NextImage
                      src={smartThumb}
                      alt="Ad creative"
                      fill
                      unoptimized
                      referrerPolicy="no-referrer"
                      className={cn(
                        "object-cover transition-transform duration-300 group-hover:scale-105",
                        isAdArchived && "grayscale-[30%]"
                      )}
                    />
                  ) : isVideo ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 text-indigo-500">
                      <Play className="w-10 h-10 fill-indigo-500/20" />
                      <span className="text-[10px] font-bold">Watch Video</span>
                    </div>
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-400" />
                  )}

                  {/* Centered Translucent Play Icon for Videos */}
                  {isVideo && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-slate-950/70 text-white backdrop-blur-xs border border-white/20 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-indigo-600 transition-all">
                        <Play className="w-4 h-4 fill-white ml-0.5" />
                      </div>
                    </div>
                  )}

                  {/* Duplication Count Pill */}
                  {ad.duplicationCount && ad.duplicationCount > 1 && (
                    <div className="absolute bottom-1.5 left-1.5 z-10">
                      <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-rose-500 text-white text-[9px] font-black shadow-xs">
                        🔥 {ad.duplicationCount}x
                      </span>
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-2.5 py-1 rounded-full bg-slate-900/90 text-white text-[10px] font-bold backdrop-blur-xs shadow-md border border-white/10">
                      Inspect Creative ↗
                    </span>
                  </div>
                </div>

                {/* Card Footer: Page Name & Caption Snippet */}
                <div className="p-2.5 space-y-1 bg-white dark:bg-slate-900">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    <span className="truncate">{ad.pageName || `Advertiser ${ad.pageId || ""}`}</span>
                    <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                      {isVideo ? "Video" : "Image"}
                    </span>
                  </div>
                  {ad.caption && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 text-left">
                      {ad.caption}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
