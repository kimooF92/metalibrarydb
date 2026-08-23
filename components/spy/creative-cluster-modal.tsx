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
  Users,
  Copy,
  Clock,
  ShieldAlert,
} from "lucide-react";

interface CreativeClusterModalProps {
  isOpen: boolean;
  onClose: () => void;
  adId?: string;
  clusterKey?: string;
  mediaHash?: string;
  initialAd?: Ad;
}

export function CreativeClusterModal({
  isOpen,
  onClose,
  adId,
  clusterKey,
  mediaHash,
  initialAd,
}: CreativeClusterModalProps) {
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
        if (clusterKey) query.set("clusterKey", clusterKey);
        if (mediaHash) query.set("mediaHash", mediaHash);

        const res = await fetch(`/api/spy/creative-cluster?${query.toString()}`);
        if (!res.ok) {
          throw new Error("Failed to load creative cluster variations");
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
  }, [isOpen, adId, clusterKey, mediaHash]);

  if (!isOpen) return null;

  const summary = clusterData?.clusterSummary || initialAd?.creativeMetrics;
  const items = clusterData?.items || [];
  const heroAd = items[0] || initialAd;
  const originalCreator = summary?.originalCreator;
  const isCrossBrand = summary?.isCrossBrand;

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
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>Creative Scale & Copycat Intelligence</span>
              </span>

              {isCrossBrand ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  <Users className="w-3 h-3" />
                  <span>Cross-Brand Viral Asset ({summary?.distinctBrandsCount} Brands)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <Layers className="w-3 h-3" />
                  <span>Single-Brand Scaling ({summary?.totalAdSets || items.length} Ad Sets)</span>
                </span>
              )}
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate mt-1">
              {heroAd?.title || heroAd?.pageName || "Visual Creative Variations"}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
              <p className="text-sm font-medium">Analyzing creative fingerprint & copycats...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-red-500">
              <p className="font-semibold">{error}</p>
            </div>
          ) : (
            <>
              {/* Summary Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Total Variations</span>
                  </div>
                  <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                    {summary?.totalAdSets || items.length}
                    <span className="text-xs font-normal text-slate-400 ml-1">ad sets</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-purple-500" />
                    <span>Advertisers / Brands</span>
                  </div>
                  <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                    {summary?.distinctBrandsCount || 1}
                    <span className="text-xs font-normal text-slate-400 ml-1">pages</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                    <span>First Launched</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {summary?.firstSeenAt
                      ? new Date(summary.firstSeenAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Recently"}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>Active Now</span>
                  </div>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {summary?.activeAdsCount ?? items.filter((i) => i.isActive).length}
                    <span className="text-xs font-normal text-slate-400 ml-1">active</span>
                  </div>
                </div>
              </div>

              {/* Original Creator vs Copycat Timeline */}
              {summary?.brands && summary.brands.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-700 dark:text-amber-300">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <span>ADVERTISER TIMELINE & FIRST MOVER</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {summary.brands.map((brand: any, idx: number) => (
                      <div
                        key={brand.pageId}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                          idx === 0
                            ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold"
                            : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        {idx === 0 && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                        <span className="truncate max-w-[140px]">{brand.pageName}</span>
                        <span className="text-slate-400 text-[10px]">
                          ({brand.adCount} ad{brand.adCount > 1 ? "s" : ""})
                        </span>
                        {brand.firstSeenAt && (
                          <span className="text-[10px] text-slate-400 ml-1">
                            {new Date(brand.firstSeenAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Variations List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <span>Ad Variations Running This Creative</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {items.length}
                    </span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {items.map((ad) => {
                    const destination = ad.linkUrl ? resolveDestinationUrl(ad.linkUrl) : null;
                    const domain = destination ? getCleanDomain(destination) : null;

                    return (
                      <div
                        key={ad.id}
                        className="flex flex-col sm:flex-row gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                      >
                        {/* Media Thumbnail */}
                        <div className="relative w-full sm:w-28 h-32 sm:h-28 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200/50 dark:border-slate-800">
                          {ad.thumbnailUrl || (ad.mediaUrls && ad.mediaUrls[0]) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ad.thumbnailUrl || ad.mediaUrls![0]}
                              alt={ad.title || "Ad media"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-slate-400" />
                          )}
                          {ad.mediaType === "video" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Play className="w-6 h-6 text-white fill-white/80" />
                            </div>
                          )}
                        </div>

                        {/* Ad Details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {ad.pageName || `Brand ${ad.pageId}`}
                              </span>
                              {ad.isActive ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                  Inactive
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">ID: {ad.adArchiveId}</span>
                            </div>

                            {ad.caption && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed font-normal">
                                {ad.caption}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                            <div className="flex items-center gap-3">
                              {ad.startedRunningOn && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    {new Date(ad.startedRunningOn).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                </span>
                              )}
                              {ad.ctaText && (
                                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                                  CTA: {ad.ctaText}
                                </span>
                              )}
                            </div>

                            {destination && (
                              <a
                                href={destination}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                <span>{domain || "Landing Page"}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
