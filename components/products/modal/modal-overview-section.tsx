"use client";

import { useState, useEffect } from "react";
import NextImage from "next/image";
import { ScrapedProduct } from "@/types";
import { ShoppingBag, Tag, Truck, Layers } from "lucide-react";

interface ModalOverviewSectionProps {
  product: ScrapedProduct;
  allImages: string[];
}

export function ModalOverviewSection({ product, allImages }: ModalOverviewSectionProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(product.mainImageUrl || null);

  useEffect(() => {
    setSelectedImage(product.mainImageUrl || null);
  }, [product.mainImageUrl]);

  return (
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
              className={`object-contain p-3 transition-all duration-300 ${
                typeof product.activeAdsCount === "number" && product.activeAdsCount === 0
                  ? "grayscale contrast-90 hover:grayscale-0"
                  : ""
              }`}
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
                type="button"
                onClick={() => setSelectedImage(img)}
                className={`relative w-14 h-14 rounded-lg border-2 overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-950 transition-all cursor-pointer ${
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

            {/* Delivery / Tawsil Badge */}
            {(() => {
              const delivery = product.deliveryCost;
              const isFree =
                delivery?.toLowerCase().includes("gratuit") ||
                delivery?.toLowerCase().includes("free") ||
                delivery?.toLowerCase().includes("مجاني") ||
                delivery?.toLowerCase().includes("0 dt") ||
                delivery?.toLowerCase().includes("0dt") ||
                product.discountOrOffer?.toLowerCase().includes("livraison gratuite") ||
                product.discountOrOffer?.toLowerCase().includes("توصيل مجاني");

              const isSpecifiedPaid =
                delivery &&
                delivery !== "Livraison Non Spécifiée" &&
                !isFree;

              const label = isFree
                ? "Livraison Gratuite"
                : isSpecifiedPaid
                ? delivery
                : "Livraison: 7 DT (Standard COD)";

              return (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    isFree
                      ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : isSpecifiedPaid
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                  title={
                    isFree
                      ? "Livraison gratuite / Free Delivery"
                      : isSpecifiedPaid
                      ? `Frais de livraison: ${delivery}`
                      : "Livraison standard COD en Tunisie (~7 DT)"
                  }
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </span>
              );
            })()}
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
            <span className="font-medium">Discovery Date:</span>
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
  );
}
