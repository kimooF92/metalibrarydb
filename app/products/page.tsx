"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ScrapedProduct } from "@/types";
import { ProductCard } from "@/components/products/product-card";
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
} from "lucide-react";

export default function ProductsPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [hasOfferOnly, setHasOfferOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"latest" | "ads" | "title">("latest");
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
    withOffersCount: 0,
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
      });

      if (search.trim()) query.set("search", search.trim());
      if (domain.trim()) query.set("domain", domain.trim());
      if (hasOfferOnly) query.set("hasOffer", "true");

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
  }, [page, sortBy, search, domain, hasOfferOnly]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleRefresh = async (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

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

  const handleResetFilters = () => {
    setSearch("");
    setDomain("");
    setHasOfferOnly(false);
    setSortBy("latest");
    setPage(1);
  };

  return (
    <div className="h-full flex flex-col space-y-4 overflow-y-auto p-4 sm:p-6">
      {/* Top Header (Line 2) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800/40">
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
              Product Intelligence
            </h1>
          </div>

          <div className="flex items-center gap-1.5 ml-1">
            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-semibold">
              <span className="text-slate-400 font-normal">Products:</span>
              <span>{stats.totalProducts}</span>
            </span>

            {stats.withOffersCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md font-semibold">
                <span className="text-emerald-600/70 dark:text-emerald-400/70 font-normal">With Offers:</span>
                <span>{stats.withOffersCount}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/spy"
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Scan from Ad Feed</span>
          </Link>

          <button
            onClick={() => fetchProducts()}
            disabled={loading}
            title="Refresh product feed"
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Toolbar: Search on Left, 1-Click Filters on Right (Line 3) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/40">
        {/* Left: Global Search */}
        <div className="relative w-full sm:w-64 md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500 dark:text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search title, brand, or URL..."
            className="w-full bg-white dark:bg-slate-950/80 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg pl-8 pr-3 py-2 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Right: 1-Click Filters & Sort */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Has Offer 1-Click Filter */}
          <button
            onClick={() => {
              setHasOfferOnly(!hasOfferOnly);
              setPage(1);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
              hasOfferOnly
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30 shadow-sm"
                : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Tag className="w-3 h-3 text-emerald-500" />
            <span>Discount Offers</span>
          </button>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5">
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="latest">Sort: Most Recent</option>
              <option value="ads">Sort: Most Active Ads</option>
              <option value="title">Sort: Title (A-Z)</option>
            </select>
          </div>

          {/* Reset button */}
          {(search !== "" || hasOfferOnly || sortBy !== "latest") && (
            <button
              onClick={handleResetFilters}
              className="flex items-center space-x-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
              title="Reset search and filters"
            >
              <X className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Product Grid / State */}
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
              No Tracked Products Yet
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mt-1">
              Go to the Ad Spy Feed and click the <strong className="text-indigo-600 dark:text-indigo-400">"Fetch Product"</strong> button on any ad to scan and extract its landing page product details!
            </p>
          </div>
          <Link
            href="/spy"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            <span>Open Ad Spy Feed</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onRefresh={handleRefresh}
                onDelete={handleDelete}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>

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

      {/* Details & Linked Ads Modal */}
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
