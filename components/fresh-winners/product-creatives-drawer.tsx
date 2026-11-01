"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Play,
  Layers,
  ExternalLink,
  ShoppingBag,
  Flame,
  Clock,
  Sparkles,
  Eye,
  Loader2,
  AlertCircle,
  Video,
  Image as ImageIcon,
} from "lucide-react";
import type { FreshWinnerProduct, Ad } from "@/types";
import { formatPrice } from "@/lib/format-price";
import { useWorkspace } from "@/components/workspace-context";

interface ProductCreativesDrawerProps {
  product: FreshWinnerProduct | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProductCreativesDrawer({
  product,
  isOpen,
  onClose,
}: ProductCreativesDrawerProps) {
  const { activeWorkspace } = useWorkspace();
  const sym = product?.currency || activeWorkspace?.currencySymbol || "DT";

  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "video" | "image">("all");

  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Fetch all ads linked to this product from existing /api/spy/ads
  const fetchAds = useCallback(async (productId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/spy/ads?productId=${encodeURIComponent(productId)}&limit=50&includeMedia=true`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAds(data.ads || data.items || []);
    } catch (err: any) {
      console.error("Failed to load product creatives:", err);
      setError("Failed to load creative angles. Please retry.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && product?.id) {
      fetchAds(product.id);
    } else {
      setAds([]);
      setError(null);
      setFilterType("all");
    }
  }, [isOpen, product?.id, fetchAds]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  const filteredAds = ads.filter((ad) => {
    if (filterType === "all") return true;
    if (filterType === "video") return ad.mediaType === "video";
    return ad.mediaType !== "video";
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      {/* Backdrop click area */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-over Drawer Panel */}
      <div
        ref={drawerRef}
        className="relative w-full max-w-2xl bg-card border-l border-border h-full flex flex-col shadow-2xl z-10 overflow-hidden animate-in slide-in-from-right duration-300"
      >
        {/* 1. Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-border bg-card flex flex-col gap-3 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {product.mainImageUrl && (
                <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0 border border-border">
                  <img
                    src={product.mainImageUrl}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  {product.brand.displayName} • Creative Portfolio
                </span>
                <h2 className="text-base sm:text-lg font-black text-foreground line-clamp-2 mt-0.5 leading-snug">
                  {product.title}
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
              title="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Product Quick Stats Bar */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
            <div className="flex items-center gap-2">
              {product.currentPrice && (
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  {formatPrice(product.currentPrice, sym)}
                </span>
              )}
              {product.discountOrOffer && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  {product.discountOrOffer}
                </span>
              )}
              {product.category && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-muted text-muted-foreground">
                  {product.category}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Visit Store</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </a>
            </div>
          </div>

          {/* Creative Format Tabs */}
          <div className="flex items-center justify-between border-t border-border pt-2.5 mt-1">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFilterType("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterType === "all"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                All ({ads.length})
              </button>
              <button
                onClick={() => setFilterType("video")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  filterType === "video"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Video className="w-3 h-3" />
                <span>Videos ({ads.filter((a) => a.mediaType === "video").length})</span>
              </button>
              <button
                onClick={() => setFilterType("image")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  filterType === "image"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <ImageIcon className="w-3 h-3" />
                <span>Static ({ads.filter((a) => a.mediaType !== "video").length})</span>
              </button>
            </div>

            <span className="text-xs font-semibold text-muted-foreground">
              {product.metrics.totalCopies} Total Copies Scaled
            </span>
          </div>
        </div>

        {/* 2. Drawer Body: Creatives List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
              <span className="text-xs font-semibold">Loading all creative angles...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => fetchAds(product.id)}
                className="font-bold underline hover:no-underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredAds.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <ImageIcon className="w-8 h-8 opacity-30" />
              <span className="text-xs font-semibold">No creatives found in this format.</span>
            </div>
          ) : (
            filteredAds.map((ad, idx) => {
              const isVideo =
                ad.mediaType === "video" ||
                Boolean(ad.mediaUrls?.some((u) => u.includes(".mp4")));
              const mediaUrl =
                (ad.mediaUrls && ad.mediaUrls.length > 0 ? ad.mediaUrls[0] : null) ||
                ad.thumbnailUrl;
              const metaLibraryUrl = `https://www.facebook.com/ads/library/?id=${encodeURIComponent(
                ad.adArchiveId
              )}`;

              return (
                <div
                  key={ad.id || idx}
                  className="rounded-xl border border-border bg-card overflow-hidden shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col md:flex-row gap-4 p-3.5"
                >
                  {/* Media Preview Box */}
                  <div className="relative w-full md:w-48 aspect-4/3 md:aspect-square rounded-lg overflow-hidden bg-muted/60 shrink-0 border border-border/80">
                    {isVideo && mediaUrl?.includes(".mp4") ? (
                      <video
                        src={mediaUrl}
                        poster={ad.thumbnailUrl || undefined}
                        controls
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : mediaUrl ? (
                      <img
                        src={mediaUrl}
                        alt={ad.title || "Creative Angle"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="w-6 h-6 opacity-30" />
                      </div>
                    )}

                    {/* Scale Badge */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-600 text-white shadow-xs">
                      {ad.duplicationCount || 1} Copies
                    </div>

                    {isVideo && !mediaUrl?.includes(".mp4") && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-950/80 text-white">
                        <Play className="w-2.5 h-2.5 fill-white" />
                        <span>VIDEO</span>
                      </div>
                    )}
                  </div>

                  {/* Ad Details, Copy, Headlines */}
                  <div className="flex-1 flex flex-col justify-between min-w-0 space-y-2">
                    <div>
                      {ad.title && (
                        <h4 className="text-xs font-black text-foreground line-clamp-1 leading-snug">
                          {ad.title}
                        </h4>
                      )}

                      {ad.caption ? (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-4 whitespace-pre-line leading-relaxed font-sans">
                          {ad.caption}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic mt-1">
                          No text caption provided.
                        </p>
                      )}
                    </div>

                    {/* Footer Info & Meta Ad Library Link */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60 text-[11px]">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-mono text-[10px]">
                          Archive #{ad.adArchiveId}
                        </span>
                        {ad.ctaText && (
                          <span className="px-1.5 py-0.2 rounded bg-muted font-bold text-[9.5px]">
                            CTA: {ad.ctaText}
                          </span>
                        )}
                      </div>

                      <a
                        href={metaLibraryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View on Meta</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

