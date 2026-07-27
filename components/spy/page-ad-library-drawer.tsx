"use client";

import { useAdFeed } from "@/hooks/use-spy";
import { AdCard } from "./ad-card";
import { X, RefreshCw, Eye } from "lucide-react";

interface PageAdLibraryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  trackedPageId: string | null;
  displayName: string | null;
}

export function PageAdLibraryDrawer({
  isOpen,
  onClose,
  trackedPageId,
  displayName,
}: PageAdLibraryDrawerProps) {
  const { ads, isLoading, error, refetch } = useAdFeed(
    trackedPageId ? { trackedPageId, limit: 30 } : undefined
  );

  if (!isOpen || !trackedPageId) return null;

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
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              title="Refresh Ads"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

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
              <span className="text-sm font-medium text-zinc-300 mb-1">
                No creatives extracted yet for this brand
              </span>
              <p className="text-xs text-zinc-500 max-w-sm mb-4">
                Click &quot;Scan Ads&quot; in the main table to queue a Playwright GraphQL extraction run for this brand.
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
