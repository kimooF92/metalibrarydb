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
  Filter,
  Tag,
  RotateCw,
  Layers,
  ArrowUpDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Eye,
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

  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Product Intelligence</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Scanned landing pages, pricing tiers, discount offers, and winning creatives.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchProducts()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-sm transition-all"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
            <span>Refresh Feed</span>
          </button>

          <Link
            href="/spy"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-600/20 transition-all"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Scan from Ad Feed</span>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
              Tracked Products
            </span>
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {stats.totalProducts}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
              With Active Offers
            </span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {stats.withOffersCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Tag className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
              Success Rate
            </span>
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {stats.totalProducts > 0
                ? `${Math.round((stats.successfulProducts / stats.totalProducts) * 100)}%`
                : "100%"}
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by product title, brand, or URL..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Has Offer Toggle */}
          <button
            onClick={() => {
              setHasOfferOnly(!hasOfferOnly);
              setPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
              hasOfferOnly
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                : "bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Discount Offers Only</span>
          </button>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer py-1"
            >
              <option value="latest">Sort: Most Recent</option>
              <option value="ads">Sort: Most Linked Ads</option>
              <option value="title">Sort: Product Name</option>
            </select>
          </div>
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
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg"
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
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md transition-all"
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
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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
