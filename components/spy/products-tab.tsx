"use client";

import React, { memo, useState, useRef, useEffect } from "react";
import { ProductCard } from "@/components/products/product-card";
import { ScrapedProduct } from "@/types";
import {
  ShoppingBag,
  Zap,
  RefreshCw,
  ChevronDown,
  RotateCw,
  Laptop,
  Search,
  X,
  Tag,
} from "lucide-react";

export interface ProductsTabProps {
  products: ScrapedProduct[];
  totalProductsCount?: number;
  pendingProductsCount?: number;
  storePlatforms: string[];
  storeWhatsAppNumbers: string[];
  isLoadingProductsTab: boolean;
  productsTabError: string | null;
  isSyncingProducts: boolean;
  isQueueingLocalRescan: boolean;
  onLoadProducts: (force?: boolean) => void;
  onSyncBrandProducts: (forceRefresh: boolean) => void;
  onQueueBrandProductsForLocalRescan: () => void;
  onRefreshProduct: (productId: string, productOverride?: any) => Promise<void>;
  onViewProductDetails: (product: ScrapedProduct) => void;
  onViewCreativesForProduct: (product: ScrapedProduct) => void;
}

export const ProductsTab = memo(function ProductsTab({
  products,
  totalProductsCount,
  pendingProductsCount,
  storePlatforms,
  storeWhatsAppNumbers,
  isLoadingProductsTab,
  productsTabError,
  isSyncingProducts,
  isQueueingLocalRescan,
  onLoadProducts,
  onSyncBrandProducts,
  onQueueBrandProductsForLocalRescan,
  onRefreshProduct,
  onViewProductDetails,
  onViewCreativesForProduct,
  initialActiveOnly,
}: ProductsTabProps & { initialActiveOnly?: boolean }) {
  // Localized filter and menu state
  const [productSearch, setProductSearch] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState<"all" | "scraped" | "pending">("all");
  const [productOfferOnly, setProductOfferOnly] = useState(false);
  const [productActiveOnly, setProductActiveOnly] = useState<boolean>(() => {
    if (typeof initialActiveOnly === "boolean") return initialActiveOnly;
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      return p.get("active") === "true" || p.get("activeOnly") === "true";
    }
    return false;
  });
  const [isScrapeMenuOpen, setIsScrapeMenuOpen] = useState(false);
  const scrapeMenuRef = useRef<HTMLDivElement | null>(null);

  // Sync productActiveOnly with browser history popstate
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== "undefined") {
        const p = new URLSearchParams(window.location.search);
        const isActiveOnly = p.get("active") === "true" || p.get("activeOnly") === "true";
        setProductActiveOnly(isActiveOnly);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Close scrape menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (scrapeMenuRef.current && !scrapeMenuRef.current.contains(e.target as Node)) {
        setIsScrapeMenuOpen(false);
      }
    };
    if (isScrapeMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isScrapeMenuOpen]);

  const allProds = products || [];
  const displayTotal = totalProductsCount ?? allProds.length;
  const currentPendingCount = pendingProductsCount ?? allProds.filter((p) => p.scrapeStatus === "pending").length;
  const scrapedCount =
    totalProductsCount !== undefined && pendingProductsCount !== undefined
      ? Math.max(0, totalProductsCount - pendingProductsCount)
      : allProds.filter((p) => p.scrapeStatus === "success").length;
  const activeProdsCount = allProds.filter((p) => p.brandHoldStatus !== "inactive" && (p.activeAdsCount || 0) > 0).length;
  const heroProd = allProds[0];

  const filtered = allProds.filter((p) => {
    if (productActiveOnly) {
      const isInactive =
        p.brandHoldStatus === "inactive" ||
        (typeof p.activeAdsCount === "number" && p.activeAdsCount === 0);
      if (isInactive || (p.activeAdsCount || 0) <= 0) return false;
    }
    if (productStatusFilter === "scraped" && p.scrapeStatus !== "success") return false;
    if (productStatusFilter === "pending" && p.scrapeStatus === "success") return false;
    if (productOfferOnly && (!p.discountOrOffer || p.discountOrOffer.trim() === "")) return false;
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      const matchTitle = p.title?.toLowerCase().includes(q);
      const matchDomain = p.domain?.toLowerCase().includes(q);
      const matchUrl = p.url?.toLowerCase().includes(q);
      const matchOffer = p.discountOrOffer?.toLowerCase().includes(q);
      if (!matchTitle && !matchDomain && !matchUrl && !matchOffer) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header & Batch Scrape Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-950/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Brand Product Catalog &amp; Landing Pages
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Extract all destination URLs from scanned ads, remove duplicates, and scrape full product details with pricing and offers.
          </p>
        </div>

        {/* Split-Button with Unified Scraping & Rescan Dropdown */}
        <div className="relative inline-flex items-stretch shrink-0 rounded-lg shadow-sm" ref={scrapeMenuRef}>
          <button
            type="button"
            onClick={() => onSyncBrandProducts(false)}
            disabled={isSyncingProducts || isQueueingLocalRescan}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-l-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
            title="Extract all destination URLs from ads and scrape new product details"
          >
            {isSyncingProducts ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            <span>
              {isSyncingProducts
                ? "Scanning & Extracting..."
                : isQueueingLocalRescan
                ? "Queueing..."
                : "Sync & Scrape Products"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsScrapeMenuOpen((prev) => !prev)}
            disabled={isSyncingProducts || isQueueingLocalRescan}
            className="px-2.5 py-2 rounded-r-lg bg-indigo-700 hover:bg-indigo-600 text-white border-l border-indigo-500/40 text-xs transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center"
            title="More extraction & scraping options"
            aria-expanded={isScrapeMenuOpen}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isScrapeMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Unified Dropdown Menu */}
          {isScrapeMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-76 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Scraping &amp; Rescan Options
                </span>
              </div>

              {/* Option 1: Force Full Re-scrape */}
              <button
                type="button"
                onClick={() => {
                  setIsScrapeMenuOpen(false);
                  onSyncBrandProducts(true);
                }}
                disabled={isSyncingProducts || isQueueingLocalRescan}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2.5 transition-colors cursor-pointer text-slate-700 dark:text-slate-200 disabled:opacity-50"
              >
                <RotateCw className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Force Re-scrape All URLs
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Bypass cache to re-extract live pricing &amp; content from all landing pages.
                  </p>
                </div>
              </button>

              {/* Option 2: Queue for Local Rescan */}
              <button
                type="button"
                onClick={() => {
                  setIsScrapeMenuOpen(false);
                  onQueueBrandProductsForLocalRescan();
                }}
                disabled={isSyncingProducts || isQueueingLocalRescan}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2.5 transition-colors cursor-pointer text-slate-700 dark:text-slate-200 disabled:opacity-50 border-t border-slate-100 dark:border-slate-800/60"
              >
                <Laptop className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Queue for Local Residential Rescan
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Mark all products as pending for your local residential worker (fixes USD prices &amp; bypasses Cloudflare).
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Unique Products</span>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{displayTotal}</p>
          <span className="text-[10px] text-slate-500 font-medium">
            {activeProdsCount > 0 ? `${activeProdsCount} active on air • ` : ""}{Math.max(0, displayTotal - activeProdsCount)} off-air
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Scraped with Details</span>
          <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{scrapedCount}</p>
          <span className="text-[10px] text-slate-500 font-medium">{currentPendingCount} URLs pending scrape</span>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Hero Flagship Item</span>
          <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-1">
            {heroProd?.title || "None detected yet"}
          </p>
          <span className="text-[10px] text-indigo-500 font-semibold">
            {heroProd?.linkedAdsCount ? `${heroProd.linkedAdsCount} active creatives` : "Sync to calculate"}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Detected Platform</span>
          <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-1 uppercase">
            {storePlatforms.length > 0 ? storePlatforms.join(", ") : "Meta Ads"}
          </p>
          <span className="text-[10px] text-slate-500 font-medium">
            {storeWhatsAppNumbers.length > 0 ? `${storeWhatsAppNumbers.length} WhatsApp numbers` : "No WhatsApp links"}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 justify-between bg-white dark:bg-slate-950/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search products by title, domain, offer..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 text-xs rounded-lg pl-9 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500"
          />
          {productSearch && (
            <button
              type="button"
              onClick={() => setProductSearch("")}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Active Only Filter Toggle */}
          <button
            type="button"
            onClick={() => setProductActiveOnly(!productActiveOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer select-none ${
              productActiveOnly
                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-bold shadow-2xs"
                : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title={productActiveOnly ? "Currently showing active products only. Click to show all." : "Filter products that currently have active running ads"}
          >
            <span className={`w-2 h-2 rounded-full ${productActiveOnly ? "bg-emerald-500 animate-pulse" : "bg-emerald-500/60"}`} />
            <span>Active Only</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                productActiveOnly
                  ? "bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {activeProdsCount}
            </span>
          </button>

          <select
            value={productStatusFilter}
            onChange={(e) => setProductStatusFilter(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
          >
            <option value="all">All Products</option>
            <option value="scraped">Scraped Only</option>
            <option value="pending">Pending Scrape Only</option>
          </select>

          <button
            type="button"
            onClick={() => setProductOfferOnly(!productOfferOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              productOfferOnly
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold"
                : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100"
            }`}
          >
            <Tag className="w-3 h-3" />
            <span>With Offers Only</span>
          </button>
        </div>
      </div>

      {/* Product Grid / State Views */}
      {(() => {
        if (allProds.length === 0) {
          if (isLoadingProductsTab) {
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
                  >
                    <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                  </div>
                ))}
              </div>
            );
          }

          if (productsTabError) {
            return (
              <div className="flex flex-col items-center justify-center p-10 border border-red-200 dark:border-red-900/50 rounded-2xl bg-red-50/50 dark:bg-red-950/20 text-center space-y-3">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {productsTabError}
                </p>
                <button
                  type="button"
                  onClick={() => onLoadProducts(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Retry Loading Catalog</span>
                </button>
              </div>
            );
          }

          return (
            <div className="flex flex-col items-center justify-center p-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-500">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  No Scraped Products in Brand Catalog Yet
                </h3>
                <p className="text-xs text-slate-500 max-w-md mt-1">
                  Click the button below to extract all unique destination URLs from this brand's scanned ads and scrape product prices, offers, and photos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSyncBrandProducts(false)}
                disabled={isSyncingProducts}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>Extract &amp; Scrape Brand Products</span>
              </button>
            </div>
          );
        }

        if (filtered.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
              <Search className="w-8 h-8 text-slate-400 mb-2" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                No products match your filter criteria
              </h4>
              <button
                type="button"
                onClick={() => {
                  setProductSearch("");
                  setProductStatusFilter("all");
                  setProductOfferOnly(false);
                  setProductActiveOnly(false);
                }}
                className="text-xs text-indigo-600 font-semibold mt-2 hover:underline cursor-pointer"
              >
                Reset Product Filters
              </button>
            </div>
          );
        }

        return (
          <div className="products-cards-grid">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onRefresh={onRefreshProduct}
                onViewDetails={onViewProductDetails}
                onViewCreatives={onViewCreativesForProduct}
              />
            ))}
          </div>
        );
      })()}
    </div>
  );
});
