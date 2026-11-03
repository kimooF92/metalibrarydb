"use client";

import Link from "next/link";
import { Flame, Eye, ExternalLink, Video, Image as ImageIcon, Layers, Sparkles, ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/format-price";

export interface FreshBreakout {
  id: string;
  adArchiveId: string;
  pageId: string;
  pageName: string | null;
  brandDisplayName: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  startedRunningOn: string | null;
  firstSeenAt: string | null;
  daysRunning: number;
  winnerScore: number;
  winnerTier: "super" | "high" | "promising" | "testing";
  isBreakout: boolean;
  breakoutTier?: "hard" | "standard" | "soft" | null;
  productId: string | null;
  productTitle: string | null;
  productPrice: string | null;
  productCurrency: string | null;
  productImageUrl: string | null;
  storePlatform: string | null;
  activeAdsCount?: number;
}

interface FreshWinnersListProps {
  products: FreshBreakout[];
  loading?: boolean;
  currencySymbol?: string;
}

function getTierBadge(tier: string, score: number) {
  if (tier === "super" || score >= 85) {
    return {
      label: `Super Winner ${score}`,
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    };
  }
  if (tier === "high" || score >= 68) {
    return {
      label: `High Breakout ${score}`,
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
    };
  }
  if (tier === "promising" || score >= 45) {
    return {
      label: `Promising ${score}`,
      className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
    };
  }
  return {
    label: `Testing ${score}`,
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25",
  };
}

function getMediaBadge(mediaType: string | null) {
  if (mediaType === "video") {
    return {
      icon: <Video className="w-3 h-3 text-purple-500 shrink-0" />,
      label: "Video Ad",
      className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    };
  }
  if (mediaType === "carousel") {
    return {
      icon: <Layers className="w-3 h-3 text-cyan-500 shrink-0" />,
      label: "Carousel",
      className: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
    };
  }
  return {
    icon: <ImageIcon className="w-3 h-3 text-blue-500 shrink-0" />,
    label: "Image",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  };
}

export function FreshWinnersList({ products, loading = false, currencySymbol = "DT" }: FreshWinnersListProps) {
  // Deduplication safeguard: Ensure each product appears strictly once by productId or normalized title
  const seenKeys = new Set<string>();
  const displayItems: FreshBreakout[] = [];
  for (const item of products) {
    const key = (item.productId || item.productTitle?.toLowerCase().trim() || item.id).toLowerCase();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      displayItems.push(item);
    }
    if (displayItems.length >= 5) break;
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/40 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 text-amber-500">
            <Flame className="w-3.5 h-3.5" />
          </span>
          <div>
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Fresh Winner Products (Top 5 Breakouts)
            </h2>
          </div>
        </div>
        <Link
          href="/fresh-winners"
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
        >
          <span>View all breakouts</span>
          <span className="text-[11px] font-bold">→</span>
        </Link>
      </div>

      {/* List Body */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {loading ? (
          <div className="p-3 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-lg bg-slate-100 dark:bg-slate-900/50 animate-pulse border border-slate-200/60 dark:border-slate-800/60"
              />
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-10 px-4 text-xs text-slate-500">
            <ShoppingBag className="w-8 h-8 text-indigo-500/40 mx-auto mb-2" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              No breakout winners detected yet
            </p>
            <p className="text-slate-400 mt-1 max-w-sm mx-auto">
              When competitors launch high-velocity ad campaigns with multiple active creatives, top performers will populate here.
            </p>
          </div>
        ) : (
          displayItems.map((item, idx) => {
            const imageSrc = item.productImageUrl || item.thumbnailUrl;
            const title = item.productTitle || item.pageName || `Breakout Ad ${item.adArchiveId}`;
            const brand = item.brandDisplayName || item.pageName || "Competitor Store";
            const price = item.productPrice ? formatPrice(item.productPrice, currencySymbol) : null;
            const tierBadge = getTierBadge(item.winnerTier, item.winnerScore);
            const mediaBadge = getMediaBadge(item.mediaType);
            const spyLink = item.productId
              ? `/spy?productId=${encodeURIComponent(item.productId)}`
              : `/spy?adArchiveId=${encodeURIComponent(item.adArchiveId)}`;

            return (
              <div
                key={item.id}
                className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors group"
              >
                {/* Left: Rank, Image & Product Identity */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Rank */}
                  <span className="w-5 text-center text-xs font-black text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0">
                    #{idx + 1}
                  </span>

                  {/* Thumbnail */}
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 shrink-0 border border-slate-200 dark:border-slate-800">
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <ShoppingBag className="w-5 h-5 opacity-40" />
                      </div>
                    )}
                    {item.storePlatform && (
                      <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black uppercase px-1 py-0.2 rounded bg-black/80 text-white backdrop-blur-xs">
                        {item.storePlatform}
                      </span>
                    )}
                  </div>

                  {/* Identity & Badges */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {/* Winner Score Tier */}
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${tierBadge.className}`}>
                        {tierBadge.label}
                      </span>

                      {/* Active Ads Velocity Count */}
                      {item.activeAdsCount && item.activeAdsCount > 1 ? (
                        <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                          🔥 {item.activeAdsCount} active ads
                        </span>
                      ) : null}

                      {/* Format Badge */}
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${mediaBadge.className}`}>
                        {mediaBadge.icon}
                        <span>{mediaBadge.label}</span>
                      </span>

                      {/* Days running */}
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {item.daysRunning === 0 ? "Launched today" : `${item.daysRunning}d running`}
                      </span>
                    </div>

                    {/* Title */}
                    <Link
                      href={spyLink}
                      className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1"
                      title={title}
                    >
                      {title}
                    </Link>

                    {/* Brand & Price */}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {brand}
                      </span>
                      {price && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                            {price}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={spyLink}
                    title="Spy on Ads"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Spy</span>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
