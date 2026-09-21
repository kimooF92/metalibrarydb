"use client";

import { useState } from "react";
import NextImage from "next/image";
import { Ad } from "@/types";
import { useToast } from "@/components/toast-context";
import {
  Sparkles,
  RotateCw,
  Plus,
  AlertCircle,
  Play,
  Copy,
  ExternalLink,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";

interface ModalAdGalleryProps {
  productId: string;
  linkedAds: Ad[];
  loadingAds: boolean;
  onRefreshAds: () => Promise<void>;
  onRefreshProduct?: (productId: string) => Promise<void>;
  onQueueVerify: () => void;
  isQueueingVerify: boolean;
  onOpenLightbox: (ad: Ad) => void;
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

  const activeLinkedAds = linkedAds.filter((a: any) => !a.isArchived && a.isActive !== false);
  const inactiveLinkedAds = linkedAds.filter((a: any) => a.isArchived || a.isActive === false);
  const videoLinkedAds = linkedAds.filter((a: any) => a.mediaType === "video");
  const imageLinkedAds = linkedAds.filter((a: any) => a.mediaType === "image" || a.mediaType === "carousel");
  const isAllInactive = linkedAds.length > 0 && activeLinkedAds.length === 0;

  const displayAds = linkedAds.filter((a: any) => {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Linked Ad Creatives Gallery ({linkedAds.length})
          </h4>
          {activeLinkedAds.length >= 3 && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold border border-amber-500/20">
              🔥 Scaled Winner
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onQueueVerify}
            disabled={isQueueingVerify || linkedAds.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer disabled:opacity-50"
            title="Marks all linked ads as Pending so the next worker or GitHub Action scans them"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isQueueingVerify ? "animate-spin" : ""}`} />
            <span>{isQueueingVerify ? "Queueing..." : "Scan All Ads"}</span>
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      {linkedAds.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pb-1">
          <button
            type="button"
            onClick={() => setAdFilter("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              adFilter === "all"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            All ({linkedAds.length})
          </button>
          <button
            type="button"
            onClick={() => setAdFilter("active")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              adFilter === "active"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
            }`}
          >
            Active ({activeLinkedAds.length})
          </button>
          {inactiveLinkedAds.length > 0 && (
            <button
              type="button"
              onClick={() => setAdFilter("stopped")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                adFilter === "stopped"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60"
              }`}
            >
              Stopped ({inactiveLinkedAds.length})
            </button>
          )}
          {videoLinkedAds.length > 0 && (
            <button
              type="button"
              onClick={() => setAdFilter("video")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                adFilter === "video"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
              }`}
            >
              🎬 Videos ({videoLinkedAds.length})
            </button>
          )}
          {imageLinkedAds.length > 0 && (
            <button
              type="button"
              onClick={() => setAdFilter("image")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                adFilter === "image"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/60"
              }`}
            >
              🖼️ Images ({imageLinkedAds.length})
            </button>
          )}
        </div>
      )}

      {isAllInactive && (
        <div className="mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <span>All linked ad creatives have stopped running or were archived by the advertiser.</span>
        </div>
      )}

      {/* Quick Add Ad Creative Form */}
      <form onSubmit={handleLinkAd} className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Sparkles className="w-4 h-4 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={newAdInput}
            onChange={(e) => setNewAdInput(e.target.value)}
            placeholder="Paste specific Meta Ad URL (e.g. https://facebook.com/ads/library/?...&id=27539319635709933) or Ad ID to link..."
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
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {displayAds.map((ad: any) => {
            const isAdArchived = Boolean(ad.isArchived || ad.isActive === false);
            const thumb = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0];
            const isThisUnlinking = unlinkingAdId === ad.id;
            const duration = getAdDuration(ad);

            return (
              <div
                key={ad.id}
                className={`group relative flex flex-col bg-slate-50 dark:bg-slate-950 rounded-lg border overflow-hidden transition-all ${
                  isAdArchived
                    ? "border-rose-500/30 opacity-75 hover:opacity-100 hover:border-rose-500"
                    : "border-slate-200 dark:border-slate-800 hover:border-indigo-500"
                }`}
              >
                <div
                  onClick={() => onOpenLightbox(ad)}
                  className="relative aspect-square w-full bg-slate-200 dark:bg-slate-900 flex items-center justify-center cursor-pointer overflow-hidden"
                  title={`${ad.title || ad.caption || "Ad Creative"} (Click to enlarge & view ad copy)`}
                >
                  {thumb ? (
                    <NextImage
                      src={thumb}
                      alt="Ad creative"
                      fill
                      unoptimized
                      referrerPolicy="no-referrer"
                      className={`object-cover transition-transform group-hover:scale-105 ${
                        isAdArchived ? "grayscale-[40%]" : ""
                      }`}
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-400" />
                  )}

                  {/* Top-Left: Duration & Duplication Badges */}
                  <div className="absolute top-1.5 left-1.5 z-10 flex flex-col items-start gap-1">
                    {duration && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-900/85 backdrop-blur-xs text-slate-200 text-[9px] font-bold border border-slate-700/80 shadow-xs">
                        ⏳ {duration}
                      </span>
                    )}
                    {ad.duplicationCount && ad.duplicationCount > 1 && (
                      <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-rose-500 text-white text-[9px] font-black shadow-xs">
                        🔥 {ad.duplicationCount}x
                      </span>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className="absolute top-1.5 right-1.5 z-10">
                    {isAdArchived ? (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950/80 backdrop-blur-sm text-rose-300 text-[9px] font-bold border border-rose-500/40">
                        Inactive
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 backdrop-blur-sm text-emerald-300 text-[9px] font-bold border border-emerald-500/40">
                        Active
                      </span>
                    )}
                  </div>

                  {ad.mediaType === "video" && (
                    <div className="absolute bottom-1.5 left-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                      <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-2 py-0.5 rounded-full bg-slate-900/90 text-white text-[9px] font-bold backdrop-blur-xs shadow-md">
                      Quick View
                    </span>
                  </div>
                </div>

                <div className="p-2 truncate text-[10px] font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between">
                  <span className="truncate">{ad.pageName || `Page ${ad.pageId}`}</span>
                  <div className="flex items-center gap-1">
                    {(ad.caption || ad.title) && (
                      <button
                        type="button"
                        onClick={(e) => handleCopyAdCopy(ad, e)}
                        className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 rounded transition-colors cursor-pointer"
                        title="Copy Ad Copywriting / Text"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                    <a
                      href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&id=${ad.adArchiveId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors"
                      title="Open in Meta Ad Library"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleUnlinkAd(ad.id, ad.adArchiveId)}
                      disabled={isThisUnlinking}
                      className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition-colors cursor-pointer"
                      title="Unlink ad from product"
                    >
                      {isThisUnlinking ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin text-rose-500" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
