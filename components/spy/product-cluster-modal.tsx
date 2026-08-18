"use client";

import { useState, useEffect } from "react";
import { Ad } from "@/types";
import { resolveDestinationUrl, getCleanDomain } from "@/lib/utils";
import {
  X,
  ExternalLink,
  Layers,
  Video,
  Image as ImageIcon,
  Flame,
  Calendar,
  Sparkles,
  Trophy,
  Crown,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface ProductClusterModalProps {
  isOpen: boolean;
  onClose: () => void;
  adId?: string;
  pageId?: string;
  productKey?: string;
  initialAd?: Ad;
}

export function ProductClusterModal({
  isOpen,
  onClose,
  adId,
  pageId,
  productKey,
  initialAd,
}: ProductClusterModalProps) {
  const [loading, setLoading] = useState(true);
  const [clusterData, setClusterData] = useState<{
    clusterSummary: any;
    items: Ad[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchCluster() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        if (adId) query.set("adId", adId);
        if (pageId) query.set("pageId", pageId);
        if (productKey) query.set("productKey", productKey);

        const res = await fetch(`/api/spy/product-cluster?${query.toString()}`);
        if (!res.ok) {
          throw new Error("Failed to load product cluster creatives");
        }
        const data = await res.json();
        setClusterData(data);
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchCluster();
  }, [isOpen, adId, pageId, productKey]);

  if (!isOpen) return null;

  const summary = clusterData?.clusterSummary;
  const items = clusterData?.items || [];
  const landingUrl = summary?.cleanProductUrl || initialAd?.cleanProductUrl || initialAd?.linkUrl;
  const destinationUrl = landingUrl ? resolveDestinationUrl(landingUrl) : null;
  const domain = landingUrl ? getCleanDomain(landingUrl) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex flex-col gap-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                <Layers className="w-3.5 h-3.5" />
                <span>Product Creative Cluster</span>
              </span>

              {summary?.isFlagship && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  <Crown className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                  <span>👑 Flagship Hero Product</span>
                </span>
              )}
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate mt-1">
              {summary?.productName || initialAd?.productName || initialAd?.title || "Product Creatives"}
            </h3>

            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
              <span>Brand: <strong className="text-slate-900 dark:text-slate-200 font-semibold">{summary?.brandName || initialAd?.pageName || "Competitor Page"}</strong></span>
              <span>•</span>
              <span>Tested <strong className="text-indigo-600 dark:text-indigo-400 font-semibold">{summary?.brandTotalProducts || 1} products</strong></span>
              {summary?.productSharePercent && (
                <>
                  <span>•</span>
                  <span><strong className="text-amber-600 dark:text-amber-400">{summary.productSharePercent}%</strong> of brand's creative catalog</span>
                </>
              )}
            </div>

            {destinationUrl && (
              <a
                href={destinationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium mt-0.5 truncate"
              >
                <span>Landing Page: {domain || destinationUrl}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Row */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-100/60 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <Layers className="w-4 h-4 text-indigo-500" />
              <div>
                <span className="text-[10px] text-slate-500 block">Total Angles Tested</span>
                <strong className="text-slate-900 dark:text-slate-100 font-bold">{summary.totalCreatives} Creatives</strong>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <Video className="w-4 h-4 text-purple-500" />
              <div>
                <span className="text-[10px] text-slate-500 block">Video vs Static</span>
                <strong className="text-slate-900 dark:text-slate-100 font-bold">{summary.videoCount} Videos / {summary.imageCount} Img</strong>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <Flame className="w-4 h-4 text-amber-500" />
              <div>
                <span className="text-[10px] text-slate-500 block">Active Running Ads</span>
                <strong className="text-slate-900 dark:text-slate-100 font-bold">{summary.activeAdsCount} of {summary.totalCreatives} Active</strong>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <Trophy className="w-4 h-4 text-emerald-500" />
              <div>
                <span className="text-[10px] text-slate-500 block">Total Running Copies</span>
                <strong className="text-slate-900 dark:text-slate-100 font-bold">{summary.totalRunningCopies} Copies</strong>
              </div>
            </div>
          </div>
        )}

        {/* Content Body: Creatives Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 scrollbar-thin">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="text-xs font-semibold">Grouping product creatives & angles...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-rose-500 text-xs">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No sister creatives found for this product cluster.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {items.map((item, idx) => {
                const isVideo = item.mediaType === "video";
                const displayImg = item.signedThumbnailUrl || item.thumbnailUrl || item.mediaUrls?.[0];
                const firstVideo = item.mediaUrls?.find((u) => u.includes(".mp4") || u.includes("video"));

                return (
                  <div
                    key={item.id || idx}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-3 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-700 transition"
                  >
                    <div>
                      {/* Media Preview */}
                      <div className="relative w-full h-44 rounded-lg overflow-hidden bg-slate-900 mb-2.5 flex items-center justify-center border border-slate-200 dark:border-slate-800">
                        {displayImg ? (
                          <img
                            src={displayImg}
                            alt={item.title || "Creative"}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-slate-400">
                            {isVideo ? <Video className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
                          </div>
                        )}

                        {/* Format Pill */}
                        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 text-[10px] font-bold text-white backdrop-blur-sm border border-white/10">
                          {isVideo ? <Video className="w-3 h-3 text-purple-400" /> : <ImageIcon className="w-3 h-3 text-blue-400" />}
                          <span>{isVideo ? "Video Angle" : "Static Image"}</span>
                        </div>

                        {/* Winner Score */}
                        {item.winnerScore && item.winnerScore > 0 && (
                          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 text-[10px] font-extrabold text-amber-400 backdrop-blur-sm border border-amber-400/20">
                            <Trophy className="w-3 h-3 text-amber-400" />
                            <span>{item.winnerScore} Score</span>
                          </div>
                        )}
                      </div>

                      {/* Creative Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-2 text-[10px]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          <Calendar className="w-2.5 h-2.5 text-indigo-500" />
                          {item.startedRunningOn
                            ? new Date(item.startedRunningOn).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                            : "Recent"}
                        </span>

                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800">
                          <Flame className="w-2.5 h-2.5 text-amber-500" />
                          {item.duplicationCount || 1} Copies
                        </span>

                        {item.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                            <XCircle className="w-2.5 h-2.5 text-slate-400" /> Inactive
                          </span>
                        )}
                      </div>

                      {/* Ad Caption snippet */}
                      {item.caption && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed mb-2">
                          {item.caption}
                        </p>
                      )}
                    </div>

                    {/* Bottom CTA */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <a
                        href={`https://www.facebook.com/ads/library/?id=${item.adArchiveId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <span>Meta Ad Library</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
