"use client";

import { useState, useEffect } from "react";
import NextImage from "next/image";
import { ScrapedProduct, Ad } from "@/types";
import {
  X,
  ExternalLink,
  ShoppingBag,
  Sparkles,
  Tag,
  Layers,
  Calendar,
  Clock,
  RotateCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Play,
  Image as ImageIcon,
} from "lucide-react";

interface ProductDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ScrapedProduct | null;
  onRefresh?: (productId: string) => Promise<void>;
  onDelete?: (productId: string) => Promise<void>;
}

export function ProductDetailsModal({
  isOpen,
  onClose,
  product,
  onRefresh,
  onDelete,
}: ProductDetailsModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [linkedAds, setLinkedAds] = useState<Ad[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (product) {
      setSelectedImage(product.mainImageUrl || null);
      fetchLinkedAds(product.id);
    }
  }, [product]);

  if (!isOpen || !product) return null;

  async function fetchLinkedAds(productId: string) {
    setLoadingAds(true);
    try {
      const res = await fetch(`/api/spy/ads?productId=${productId}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setLinkedAds(data.ads || data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch linked ads:", err);
    } finally {
      setLoadingAds(false);
    }
  }

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh(product.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const allImages = [
    ...(product.mainImageUrl ? [product.mainImageUrl] : []),
    ...(product.galleryImages || []),
  ].filter((img, idx, arr) => arr.indexOf(img) === idx);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-50 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5 truncate">
            <ShoppingBag className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="truncate">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                {product.title || "Product Landing Page"}
              </h2>
              {product.domain && (
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {product.domain}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefresh && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                title="Re-extract Product"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-500" : ""}`} />
                <span>Refresh</span>
              </button>
            )}

            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all"
            >
              <span>Visit Store</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left: Product Images */}
            <div className="md:col-span-5 flex flex-col gap-3">
              <div className="relative aspect-square w-full bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
                {selectedImage ? (
                  <NextImage
                    src={selectedImage}
                    alt={product.title || "Product image"}
                    fill
                    unoptimized
                    referrerPolicy="no-referrer"
                    className="object-contain p-3"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <ShoppingBag className="w-12 h-12 stroke-[1.5] opacity-40" />
                    <span className="text-xs">No Image</span>
                  </div>
                )}
              </div>

              {/* Thumbnail strip */}
              {allImages.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {allImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(img)}
                      className={`relative w-14 h-14 rounded-lg border-2 overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-950 transition-all ${
                        selectedImage === img
                          ? "border-indigo-600 dark:border-indigo-400 shadow-md"
                          : "border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <NextImage
                        src={img}
                        alt={`Thumbnail ${i + 1}`}
                        fill
                        unoptimized
                        referrerPolicy="no-referrer"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Product Details & Pricing */}
            <div className="md:col-span-7 flex flex-col space-y-4">
              {/* Pricing Block */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                  Pricing & Offers
                </span>
                <div className="flex items-baseline gap-3 flex-wrap">
                  {product.currentPrice ? (
                    <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {product.currentPrice}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400 italic">Price not detected</span>
                  )}

                  {product.originalPrice && (
                    <span className="text-base text-slate-600 dark:text-slate-400 line-through">
                      {product.originalPrice}
                    </span>
                  )}

                  {product.discountOrOffer && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
                      <Tag className="w-3 h-3" />
                      {product.discountOrOffer}
                    </span>
                  )}
                </div>
              </div>

              {/* Multi-Tier Bundle Offers */}
              {product.allOffers && Array.isArray(product.allOffers) && product.allOffers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <span>Bundle & Quantity Options</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {product.allOffers.map((tier, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
                      >
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {(tier as any).tier_name || (tier as any).tierName || "Bundle Tier"}
                        </span>
                        <div className="flex items-baseline justify-between mt-1">
                          <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                            {tier.price}
                          </span>
                          {tier.savings && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {tier.savings}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata details */}
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-medium">Destination URL:</span>
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[280px]"
                  >
                    {product.url}
                  </a>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-medium">First Scraped:</span>
                  <span>{new Date(product.createdAt).toLocaleString()}</span>
                </div>
                {product.lastScrapedAt && (
                  <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-medium">Last Updated:</span>
                    <span>{new Date(product.lastScrapedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Linked Creatives Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Active Ad Creatives Linked to this Landing Page ({linkedAds.length})
                </h4>
              </div>
              {linkedAds.length >= 3 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/20">
                  High Scaling Winner
                </span>
              )}
            </div>

            {loadingAds ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Loading linked creatives...
              </div>
            ) : linkedAds.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800">
                No active ad creatives directly linked to this product ID yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {linkedAds.map((ad) => {
                  const thumb = ad.signedThumbnailUrl || ad.thumbnailUrl || ad.mediaUrls?.[0];
                  return (
                    <a
                      key={ad.id}
                      href={`https://www.facebook.com/ads/library/?id=${ad.adArchiveId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative flex flex-col bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden hover:border-indigo-500 transition-all"
                      title={ad.title || ad.caption || "Ad Creative"}
                    >
                      <div className="relative aspect-square w-full bg-slate-200 dark:bg-slate-900 flex items-center justify-center">
                        {thumb ? (
                          <NextImage
                            src={thumb}
                            alt="Ad creative"
                            fill
                            unoptimized
                            referrerPolicy="no-referrer"
                            className="object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-400" />
                        )}

                        {ad.mediaType === "video" && (
                          <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                            <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                          </div>
                        )}
                      </div>
                      <div className="p-2 truncate text-[10px] font-medium text-slate-600 dark:text-slate-400">
                        {ad.pageName || `Page ${ad.pageId}`}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
