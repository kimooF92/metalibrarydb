"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  TrendingUp,
  Tag,
  DollarSign,
  Layers,
  Sparkles,
  Search,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Globe,
  SlidersHorizontal,
  ChevronRight,
  Zap,
  Star,
} from "lucide-react";
import { KPICard } from "./kpi-card";
import { ProgressBarRow } from "./progress-bar-row";
import { LeaderboardRow } from "./leaderboard-row";
import { ProductDetailsModal } from "@/components/products/product-details-modal";
import { ScrapedProduct } from "@/types";
import { DateRange, getDateRangeDescription } from "./date-range-filter";

interface ProductAnalyticsTabProps {
  data: any;
  isLoading: boolean;
  onRefresh: () => void;
  dateRange?: DateRange;
}

export function ProductAnalyticsTab({
  data,
  isLoading,
  onRefresh,
  dateRange = "7d",
}: ProductAnalyticsTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [productSearch, setProductSearch] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<ScrapedProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const summary = data?.summary || {};
  const dataQuality = data?.dataQuality || {};
  const categories: any[] = data?.categories || [];
  const subCategories: any[] = data?.subCategories || [];
  const priceTiers: any[] = data?.priceTiers || [];
  const platforms: any[] = data?.platforms || [];
  const topProducts: any[] = data?.topProducts || [];
  const crossStoreClones: any[] = data?.crossStoreClones || [];

  const topCategory = useMemo(() => {
    return categories.length > 0 ? categories[0] : null;
  }, [categories]);

  const filteredTopProducts = useMemo(() => {
    let list = topProducts;
    if (selectedCategory !== "all") {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      list = list.filter(
        (p) =>
          (p.title && p.title.toLowerCase().includes(q)) ||
          (p.domain && p.domain.toLowerCase().includes(q)) ||
          (p.brandName && p.brandName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [topProducts, selectedCategory, productSearch]);

  const filteredSubCategories = useMemo(() => {
    if (selectedCategory === "all") return subCategories;
    return subCategories.filter((s) => s.category === selectedCategory);
  }, [subCategories, selectedCategory]);

  return (
    <div className="space-y-6">
      {/* 1. KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title="Total Products"
          value={summary.totalProducts ? Number(summary.totalProducts).toLocaleString() : "0"}
          icon={ShoppingBag}
          colorTheme="indigo"
          badge={{
            text: `+${summary.newInWindow || 0} ${getDateRangeDescription(dateRange).toLowerCase()}`,
            variant: "indigo",
          }}
          subtext={`${summary.successfulScrapes || 0} extracted successfully`}
          isLoading={isLoading}
        />

        <KPICard
          title="#1 Winner Niche"
          value={topCategory ? topCategory.name : "Beauty & Care"}
          icon={Flame}
          colorTheme="amber"
          badge={{
            text: `${topCategory?.count || 0} products`,
            variant: "amber",
          }}
          subtext={
            topCategory
              ? `Avg Price: ${topCategory.avgPrice} TND • ${topCategory.offerRate}% offers`
              : "Analyzing category density..."
          }
          isLoading={isLoading}
        />

        <KPICard
          title="Offer & Bundle Rate"
          value={`${
            summary.totalProducts > 0
              ? Math.round((Number(summary.withOffersCount || 0) / Number(summary.totalProducts)) * 100)
              : 0
          }%`}
          icon={Tag}
          colorTheme="emerald"
          badge={{
            text: `${summary.withOffersCount || 0} offers`,
            variant: "emerald",
          }}
          subtext={`${summary.hasFreeDelivery || 0} items offer free delivery`}
          isLoading={isLoading}
        />

        <KPICard
          title="Catalog Health"
          value={`${dataQuality.classifiedRate ?? 100}%`}
          icon={ShieldCheck}
          colorTheme="cyan"
          badge={{
            text: `${dataQuality.priceParsedRate ?? 100}% priced`,
            variant: "cyan",
          }}
          subtext={`${dataQuality.classifiedCount || 0} categorized niches`}
          isLoading={isLoading}
        />
      </div>

      {/* 2. Winner Niches Matrix & Sub-Category Drilldown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Share & Opportunity Matrix (2 cols) */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Winner Niches & Profitability Matrix
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Ranked by product density & market share
            </span>
          </div>

          <div className="space-y-3.5">
            {categories.map((cat, idx) => {
              const isSelected = selectedCategory === cat.name;
              const colorClasses = [
                "bg-indigo-500",
                "bg-purple-500",
                "bg-pink-500",
                "bg-emerald-500",
                "bg-amber-500",
                "bg-cyan-500",
                "bg-teal-500",
                "bg-slate-500",
              ];
              const color = colorClasses[idx % colorClasses.length];

              return (
                <div
                  key={cat.name}
                  onClick={() => setSelectedCategory(isSelected ? "all" : cat.name)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? "border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-sm"
                      : "border-slate-200/70 dark:border-slate-800/70 bg-white/40 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  }`}
                >
                  <ProgressBarRow
                    label={cat.name}
                    count={cat.count}
                    total={summary.totalProducts || 1}
                    colorClass={color}
                    subtext={`${cat.storesCount || 1} competitor stores`}
                    valueLabel={
                      <span className="font-mono">
                        {cat.avgPrice > 0 ? `${cat.avgPrice} TND avg` : "—"}
                      </span>
                    }
                  />

                  {/* Niche Micro Badges */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/40 text-[10px] text-slate-500 flex-wrap">
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                      Range: {cat.minPrice || 0} – {cat.maxPrice || 0} TND
                    </span>
                    <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                      {cat.offerRate}% bundle/discount rate
                    </span>
                    <span className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold">
                      Opp. Score: {cat.opportunityScore || 1.0}
                    </span>
                    {cat.platforms?.shopify > 0 && (
                      <span className="text-slate-400 hidden sm:inline">
                        • {cat.platforms.shopify} Shopify
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sub-Category Leaderboard (1 col) */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Top Sub-Niches
              </h3>
            </div>
            {selectedCategory !== "all" && (
              <button
                onClick={() => setSelectedCategory("all")}
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
            {filteredSubCategories.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No sub-categories recorded for this selection.
              </div>
            ) : (
              filteredSubCategories.map((sub, idx) => (
                <div
                  key={`${sub.category}-${sub.name}`}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {sub.name}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{sub.category}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-extrabold text-slate-900 dark:text-slate-100 block">
                      {sub.count} items
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                      {sub.avgPrice > 0 ? `${sub.avgPrice} TND` : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3. Pricing Architecture & Tech Stack Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Price Tier Distribution */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Price Sweet-Spot Distribution
              </h3>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
              COD Market Pricing
            </span>
          </div>

          <div className="space-y-3">
            {priceTiers.map((tier) => {
              const isSweetSpot = tier.tierKey === "tier_30_60" || tier.tierKey === "tier_60_100";
              const color =
                tier.tierKey === "tier_under_30"
                  ? "bg-cyan-500"
                  : tier.tierKey === "tier_30_60"
                  ? "bg-emerald-500"
                  : tier.tierKey === "tier_60_100"
                  ? "bg-indigo-500"
                  : tier.tierKey === "tier_100_200"
                  ? "bg-amber-500"
                  : "bg-rose-500";

              return (
                <div
                  key={tier.tierKey}
                  className={`p-2.5 rounded-xl border ${
                    isSweetSpot
                      ? "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/20"
                      : "border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30"
                  }`}
                >
                  <ProgressBarRow
                    label={tier.tier}
                    count={tier.count}
                    total={summary.totalProducts || 1}
                    colorClass={color}
                    valueLabel={
                      <span className="font-mono text-xs">
                        {tier.avgPrice > 0 ? `${tier.avgPrice} TND avg` : `${tier.count} items`}
                      </span>
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* E-Commerce Platform & Tech Stack */}
        <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-purple-500" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Store Platforms & Conversion Tech
              </h3>
            </div>
            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded-full">
              Tech Footprint
            </span>
          </div>

          <div className="space-y-3">
            {platforms.map((p) => {
              const color =
                p.name === "Shopify"
                  ? "bg-emerald-500"
                  : p.name === "YouCan"
                  ? "bg-indigo-500"
                  : p.name === "WooCommerce"
                  ? "bg-purple-500"
                  : "bg-slate-400";

              return (
                <div key={p.name} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30">
                  <ProgressBarRow
                    label={p.name}
                    count={p.count}
                    total={summary.totalProducts || 1}
                    colorClass={color}
                  />
                </div>
              );
            })}
          </div>

          {/* Funnel Signals strip */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
            <div className="p-2 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-800/50">
              <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block">
                Meta Pixel Active
              </span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                {summary.hasMetaPixel || 0} stores
              </span>
            </div>
            <div className="p-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
                WhatsApp Checkout
              </span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                {summary.hasWhatsApp || 0} stores
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Cross-Store Saturation (Clone Alert) */}
      {crossStoreClones.length > 0 && (
        <div className="glass-card rounded-2xl p-5 border border-amber-500/30 bg-amber-500/5 shadow-sm space-y-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Cross-Store Saturation (Multi-Store Clones)
            </h3>
            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
              {crossStoreClones.length} multi-store trends
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Identical or near-identical products actively marketed across multiple independent competitor domains:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {crossStoreClones.map((clone, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-amber-500/20 shadow-xs flex items-center space-x-3"
              >
                {clone.sampleImage && (
                  <img
                    src={clone.sampleImage}
                    alt={clone.title}
                    className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {clone.title}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                    <span>Sold by {clone.storeCount} stores</span>
                    {clone.minPrice > 0 && <span>• {clone.minPrice} - {clone.maxPrice} TND</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Top Winner Products Leaderboard */}
      <div className="glass-card rounded-2xl p-5 border border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/40 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center space-x-2">
            <Flame className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Top Winner Products Leaderboard
            </h3>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold px-2 py-0.5 rounded-full">
              {filteredTopProducts.length} ranked
            </span>
          </div>

          {/* Search filter within top products */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search winning product or store..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          {filteredTopProducts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No top winner products match the current filters.
            </div>
          ) : (
            filteredTopProducts.map((p, idx) => (
              <LeaderboardRow
                key={p.id}
                rank={idx + 1}
                imageUrl={p.mainImageUrl}
                title={p.title || "Product"}
                subtitle={`${p.brandName || p.domain || "Store"} • ${p.storePlatform || "Web"}`}
                tag={p.category || "General"}
                badge={{
                  text: `Score: ${p.winnerScore || 0}/100`,
                  variant: (p.winnerScore || 0) >= 80 ? "emerald" : "amber",
                }}
                metrics={[
                  {
                    label: "Active Ads",
                    value: `${p.linkedAdsCount || 0} ads`,
                    highlight: true,
                  },
                  {
                    label: "Price",
                    value: p.currentPrice ? `${p.currentPrice}` : "—",
                  },
                  {
                    label: "Longevity",
                    value: `${p.daysRunning || 1}d`,
                  },
                ]}
                actionUrl={`/spy?search=${encodeURIComponent(p.title || "")}`}
                actionLabel="View in Spy"
                onSelect={() => {
                  setSelectedProduct(p);
                  setIsModalOpen(true);
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Product Details Modal for deep drilldown */}
      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onDelete={async (productId) => {
            await fetch(`/api/products?id=${productId}`, { method: "DELETE" });
            setIsModalOpen(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
