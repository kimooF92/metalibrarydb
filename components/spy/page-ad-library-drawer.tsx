"use client";

import { useAdFeed } from "@/hooks/use-spy";
import { AdCard } from "./ad-card";
import { X, RefreshCw, Eye, Info, Layers } from "lucide-react";

interface PageAdLibraryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  trackedPageId: string | null;
  displayName: string | null;
  currentResults?: number | null;
}

export function PageAdLibraryDrawer({
  isOpen,
  onClose,
  trackedPageId,
  displayName,
  currentResults,
}: PageAdLibraryDrawerProps) {
  const { ads, isLoading, error, refetch } = useAdFeed({
    trackedPageId: trackedPageId || undefined,
    limit: 100,
    enabled: isOpen && Boolean(trackedPageId),
  });

  if (!isOpen || !trackedPageId) return null;

  const totalCopies = ads.reduce((acc, ad) => acc + (ad.duplicationCount || 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="relative w-full max-w-3xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-base font-semibold text-zinc-100">
                {displayName || "Brand Ad Library"}
              </h3>
              <p className="text-xs text-zinc-400">Extracted Ad Creatives & Copies</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Refresh Ads"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Ad Count Comparison Callout Banner */}
        {!isLoading && ads.length > 0 && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/60 text-indigo-200 text-xs flex items-start gap-2.5 shadow-sm">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <div className="flex items-center gap-2 font-bold text-white mb-1">
                <span>Ad Count Breakdown:</span>
                {currentResults !== undefined && currentResults !== null && (
                  <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-mono">
                    {currentResults} Total Meta Ad Variants
                  </span>
                )}
              </div>
              <p className="text-zinc-300">
                Extracted <strong className="text-white font-semibold">{ads.length} unique creative concepts</strong> representing{" "}
                <strong className="text-white font-semibold">{totalCopies} total active ad copies</strong> across Meta. Identical creative variations are collated into scaled creative cards.
              </p>
            </div>
          </div>
        )}

        {/* Drawer Body: Ad Cards Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-sm">Loading extracted ad creatives...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-sm">
              Failed to load creatives: {error}
            </div>
          ) : ads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center p-6 border border-dashed border-zinc-800 rounded-xl">
              <Layers className="w-8 h-8 text-zinc-600 mb-2 opacity-50" />
              <span className="text-sm font-medium text-zinc-300 mb-1">
                No creatives extracted yet for this brand
              </span>
              <p className="text-xs text-zinc-500 max-w-sm mb-4">
                {currentResults ? `Meta lists ${currentResults} active ads for this page. ` : ""}
                Click &quot;Extract Ad Spy&quot; in the main table to queue a Playwright extraction run for this brand.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ads.map((ad) => (
                <AdCard key={ad.id} ad={ad} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
