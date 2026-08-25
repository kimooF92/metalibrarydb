"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Star,
  Building2,
  ArrowUp,
  Loader2,
} from "lucide-react";

type SmartPreset = "all" | "most_scaled" | "new_discovered" | "top_lasting" | "with_offers" | "favorites";

export default function ProductsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Smart preset tab & view mode
  const [smartPreset, setSmartPreset] = useState<SmartPreset>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Filters & Pagination
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [brandInput, setBrandInput] = useState("");
  const [debouncedBrand, setDebouncedBrand] = useState("");

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

  // Hybrid auto-scroll tracking
  const [autoLoadCount, setAutoLoadCount] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initialStatsLoadedRef = useRef<boolean>(false);

  const [stats, setStats] = useState({
    totalProducts: 0,
    successfulProducts: 0,
    pendingProducts: 0,
    withOffersCount: 0,
    favoritesCount: 0,
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

  // Debounce search input (350ms) to prevent keystroke request storms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounce brand filter input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBrand(brandInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [brandInput]);

  // Read URL query params on mount (e.g. ?brand=... or ?preset=favorites)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const brandParam = params.get("brand");
      if (brandParam) {
        setBrandInput(brandParam);
        setDebouncedBrand(brandParam);
      }
      const presetParam = params.get("preset");
      if (presetParam === "favorites") {
        setSmartPreset("favorites");
      }
    }
  }, []);

  const fetchProducts = useCallback(
    async (targetPage = 1, append = false, includeStats = false) => {
      // Abort any in-flight requests to eliminate connection-pool pileups
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const currentController = new AbortController();
      abortControllerRef.current = currentController;

      if (append) {
        setIsFetchingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const query = new URLSearchParams({
          page: targetPage.toString(),
          limit: "24",
          sortBy,
          smartPreset,
          _t: Date.now().toString(),
        });

        if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());
        if (debouncedBrand.trim()) query.set("brand", debouncedBrand.trim());
        if (platform !== "all") query.set("platform", platform);
        if (statusFilter !== "all") query.set("status", statusFilter);
        if (includeStats) query.set("includeStats", "true");

        const res = await fetch(`/api/products?${query.toString()}`, {
          signal: currentController.signal,
        });
        if (!res.ok) {
          throw new Error(`Failed to load products (${res.status})`);
        }

        const data = await res.json();
        if (data.success) {
          const newItems: ScrapedProduct[] = data.products || [];
          if (append) {
            setProducts((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const filtered = newItems.filter((p) => !existingIds.has(p.id));
              return [...prev, ...filtered];
            });
          } else {
            setProducts(newItems);
          }
          if (data.pagination) setPagination(data.pagination);
          if (data.stats) setStats(data.stats);
        } else {
          throw new Error(data.error || "Unknown error");
        }
      } catch (err: any) {
        if (err.name === "AbortError" || err.message?.toLowerCase().includes("abort")) {
          return; // Intentional abort, ignore silently
        }
        console.error("[Products Page] Fetch error:", err);
        setError(err.message || "Failed to load products");
        setLoading(false);
        setIsFetchingMore(false);
      } finally {
        if (abortControllerRef.current === currentController) {
          setLoading(false);
          setIsFetchingMore(false);
        }
      }
    },
    [sortBy, smartPreset, debouncedSearch, debouncedBrand, platform, statusFilter]
  );

  // Trigger initial fetch on filter/sort change (only fetch heavy global stats on first mount)
  useEffect(() => {
    setPage(1);
    setAutoLoadCount(0);
    const needStats = !initialStatsLoadedRef.current;
    if (needStats) {
      initialStatsLoadedRef.current = true;
    }
    fetchProducts(1, false, needStats);
  }, [fetchProducts]);

  // Load next page function
  const loadNextPage = useCallback(() => {
    if (loading || isFetchingMore || page >= pagination.totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setAutoLoadCount((prev) => prev + 1);
    fetchProducts(nextPage, true);
  }, [loading, isFetchingMore, page, pagination.totalPages, fetchProducts]);

  // Manual Load More button handler
  const handleManualLoadMore = () => {
    if (loading || isFetchingMore || page >= pagination.totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setAutoLoadCount(0); // Reset the 3-batch pause
    fetchProducts(nextPage, true);
  };

  // Scroll listener on main container for back-to-top button & auto-scroll fallback
  useEffect(() => {
    const mainContainer = document.querySelector("main") || window;

    const handleScroll = () => {
      const scrollPos =
        mainContainer instanceof HTMLElement
          ? mainContainer.scrollTop
          : window.scrollY || document.documentElement.scrollTop;

      setShowBackToTop(scrollPos > 350);

      // Auto-load trigger fallback when near bottom
      if (
        !loading &&
        !isFetchingMore &&
        page < pagination.totalPages &&
        autoLoadCount < 3
      ) {
        const scrollHeight =
          mainContainer instanceof HTMLElement
            ? mainContainer.scrollHeight
            : document.documentElement.scrollHeight;
        const clientHeight =
          mainContainer instanceof HTMLElement
            ? mainContainer.clientHeight
            : window.innerHeight;

        if (scrollPos + clientHeight >= scrollHeight - 350) {
          loadNextPage();
        }
      }
    };

    mainContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => mainContainer.removeEventListener("scroll", handleScroll);
  }, [loading, isFetchingMore, page, pagination.totalPages, autoLoadCount, loadNextPage]);

  // IntersectionObserver for sentinel element
  useEffect(() => {
    if (loading || isFetchingMore || page >= pagination.totalPages || autoLoadCount >= 3) {
      return;
    }

    const mainContainer = document.querySelector("main");

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !loading && !isFetchingMore && page < pagination.totalPages) {
          loadNextPage();
        }
      },
      {
        root: mainContainer || null,
        rootMargin: "300px",
        threshold: 0.1,
      }
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
      observer.disconnect();
    };
  }, [loading, isFetchingMore, page, pagination.totalPages, autoLoadCount, loadNextPage]);

  const scrollToTop = () => {
    const mainContainer = document.querySelector("main");
    if (mainContainer) {
      mainContainer.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleToggleFavorite = async (productId: string, nextFavorite: boolean) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, isFavorite: nextFavorite } : p))
    );
    setStats((prev) => ({
      ...prev,
      favoritesCount: Math.max(0, prev.favoritesCount + (nextFavorite ? 1 : -1)),
    }));

    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, isFavorite: nextFavorite }),
      });

      if (!res.ok) throw new Error("Failed to update favorite status");

      showToast({
        type: "success",
        title: nextFavorite ? "⭐ Added to Favorites" : "Removed from Favorites",
        message: nextFavorite
          ? "Product saved to your starred favorites catalog."
          : "Product removed from favorites.",
      });
    } catch (err: any) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, isFavorite: !nextFavorite } : p))
      );
      showToast({
        type: "error",
        title: "Favorite Error",
        message: err.message || "Could not update favorite status.",
      });
    }
  };

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

  const handleFilterBrand = (brandName: string) => {
    setBrandInput(brandName);
    setDebouncedBrand(brandName);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setBrandInput("");
    setDebouncedBrand("");
    setPlatform("all");
    setStatusFilter("all");
    setSmartPreset("all");
    setSortBy("latest");
    setPage(1);
    setAutoLoadCount(0);
  };

  const progressPercent =
    pagination.total > 0 ? Math.min(100, Math.round((products.length / pagination.total) * 100)) : 0;
  const remainingCount = Math.max(0, pagination.total - products.length);
  const hasMore = page < pagination.totalPages;

  return (
    <div className="space-y-4 pb-12">
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
            Discover winning products, star favorites, track active brand campaigns, and benchmark competitor pricing.
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
            onClick={() => fetchProducts(1, false, true)}
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

        {/* Starred Favorites */}
        <div
          onClick={() => {
            setSmartPreset("favorites");
            setPage(1);
          }}
          className="p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs cursor-pointer hover:border-amber-500/40 transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>⭐ Starred Favorites</span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-500/20" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {stats.favoritesCount}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Saved to product watchlist
          </span>
        </div>

        {/* Fresh Drops (Last 7 Days) */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Fresh Drops (7d)</span>
            <Zap className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.newThisWeekCount}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Newly discovered this week
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
            <Tag className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
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
            setSmartPreset("favorites");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            smartPreset === "favorites"
              ? "bg-amber-500 text-slate-950 font-black shadow-sm shadow-amber-500/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${smartPreset === "favorites" ? "fill-current" : "text-amber-500"}`} />
          <span>⭐ Starred Favorites ({stats.favoritesCount})</span>
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
              ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
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
              ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Tag className="w-3.5 h-3.5 text-blue-400" />
          <span>🏷️ With Offers ({stats.withOffersCount})</span>
        </button>
      </div>

      {/* Brand Active Filter Banner (if brand filter is applied) */}
      {(brandInput || debouncedBrand) && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse shrink-0" />
            <span className="text-slate-700 dark:text-slate-200 truncate">
              Showing products advertised by brand: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{brandInput || debouncedBrand}</strong>
            </span>
          </div>
          <button
            onClick={() => {
              setBrandInput("");
              setDebouncedBrand("");
              setPage(1);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 text-[11px] cursor-pointer shrink-0 transition-colors"
          >
            <X className="w-3 h-3" /> Clear Brand Filter
          </button>
        </div>
      )}

      {/* 3. Toolbar Controls (Search, Brand Filter, Platform, Status, Sort, View Switcher) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-xs">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Search product title, brand, URL, offer..."
            className="w-full bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-lg pl-9 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setDebouncedSearch("");
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
          {/* Brand Filter Input */}
          <div className="relative">
            <Building2 className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
            <input
              type="text"
              value={brandInput}
              onChange={(e) => {
                setBrandInput(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by brand..."
              className="w-36 bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 pl-8 pr-6 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none"
            />
            {brandInput && (
              <button
                type="button"
                onClick={() => {
                  setBrandInput("");
                  setDebouncedBrand("");
                  setPage(1);
                }}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

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
          {(searchInput !== "" || brandInput !== "" || platform !== "all" || statusFilter !== "all" || smartPreset !== "all" || sortBy !== "latest") && (
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
            onClick={() => fetchProducts(1, false)}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/80 p-8 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            {smartPreset === "favorites" ? (
              <Star className="w-8 h-8 text-amber-500" />
            ) : (
              <ShoppingBag className="w-8 h-8" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {smartPreset === "favorites"
                ? "No Starred Favorite Products Yet"
                : "No Matching Products Found"}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mt-1">
              {smartPreset === "favorites"
                ? "Click the star (⭐) button on any product card to add it to your starred favorites watchlist."
                : searchInput || brandInput || platform !== "all" || smartPreset !== "all"
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
                  onToggleFavorite={handleToggleFavorite}
                  onViewDetails={handleViewDetails}
                  onViewCreatives={handleViewCreatives}
                  onFilterBrand={handleFilterBrand}
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
                  onToggleFavorite={handleToggleFavorite}
                  onViewDetails={handleViewDetails}
                  onViewCreatives={handleViewCreatives}
                  onFilterBrand={handleFilterBrand}
                />
              ))}
            </div>
          )}

          {/* Sentinel element for infinite scroll auto-trigger */}
          <div ref={sentinelRef} className="h-6 w-full" />

          {/* Skeletons while fetching more items */}
          {isFetchingMore && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pt-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={`skeleton-${i}`}
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
          )}

          {/* Bottom Discovery Bar with Visual Progress & Hybrid Load More */}
          <div className="flex flex-col items-center justify-center pt-8 pb-8 space-y-3">
            {/* Visual Progress Counter */}
            <div className="w-full max-w-xs flex flex-col items-center space-y-1.5">
              <div className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>
                  Showing <strong className="text-slate-900 dark:text-white font-bold">{products.length}</strong> of{" "}
                  <strong className="text-slate-900 dark:text-white font-bold">{pagination.total}</strong> products
                </span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{progressPercent}%</span>
              </div>
              {/* Progress Track */}
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Hybrid "Load More" Action Button if paused or if user prefers clicking */}
            {hasMore ? (
              <button
                onClick={handleManualLoadMore}
                disabled={isFetchingMore}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 font-bold text-xs shadow-sm hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isFetchingMore ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>Loading next products...</span>
                  </>
                ) : (
                  <>
                    <span>Load More Products ({Math.min(24, remainingCount)} more)</span>
                    <span className="text-[10px] text-slate-400 font-normal">({remainingCount} remaining)</span>
                  </>
                )}
              </button>
            ) : products.length > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>You&apos;ve viewed all {pagination.total} products</span>
              </div>
            ) : null}
          </div>
        </>
      )}

      {/* Floating Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-40 p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/30 transition-all duration-200 animate-in fade-in zoom-in cursor-pointer"
          title="Scroll Back to Top"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
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
