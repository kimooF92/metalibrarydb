"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Flame,
  TrendingUp,
  Video,
  Eye,
  ShoppingBag,
  Coins,
  MapPin,
  Users,
  Clock,
  Package,
  Layers,
} from "lucide-react";
import { HighConvictionProductOpportunity } from "@/lib/opportunity-seeker";

interface ProductOpportunityCardProps {
  product: HighConvictionProductOpportunity;
  rankIndex: number;
}

export function ProductOpportunityCard({
  product,
  rankIndex,
}: ProductOpportunityCardProps) {
  const [copiedHook, setCopiedHook] = useState(false);
  const [copiedOffer, setCopiedOffer] = useState(false);

  const handleCopyHook = () => {
    if (product.creativeBlueprint?.hookDarijaFrench) {
      navigator.clipboard.writeText(product.creativeBlueprint.hookDarijaFrench);
      setCopiedHook(true);
      setTimeout(() => setCopiedHook(false), 2000);
    }
  };

  const handleCopyOffer = () => {
    if (product.creativeBlueprint?.ctaAndOffer) {
      navigator.clipboard.writeText(product.creativeBlueprint.ctaAndOffer);
      setCopiedOffer(true);
      setTimeout(() => setCopiedOffer(false), 2000);
    }
  };

  const getSaturationBadge = (status: string) => {
    if (status?.toLowerCase().includes("blue ocean") || status?.toLowerCase().includes("unsaturated")) {
      return (
        <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          <span>Blue Ocean</span>
        </span>
      );
    }
    if (status?.toLowerCase().includes("rising")) {
      return (
        <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          <span>Rising Trend</span>
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
        <span>Moderate Competition</span>
      </span>
    );
  };

  const querySearch = encodeURIComponent(product.productName.split(" ").slice(0, 3).join(" "));

  return (
    <div className="w-full rounded-2xl p-5 bg-white/90 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800/90 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 shadow-xs hover:shadow-md transition-all space-y-4 relative flex flex-col justify-between group">
      {/* Top Header Row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
              #{rankIndex + 1}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {product.niche}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {getSaturationBadge(product.saturationStatus)}
          </div>
        </div>

        {/* Product Title */}
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
          {product.productName}
        </h3>

        {/* Target Demographics & Regions */}
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-0.5">
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-indigo-500" />
            <span>{product.targetAudience}</span>
          </div>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <div className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-emerald-500" />
            <span>{product.targetRegions}</span>
          </div>
        </div>
      </div>

      {/* Pricing & Net Profit Economics Strip */}
      <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/70">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
            Target Price (TND)
          </span>
          <span className="text-base font-black text-slate-900 dark:text-white">
            {product.recommendedPriceTND} <span className="text-xs font-semibold">DT</span>
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
            Est. Net Margin
          </span>
          <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
            ~{product.estimatedMarginTND} <span className="text-xs font-semibold">DT</span>
          </span>
        </div>
      </div>

      {/* Why it wins now */}
      <div className="space-y-1 text-xs">
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
          <span className="font-bold text-slate-900 dark:text-white">⚡ Winning Angle: </span>
          {product.whyItWinsNow}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal flex items-center gap-1">
          <Clock className="w-3 h-3 text-amber-500 shrink-0" />
          <span>{product.timingRationale}</span>
        </p>
      </div>

      {/* Creative Testing Blueprint Box */}
      <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-50/70 via-purple-50/30 to-slate-50 dark:from-slate-950 dark:via-indigo-950/20 dark:to-slate-900 border border-indigo-500/20 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
            <Video className="w-3.5 h-3.5" />
            <span>Creative Blueprint ({product.creativeBlueprint?.format || "Video Hook-First"})</span>
          </span>
        </div>

        {/* Copyable Hook */}
        <div className="p-2.5 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
            <span>Bilingual Hook (Darija / French)</span>
            <button
              onClick={handleCopyHook}
              className="flex items-center space-x-1 text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              {copiedHook ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              <span>{copiedHook ? "Copied!" : "Copy Hook"}</span>
            </button>
          </div>
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-sans leading-normal dir-auto">
            {product.creativeBlueprint?.hookDarijaFrench}
          </p>
        </div>

        {/* 3-second visual hook */}
        <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
          <span className="font-bold text-slate-700 dark:text-slate-300">👁️ 3s Visual Hook: </span>
          {product.creativeBlueprint?.visualHook3s}
        </div>

        {/* Offer & CTA */}
        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-indigo-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">
            🎁 {product.creativeBlueprint?.ctaAndOffer}
          </span>
          <button
            onClick={handleCopyOffer}
            className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold shrink-0 ml-1 cursor-pointer"
          >
            {copiedOffer ? "Copied" : "Copy Offer"}
          </button>
        </div>
      </div>

      {/* Sourcing advice & Actions Footer */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <Package className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
          <span><strong className="text-slate-700 dark:text-slate-300">Sourcing: </strong>{product.sourcingTip}</span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Link
            href={`/spy?q=${querySearch}`}
            className="flex items-center space-x-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Search Live Ads in Spy Feed</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
