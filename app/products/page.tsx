"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScrapedProduct } from "@/types";
import { ProductCard } from "@/components/products/product-card";
import { ProductRow } from "@/components/products/product-row";
import { ProductDetailsModal } from "@/components/products/product-details-modal";
import { useToast } from "@/components/toast-context";
import {
  ShoppingBag,
  Sparkles,
  Search,
  Tag,
  RotateCw,
  Layers,
  ArrowUpDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Eye,
  X,
  Flame,
  Clock,
  Zap,
  LayoutGrid,
  LayoutList,
  CheckCircle2,
  Globe,
  SlidersHorizontal,
} from "lucide-react";

type SmartPreset = "all" | "most_scaled" | "new_discovered" | "top_lasting" | "with_offers";

export default function ProductsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Smart preset tab & view mode
  const [smartPreset, setSmartPreset] = useState<SmartPreset>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<string>("latest");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 24,
    total: 0,
    totalPages: 1,
  });

  const [stats, setStats] = useState({
    totalProducts: 0,
    successfulProducts: 0,
    pendingProducts: 0,
    withOffersCount: 0,
    newThisWeekCount: 0,
    platforms: {
      shopify: 0,
      youcan: 0,
      woocommerce: 0,
    },
  });

  // Modal state
  const [selectedProduct, setSelectedProduct] = useState<ScrapedProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: "24",
        sortBy,
        smartPreset,
      });

      if (search.trim()) query.set("search", search.trim());
      if (platform !== "all") query.set("platform", platform);
      if (statusFilter !== "all") query.set("status", statusFilter);

      const res = await fetch(`/api/products?${query.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load products (${res.status})`);
      }

      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
        if (data.pagination) setPagination(data.pagination);
        if (data.stats) setStats(data.stats);
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, smartPreset, search, platform, statusFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleRefresh = async (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod || !prod.url) return;

    try {
      const res = await fetch("/api/products/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: prod.url, forceRefresh: true }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.product) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, ...data.product } : p))
        );
        if (selectedProduct?.id === productId) {
          setSelectedProduct((prev) => (prev ? { ...prev, ...data.product } : null));
        }
        showToast({
          type: "success",
          title: "Product Re-extracted",
          message: `Updated pricing and details for "${data.product.title || "product"}".`,
        });
      } else {
        showToast({
          type: "error",
          title: "Refresh Failed",
          message: data.error || "Could not re-extract landing page.",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Failed to refresh product.",
      });
    }
  };

  const handleDelete = async (productId: string) => {
    try {
      const res = await fetch(`/api/products?id=${productId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== productId));
        if (selectedProduct?.id === productId) {
          setIsModalOpen(false);
          setSelectedProduct(null);
        }
        showToast({
          type: "info",
          title: "Product Removed",
          message: "Product removed from intelligence hub.",
        });
      } else {
        showToast({
          type: "error",
          title: "Delete Failed",
          message: "Failed to delete product.",
        });
      }
    } catch (err: any) {
      showToast({
        type: "error",
        title: "Network Error",
        message: err.message || "Failed to delete product.",
      });
    }
  };

  const handleViewDetails = (product: ScrapedProduct) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleViewCreatives = (product: ScrapedProduct) => {
    if (product.brandPageId) {
      router.push(`/spy/brand/${encodeURIComponent(product.brandPageId)}?tab=creatives`);
    } else {
      router.push(`/spy?productId=${encodeURIComponent(product.id)}`);
    }
  };

  const handleResetFilters = () => {
    setSearch("");
    setPlatform("all");
    setStatusFilter("all");
    setSmartPreset("all");
    setSortBy("latest");
    setPage(1);
  };

  return (
    <div className="h-full flex flex-col space-y-4 overflow-y-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/60">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              Product Intelligence & Catalog Hub
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time discovered e-commerce products, scaling hero items, and competitor price intelligence across all tracked ad campaigns.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/spy"
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Ad Spy Feed</span>
          </Link>

          <button
            onClick={() => fetchProducts()}
            disabled={loading}
            title="Refresh product intelligence catalog"
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer shadow-xs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 1. Executive Analytics KPI Cards (5 Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total Products */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Total Products</span>
            <ShoppingBag className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {stats.totalProducts}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            {stats.successfulProducts} fully scraped • {stats.pendingProducts} pending
          </span>
        </div>

        {/* Fresh Drops (Last 7 Days) */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Fresh Drops (7d)</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {stats.newThisWeekCount}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Newly discovered this week
          </span>
        </div>

        {/* Most Scaled */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>High Scale (3+ Ads)</span>
            <Flame className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
            {products.filter((p) => (p.activeAdsCount || 0) >= 3 || (p.linkedAdsCount || 0) >= 3).length}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Aggressively scaled products
          </span>
        </div>

        {/* Top Lasting (Evergreen 30d+) */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Evergreen (30d+)</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
            {products.filter((p) => (p.daysRunning || 0) >= 30).length}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Longest running proven winners
          </span>
        </div>

        {/* With Discounts / Bundle Offers */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Offers & Bundles</span>
            <Tag className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.withOffersCount}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            {stats.totalProducts > 0 ? Math.round((stats.withOffersCount / stats.totalProducts) * 100) : 0}% promotional rate
          </span>
        </div>
      </div>

      {/* 2. Smart Preset Filter Tabs */}
      <div className="flex items-center gap-2 pt-1 pb-1 flex-wrap">
        <button
          onClick={() => {
            setSmartPreset("all");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            smartPreset === "all"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>All Products ({stats.totalProducts})</span>
        </button>

        <button
          onClick={() => {
            setSmartPreset("most_scaled");
            setSortBy("most_scaled");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            smartPreset === "most_scaled"
              ? "bg-rose-600 text-white shadow-sm shadow-rose-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-rose-400" />
          <span>🔥 Most Scaled</span>
        </button>

        <button
          onClick={() => {
            setSmartPreset("new_discovered");
            setSortBy("latest");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            smartPreset === "new_discovered"
              ? "bg-amber-600 text-white shadow-sm shadow-amber-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>⚡ Newly Discovered ({stats.newThisWeekCount})</span>
        </button>

        <button
          onClick={() => {
            setSmartPreset("top_lasting");
            setSortBy("top_lasting");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            smartPreset === "top_lasting"
              ? "bg-purple-600 text-white shadow-sm shadow-purple-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-purple-400" />
          <span>⏳ Top Lasting (Evergreen 30d+)</span>
        </button>

        <button
          onClick={() => {
            setSmartPreset("with_offers");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            smartPreset === "with_offers"
              ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Tag className="w-3.5 h-3.5 text-emerald-400" />
          <span>🏷️ With Bundle Offers ({stats.withOffersCount})</span>
        </button>
      </div>

      {/* 3. Toolbar Controls (Search, Platform, Status, Sort, View Switcher) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-xs">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search product title, brand, URL, offer..."
            className="w-full bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-lg pl-9 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {/* E-Commerce Platform Filter */}
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Platforms</option>
            <option value="shopify">Shopify ({stats.platforms.shopify})</option>
            <option value="youcan">YouCan ({stats.platforms.youcan})</option>
            <option value="woocommerce">WooCommerce ({stats.platforms.woocommerce})</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="all">All Scrape Status</option>
            <option value="success">Scraped Only</option>
            <option value="pending">Pending Scrape</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="latest">⚡ Newest Discovered</option>
            <option value="most_scaled">🔥 Most Scaled (Active Ads)</option>
            <option value="top_lasting">⏳ Longest Lasting (Evergreen)</option>
            <option value="price_desc">💰 Price (High to Low)</option>
            <option value="price_asc">🏷️ Price (Low to High)</option>
            <option value="title">🔤 Title (A-Z)</option>
          </select>

          {/* Grid / List View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "grid" ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-xs" : "text-slate-500"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "list" ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-xs" : "text-slate-500"
              }`}
              title="Dense List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset Filters */}
          {(search !== "" || platform !== "all" || statusFilter !== "all" || smartPreset !== "all" || sortBy !== "latest") && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Products Display Area */}
      {loading && products.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse p-4 flex flex-col justify-between"
            >
              <div className="aspect-square bg-slate-200 dark:bg-slate-800 rounded-lg" />
              <div className="space-y-2 mt-4">
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="py-16 text-center bg-white dark:bg-slate-900/40 rounded-xl border border-red-500/20 p-6">
          <p className="text-sm font-semibold text-red-500 mb-3">{error}</p>
          <button
            onClick={() => fetchProducts()}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/80 p-8 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              No Matching Products Found
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mt-1">
              {search || platform !== "all" || smartPreset !== "all"
                ? "Try resetting your active filters or smart preset to view more products."
                : "Run ad spy scans to automatically extract, deduplicate, and scrape product landing pages."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              Reset Filters
            </button>
            <Link
              href="/spy"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Explore Ad Spy Feed</span>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onRefresh={handleRefresh}
                  onDelete={handleDelete}
                  onViewDetails={handleViewDetails}
                  onViewCreatives={handleViewCreatives}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  onRefresh={handleRefresh}
                  onDelete={handleDelete}
                  onViewDetails={handleViewDetails}
                  onViewCreatives={handleViewCreatives}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Showing page <span className="font-bold text-slate-900 dark:text-slate-100">{pagination.page}</span> of{" "}
                <span className="font-bold text-slate-900 dark:text-slate-100">{pagination.totalPages}</span> ({pagination.total} products)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Details & Competitor Benchmark Modal */}
      <ProductDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={selectedProduct}
        onRefresh={handleRefresh}
        onDelete={handleDelete}
      />
    </div>
  );
}
