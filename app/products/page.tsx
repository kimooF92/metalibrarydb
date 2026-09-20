"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScrapedProduct } from "@/types";
import { ProductCard } from "@/components/products/product-card";
import { ProductRow } from "@/components/products/product-row";
import { ProductDetailsModal } from "@/components/products/product-details-modal";
import { resolveProductForRefresh } from "@/lib/product-extraction";
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
  EyeOff,
  X,
  Flame,
  Clock,
  Zap,
  LayoutGrid,
  LayoutList,
  CheckCircle2,
  Globe,
  SlidersHorizontal,
  ChevronDown,
  Star,
  Building2,
  ArrowUp,
  Loader2,
  Rocket,
  Calendar,
} from "lucide-react";

type SmartPreset = "all" | "breakout" | "most_scaled" | "new_discovered" | "top_lasting" | "with_offers" | "favorites";

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
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Filters & Pagination
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [brandInput, setBrandInput] = useState("");
  const [debouncedBrand, setDebouncedBrand] = useState("");

  const [platform, setPlatform] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hideInactive, setHideInactive] = useState(false);
  const [discoveryFilter, setDiscoveryFilter] = useState("all");
  const [discoveryFrom, setDiscoveryFrom] = useState("");
  const [discoveryTo, setDiscoveryTo] = useState("");
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

  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProducts: 0,
    successfulProducts: 0,
    pendingProducts: 0,
    withOffersCount: 0,
    favoritesCount: 0,
    newThisWeekCount: 0,
    evergreenCount: 0,
    activeCount: 0,
    inactiveCount: 0,
    platforms: {
      shopify: 0,
      youcan: 0,
      woocommerce: 0,
    },
  });

  // Modal state
  const [selectedProduct, setSelectedProduct] = useState<ScrapedProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const detailRequestIdRef = useRef(0);
  const lastStatsFetchedRef = useRef(0);

  // Recently inspected products tracking (session-based)
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("recently_viewed_products");
      if (stored) {
        setRecentlyViewedIds(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Async stats fetcher (cached on backend, does not block product feed)
  const fetchStats = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && now - lastStatsFetchedRef.current < 45000 && lastStatsFetchedRef.current > 0) {
      return;
    }
    lastStatsFetchedRef.current = now;
    try {
      const res = await fetch(`/api/products/stats${forceRefresh ? "?refresh=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.warn("[Products Page] Stats fetch error:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch stats once on initial mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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

  // Read URL query params on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get("search");
      if (searchParam) {
        setSearchInput(searchParam);
        setDebouncedSearch(searchParam);
      }
      const brandParam = params.get("brand");
      if (brandParam) {
        setBrandInput(brandParam);
        setDebouncedBrand(brandParam);
      }
      const presetParam = params.get("preset");
      if (presetParam && ["all", "breakout", "most_scaled", "new_discovered", "top_lasting", "with_offers", "favorites"].includes(presetParam)) {
        setSmartPreset(presetParam as SmartPreset);
      }
      const platformParam = params.get("platform");
      if (platformParam) {
        setPlatform(platformParam);
      }
      const categoryParam = params.get("category");
      if (categoryParam) {
        setCategoryFilter(categoryParam);
      }
      const statusParam = params.get("status");
      if (statusParam) {
        setStatusFilter(statusParam);
      }
      const sortByParam = params.get("sortBy");
      if (sortByParam) {
        setSortBy(sortByParam);
      }
      const hideInactiveParam = params.get("hideInactive");
      if (hideInactiveParam === "true") {
        setHideInactive(true);
      }
      const discoveryParam = params.get("discovery");
      if (discoveryParam) {
        setDiscoveryFilter(discoveryParam);
      }
      const discoveryFromParam = params.get("discoveryFrom");
      if (discoveryFromParam) {
        setDiscoveryFrom(discoveryFromParam);
      }
      const discoveryToParam = params.get("discoveryTo");
      if (discoveryToParam) {
        setDiscoveryTo(discoveryToParam);
      }

      // Check for deep-linked product ID (?id=... or ?productId=...)
      const idParam = params.get("id") || params.get("productId");
      if (idParam) {
        fetch(`/api/products?id=${encodeURIComponent(idParam)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.products && data.products.length > 0) {
              setSelectedProduct(data.products[0]);
              setIsModalOpen(true);
            }
          })
          .catch((err) => console.error("[Products Page] Deep-link product fetch error:", err));
      }
    }
  }, []);

  // Listen to browser Back / Forward history events to keep URL bar & modal state in sync
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const idParam = params.get("id") || params.get("productId");
      if (idParam) {
        const found = products.find((p) => p.id === idParam);
        if (found) {
          setSelectedProduct(found);
          setIsModalOpen(true);
        } else {
          fetch(`/api/products?id=${encodeURIComponent(idParam)}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.success && data.products && data.products.length > 0) {
                setSelectedProduct(data.products[0]);
                setIsModalOpen(true);
              }
            })
            .catch((err) => console.error("[Products Page] Popstate product fetch error:", err));
        }
      } else {
        setIsModalOpen(false);
        setSelectedProduct(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [products]);

  // Continuous sync between active modal state and URL address bar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (isModalOpen && selectedProduct?.id) {
      if (url.searchParams.get("id") !== selectedProduct.id) {
        url.searchParams.set("id", selectedProduct.id);
        window.history.replaceState(null, "", url.toString());
      }
    } else if (!isModalOpen) {
      if (url.searchParams.has("id") || url.searchParams.has("productId")) {
        url.searchParams.delete("id");
        url.searchParams.delete("productId");
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, [isModalOpen, selectedProduct]);

  // Continuous sync between active filters and URL search params
  const isFilterHydratedRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isFilterHydratedRef.current) {
      isFilterHydratedRef.current = true;
      return;
    }

    const url = new URL(window.location.href);
    const currentId = url.searchParams.get("id") || url.searchParams.get("productId");
    const newParams = new URLSearchParams();

    if (currentId) newParams.set("id", currentId);
    if (debouncedSearch.trim()) newParams.set("search", debouncedSearch.trim());
    if (debouncedBrand.trim()) newParams.set("brand", debouncedBrand.trim());
    if (smartPreset !== "all") newParams.set("preset", smartPreset);
    if (platform !== "all") newParams.set("platform", platform);
    if (categoryFilter !== "all") newParams.set("category", categoryFilter);
    if (statusFilter !== "all") newParams.set("status", statusFilter);
    if (sortBy !== "latest") newParams.set("sortBy", sortBy);
    if (hideInactive) newParams.set("hideInactive", "true");
    if (discoveryFilter !== "all") newParams.set("discovery", discoveryFilter);
    if (discoveryFilter === "custom") {
      if (discoveryFrom) newParams.set("discoveryFrom", discoveryFrom);
      if (discoveryTo) newParams.set("discoveryTo", discoveryTo);
    }

    const nextSearch = newParams.toString();
    const nextUrl = nextSearch ? `${url.pathname}?${nextSearch}` : url.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [
    debouncedSearch,
    debouncedBrand,
    smartPreset,
    platform,
    categoryFilter,
    statusFilter,
    sortBy,
    hideInactive,
    discoveryFilter,
    discoveryFrom,
    discoveryTo,
  ]);

  const fetchProducts = useCallback(
    async (targetPage = 1, append = false) => {
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
        if (categoryFilter !== "all") query.set("category", categoryFilter);
        if (statusFilter !== "all") query.set("status", statusFilter);
        if (hideInactive) query.set("hideInactive", "true");
        if (discoveryFilter !== "all") query.set("discovery", discoveryFilter);
        if (discoveryFilter === "custom") {
          if (discoveryFrom) query.set("discoveryFrom", discoveryFrom);
          if (discoveryTo) query.set("discoveryTo", discoveryTo);
        }

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
    [
      sortBy,
      smartPreset,
      debouncedSearch,
      debouncedBrand,
      platform,
      categoryFilter,
      statusFilter,
      hideInactive,
      discoveryFilter,
      discoveryFrom,
      discoveryTo,
    ]
  );

  // Trigger fetch on filter/sort change
  useEffect(() => {
    setPage(1);
    setAutoLoadCount(0);
    fetchProducts(1, false);
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

  const handleToggleFavorite = useCallback(async (productId: string, nextFavorite: boolean) => {
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
      setStats((prev) => ({
        ...prev,
        favoritesCount: Math.max(0, prev.favoritesCount + (nextFavorite ? -1 : 1)),
      }));
      showToast({
        type: "error",
        title: "Favorite Error",
        message: err.message || "Could not update favorite status.",
      });
    }
  }, [showToast]);

  const handleRefresh = useCallback(async (productId: string, productOverride?: ScrapedProduct) => {
    const prod = resolveProductForRefresh(productId, products, productOverride || selectedProduct);
    if (!prod || !prod.url) {
      showToast({
        type: "error",
        title: "Refresh Unavailable",
        message: "This product has no usable landing-page URL to re-extract.",
      });
      return;
    }

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
        setSelectedProduct((prev) => (prev?.id === productId ? { ...prev, ...data.product } : prev));
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
  }, [products, selectedProduct, showToast]);

  const handleProductUpdate = useCallback((updatedProduct: ScrapedProduct) => {
    setSelectedProduct(updatedProduct);
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
  }, []);

  const handleCloseDetailsModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedProduct(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("id") || url.searchParams.has("productId")) {
        url.searchParams.delete("id");
        url.searchParams.delete("productId");
        window.history.pushState({}, "", url.toString());
      }
    }
  }, []);

  const handleDelete = useCallback(async (productId: string) => {
    // 1. Find product and original index before removing
    const targetProduct = products.find((p) => p.id === productId);
    const targetIndex = products.findIndex((p) => p.id === productId);
    if (!targetProduct) return;

    // 2. Fast Optimistic removal from UI state (instant response <1ms)
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setSelectedProduct((prev) => (prev?.id === productId ? null : prev));
    setIsModalOpen((prev) => (selectedProduct?.id === productId ? false : prev));

    // 3. Fire backend delete request in background
    fetch(`/api/products?id=${productId}`, {
      method: "DELETE",
    }).catch((err) => console.error("[Delete API Error]:", err));

    // 4. Show sleek Toast with Undo button
    showToast({
      type: "info",
      title: "Product Deleted",
      message: `"${targetProduct.title || "Product"}" removed.`,
      duration: 6000,
      action: {
        label: "↩ Undo",
        onClick: async () => {
          // Instantly restore to state at original index
          setProducts((prev) => {
            if (prev.some((p) => p.id === productId)) return prev;
            const next = [...prev];
            if (targetIndex >= 0 && targetIndex <= next.length) {
              next.splice(targetIndex, 0, targetProduct);
            } else {
              next.unshift(targetProduct);
            }
            return next;
          });

          // Call restore API in background with rollback on failure
          try {
            const res = await fetch("/api/products/restore", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: productId }),
            });
            if (res.ok) {
              showToast({
                type: "success",
                title: "Product Restored",
                message: `"${targetProduct.title || "Product"}" restored to catalog.`,
              });
            } else {
              throw new Error("Failed to restore on server");
            }
          } catch (err) {
            console.error("[Restore Error]:", err);
            setProducts((prev) => prev.filter((p) => p.id !== productId));
            showToast({
              type: "error",
              title: "Restore Failed",
              message: "Could not restore product to server.",
            });
          }
        },
      },
    });
  }, [products, selectedProduct?.id, showToast]);

  const handleViewDetails = useCallback(async (product: ScrapedProduct) => {
    const requestId = ++detailRequestIdRef.current;
    setSelectedProduct(product);
    setIsModalOpen(true);

    // Track recently inspected product
    setRecentlyViewedIds((prev) => {
      const updated = [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 40);
      try {
        sessionStorage.setItem("recently_viewed_products", JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("id", product.id);
      window.history.replaceState(null, "", url.toString());
    }
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(product.id)}&details=true`);
      const json = await res.json();
      const detailedProduct = json.products?.[0];
      if (requestId === detailRequestIdRef.current && res.ok && detailedProduct) {
        setSelectedProduct(detailedProduct);
      }
    } catch {
      // Keep the lean product card available if detail loading fails.
    }
  }, []);

  const handleViewCreatives = useCallback((product: ScrapedProduct) => {
    if (product.brandPageId) {
      router.push(`/spy/brand/${encodeURIComponent(product.brandPageId)}?tab=creatives`);
    } else {
      router.push(`/spy?productId=${encodeURIComponent(product.id)}`);
    }
  }, [router]);

  const handleFilterBrand = useCallback((brandName: string) => {
    setBrandInput(brandName);
    setDebouncedBrand(brandName);
    setPage(1);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchInput("");
    setDebouncedSearch("");
    setBrandInput("");
    setDebouncedBrand("");
    setPlatform("all");
    setCategoryFilter("all");
    setStatusFilter("all");
    setSmartPreset("all");
    setDiscoveryFilter("all");
    setDiscoveryFrom("");
    setDiscoveryTo("");
    setSortBy("latest");
    setHideInactive(false);
    setPage(1);
    setAutoLoadCount(0);
  }, []);

  const progressPercent =
    pagination.total > 0 ? Math.min(100, Math.round((products.length / pagination.total) * 100)) : 0;
  const remainingCount = Math.max(0, pagination.total - products.length);
  const hasMore = page < pagination.totalPages;

  // Active secondary filters count
  const activeFilterCount =
    (debouncedBrand.trim() ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (platform !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (discoveryFilter !== "all" ? 1 : 0) +
    (hideInactive ? 1 : 0);

  const discoveryLabels: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    last_3d: "Last 3 Days",
    last_7d: "Last 7 Days",
    last_14d: "Last 14 Days",
    last_30d: "Last 30 Days",
    this_month: "This Month",
    custom: discoveryFrom && discoveryTo ? `${discoveryFrom} to ${discoveryTo}` : "Custom Date",
  };

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
            onClick={() => {
              fetchProducts(1, false);
              fetchStats(true);
            }}
            disabled={loading && statsLoading}
            title="Refresh product intelligence catalog"
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer shadow-xs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${(loading || statsLoading) ? "animate-spin text-indigo-500" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 1. Executive Analytics KPI Cards (5 Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total Products */}
        <div
          onClick={() => {
            setSmartPreset("all");
            setPage(1);
          }}
          title="View All Products"
          className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none ${
            smartPreset === "all"
              ? "border-indigo-500/60 ring-2 ring-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/20"
              : "border-slate-200 dark:border-slate-800/80 hover:border-indigo-500/40"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Total Products</span>
            <ShoppingBag className="w-4 h-4 text-indigo-500" />
          </div>
          <p className={`text-2xl font-black text-slate-900 dark:text-white mt-1 ${statsLoading ? "animate-pulse opacity-60" : ""}`}>
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
          title="Filter by Starred Favorites"
          className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none ${
            smartPreset === "favorites"
              ? "border-amber-500/60 ring-2 ring-amber-500/20 bg-amber-50/20 dark:bg-amber-950/20"
              : "border-slate-200 dark:border-slate-800/80 hover:border-amber-500/40"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>⭐ Starred Favorites</span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-500/20" />
          </div>
          <p className={`text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 ${statsLoading ? "animate-pulse opacity-60" : ""}`}>
            {stats.favoritesCount}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Saved to product watchlist
          </span>
        </div>

        {/* Fresh Drops (Last 7 Days) */}
        <div
          onClick={() => {
            setSmartPreset("new_discovered");
            setSortBy("latest");
            setPage(1);
          }}
          title="Filter by Fresh Drops discovered in the last 7 days"
          className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none ${
            smartPreset === "new_discovered"
              ? "border-emerald-500/60 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/20"
              : "border-slate-200 dark:border-slate-800/80 hover:border-emerald-500/40"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Fresh Drops (7d)</span>
            <Zap className="w-4 h-4 text-emerald-500" />
          </div>
          <p className={`text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 ${statsLoading ? "animate-pulse opacity-60" : ""}`}>
            {stats.newThisWeekCount}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Newly discovered this week
          </span>
        </div>

        {/* Top Lasting (Evergreen 30d+) */}
        <div
          onClick={() => {
            setSmartPreset("top_lasting");
            setSortBy("top_lasting");
            setPage(1);
          }}
          title="Filter by Longest Running Evergreen products (30d+)"
          className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none ${
            smartPreset === "top_lasting"
              ? "border-purple-500/60 ring-2 ring-purple-500/20 bg-purple-50/20 dark:bg-purple-950/20"
              : "border-slate-200 dark:border-slate-800/80 hover:border-purple-500/40"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Evergreen (30d+)</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <p className={`text-2xl font-black text-purple-600 dark:text-purple-400 mt-1 ${statsLoading ? "animate-pulse opacity-60" : ""}`}>
            {stats.evergreenCount}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">
            Longest running proven winners
          </span>
        </div>

        {/* With Discounts / Bundle Offers */}
        <div
          onClick={() => {
            setSmartPreset("with_offers");
            setPage(1);
          }}
          title="Filter by Products with bundle offers and discounts"
          className={`p-3.5 rounded-xl bg-white dark:bg-slate-950/60 border shadow-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md select-none col-span-2 sm:col-span-1 ${
            smartPreset === "with_offers"
              ? "border-blue-500/60 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-950/20"
              : "border-slate-200 dark:border-slate-800/80 hover:border-blue-500/40"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Offers & Bundles</span>
            <Tag className="w-4 h-4 text-blue-500" />
          </div>
          <p className={`text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 ${statsLoading ? "animate-pulse opacity-60" : ""}`}>
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
            setSmartPreset("breakout");
            setSortBy("breakout");
            setPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            smartPreset === "breakout"
              ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white font-bold shadow-sm shadow-rose-600/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800"
          }`}
        >
          <Rocket className="w-3.5 h-3.5 text-pink-400" />
          <span>🚀 Breakout Winners</span>
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

      {/* 3. Primary Toolbar Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
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

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {/* Filters Toggle Button */}
          <button
            type="button"
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer select-none ${
              isFiltersOpen || activeFilterCount > 0
                ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shadow-xs"
                : "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-indigo-600 text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isFiltersOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Quick Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="latest">⚡ Newest Discovered</option>
            <option value="oldest">🕰️ Oldest Discovered</option>
            <option value="most_scaled">🔥 Most Scaled (Active Ads)</option>
            <option value="top_lasting">⏳ Longest Lasting (Evergreen)</option>
            <option value="price_desc">💰 Price (High to Low)</option>
            <option value="price_asc">🏷️ Price (Low to High)</option>
            <option value="title">🔤 Title (A-Z)</option>
          </select>

          {/* Active / Inactive (Off-Air) Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setHideInactive((prev) => !prev);
              setPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer select-none ${
              hideInactive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-xs"
                : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
            title={
              hideInactive
                ? "Currently hiding inactive (off-air) products. Click to include all products."
                : "Currently showing all products including off-air. Click to hide inactive products."
            }
          >
            {hideInactive ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Active Only</span>
                {stats.inactiveCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">
                    -{stats.inactiveCount}
                  </span>
                )}
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>All Products</span>
              </>
            )}
          </button>

          {/* Grid / List View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-xs"
                  : "text-slate-500"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 shadow-xs"
                  : "text-slate-500"
              }`}
              title="Dense List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Filter Drawer */}
      {isFiltersOpen && (
        <div className="p-4 bg-white dark:bg-slate-950/70 rounded-xl border border-slate-200 dark:border-slate-800/90 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Refine Product Catalog
              </span>
              {activeFilterCount > 0 && (
                <span className="text-[11px] text-slate-500 font-medium">
                  ({activeFilterCount} active)
                </span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Brand Filter Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Brand Name or Page ID
              </label>
              <div className="relative">
                <Building2 className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={brandInput}
                  onChange={(e) => {
                    setBrandInput(e.target.value);
                    setPage(1);
                  }}
                  placeholder="e.g. Nike, Apple..."
                  className="w-full bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 pl-8 pr-7 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
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
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Niche & Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Categories</option>
                <option value="Electronics & Tech">📱 Electronics & Tech</option>
                <option value="Beauty, Health & Care">💄 Beauty & Health</option>
                <option value="Home, Kitchen & Living">🏠 Home & Kitchen</option>
                <option value="Fashion & Jewelry">👗 Fashion & Jewelry</option>
                <option value="Sports, Fitness & Outdoor">⚡ Sports & Fitness</option>
                <option value="Kids, Baby & Toys">🧸 Kids & Baby</option>
                <option value="Automotive & Tools">🚗 Automotive & Tools</option>
                <option value="General & Other">📦 General & Uncategorized</option>
              </select>
            </div>

            {/* E-Commerce Platform Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                E-Commerce Platform
              </label>
              <select
                value={platform}
                onChange={(e) => {
                  setPlatform(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Platforms</option>
                <option value="shopify">Shopify ({stats.platforms.shopify})</option>
                <option value="youcan">YouCan ({stats.platforms.youcan})</option>
                <option value="woocommerce">WooCommerce ({stats.platforms.woocommerce})</option>
              </select>
            </div>

            {/* Scrape Status Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Scraping Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-slate-50 dark:bg-slate-900 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Scrape Status</option>
                <option value="success">Scraped Only ({stats.successfulProducts})</option>
                <option value="pending">Pending / Needs Scrape ({stats.pendingProducts})</option>
                <option value="failed">Failed Scrape Only</option>
              </select>
            </div>

            {/* Discovery Date Filter & Custom Range */}
            <div className="space-y-1 sm:col-span-2 md:col-span-4 pt-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Discovery Date
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={discoveryFilter}
                  onChange={(e) => {
                    setDiscoveryFilter(e.target.value);
                    setPage(1);
                  }}
                  className={`text-xs font-semibold rounded-lg border px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
                    discoveryFilter !== "all"
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800"
                      : "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <option value="all">📅 All Discovery Dates</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last_3d">Last 3 Days</option>
                  <option value="last_7d">Last 7 Days</option>
                  <option value="last_14d">Last 14 Days</option>
                  <option value="last_30d">Last 30 Days</option>
                  <option value="this_month">This Month</option>
                  <option value="custom">Custom Date Range...</option>
                </select>

                {discoveryFilter === "custom" && (
                  <div className="inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">From</span>
                    <input
                      type="date"
                      value={discoveryFrom}
                      onChange={(e) => {
                        setDiscoveryFrom(e.target.value);
                        setPage(1);
                      }}
                      className="bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer text-xs"
                    />
                    <span className="text-[10px] font-bold text-slate-400 uppercase">To</span>
                    <input
                      type="date"
                      value={discoveryTo}
                      onChange={(e) => {
                        setDiscoveryTo(e.target.value);
                        setPage(1);
                      }}
                      className="bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips Bar */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs pt-1 pb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">
            Active Filters ({activeFilterCount}):
          </span>

          {debouncedBrand.trim() && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>Brand: <strong>{debouncedBrand}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setBrandInput("");
                  setDebouncedBrand("");
                  setPage(1);
                }}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove brand filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {categoryFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <Tag className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>Category: <strong>{categoryFilter}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter("all");
                  setPage(1);
                }}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove category filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {platform !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <Globe className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>Platform: <strong className="capitalize">{platform}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setPlatform("all");
                  setPage(1);
                }}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove platform filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {statusFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <span>Status: <strong className="capitalize">{statusFilter}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setPage(1);
                }}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove status filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {discoveryFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
              <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>Discovery: <strong>{discoveryLabels[discoveryFilter] || discoveryFilter}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setDiscoveryFilter("all");
                  setDiscoveryFrom("");
                  setDiscoveryTo("");
                  setPage(1);
                }}
                className="hover:text-indigo-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Remove discovery date filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {hideInactive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px]">
              <EyeOff className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>Active Ads Only</span>
              <button
                type="button"
                onClick={() => {
                  setHideInactive(false);
                  setPage(1);
                }}
                className="hover:text-emerald-950 dark:hover:text-white ml-0.5 p-0.5 cursor-pointer rounded-full transition-colors"
                title="Show all products including inactive"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        </div>
      )}

      {/* 4. Products Display Area */}
      {loading && products.length === 0 ? (
        viewMode === "grid" ? (
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
        ) : (
          <div className="flex flex-col gap-2.5">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-3.5 bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse"
              >
                <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                </div>
                <div className="hidden sm:flex items-center gap-3 shrink-0">
                  <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )
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
        <div className="py-16 text-center bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800/80 p-8 flex flex-col items-center justify-center space-y-4">
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
                : (debouncedSearch.trim() || debouncedBrand.trim() || platform !== "all" || categoryFilter !== "all" || statusFilter !== "all" || hideInactive || smartPreset !== "all" || discoveryFilter !== "all")
                ? "Your active filters narrowed down results to 0. Use 1-click recovery below or reset all."
                : "Run ad spy scans to automatically extract, deduplicate, and scrape product landing pages."}
            </p>
          </div>

          {/* Contextual 1-Click Targeted Filter Recovery Chips */}
          {(debouncedSearch.trim() || debouncedBrand.trim() || platform !== "all" || categoryFilter !== "all" || statusFilter !== "all" || hideInactive || (smartPreset !== "all" && smartPreset !== "favorites") || discoveryFilter !== "all") && (
            <div className="flex flex-col items-center gap-2 max-w-md w-full pt-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                1-Click Recovery Options:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {debouncedSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setDebouncedSearch("");
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer transition-colors"
                  >
                    <Search className="w-3 h-3 text-indigo-500" />
                    <span>Clear Search &ldquo;{debouncedSearch}&rdquo;</span>
                  </button>
                )}

                {debouncedBrand.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setBrandInput("");
                      setDebouncedBrand("");
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer transition-colors"
                  >
                    <Building2 className="w-3 h-3 text-indigo-500" />
                    <span>Clear Brand &ldquo;{debouncedBrand}&rdquo;</span>
                  </button>
                )}

                {hideInactive && (
                  <button
                    type="button"
                    onClick={() => {
                      setHideInactive(false);
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/60 cursor-pointer transition-colors"
                  >
                    <EyeOff className="w-3 h-3 text-emerald-500" />
                    <span>Include Inactive (Off-Air)</span>
                  </button>
                )}

                {categoryFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter("all");
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-semibold text-xs hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer transition-colors"
                  >
                    <Tag className="w-3 h-3 text-amber-500" />
                    <span>Clear Category ({categoryFilter})</span>
                  </button>
                )}

                {platform !== "all" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlatform("all");
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                  >
                    <Globe className="w-3 h-3 text-slate-500" />
                    <span>Clear Platform ({platform})</span>
                  </button>
                )}

                {statusFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("all");
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                  >
                    <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                    <span>Reset Scrape Status</span>
                  </button>
                )}

                {discoveryFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => {
                      setDiscoveryFilter("all");
                      setDiscoveryFrom("");
                      setDiscoveryTo("");
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                  >
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>Reset Discovery Date</span>
                  </button>
                )}

                {smartPreset !== "all" && smartPreset !== "favorites" && (
                  <button
                    type="button"
                    onClick={() => {
                      setSmartPreset("all");
                      setPage(1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-semibold text-xs hover:bg-purple-100 dark:hover:bg-purple-900/60 cursor-pointer transition-colors"
                  >
                    <Sparkles className="w-3 h-3 text-purple-500" />
                    <span>Switch to All Products</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
            >
              Reset All Filters
            </button>
            <Link
              href="/spy"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm cursor-pointer transition-colors"
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
                  isRecentlyViewed={recentlyViewedIds.includes(product.id)}
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
                  isRecentlyViewed={recentlyViewedIds.includes(product.id)}
                />
              ))}
            </div>
          )}

          {/* Sentinel element for infinite scroll auto-trigger */}
          <div ref={sentinelRef} className="h-6 w-full" />

          {/* Skeletons while fetching more items */}
          {isFetchingMore && (
            viewMode === "grid" ? (
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
            ) : (
              <div className="flex flex-col gap-2.5 pt-2">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="flex items-center gap-4 p-3.5 bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse"
                  >
                    <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                    </div>
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                      <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            )
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
          aria-label="Scroll Back to Top"
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-6 z-40 p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-indigo-500/30 transition-all duration-200 animate-in fade-in zoom-in cursor-pointer"
          title="Scroll Back to Top"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {/* Details & Competitor Benchmark Modal */}
      <ProductDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseDetailsModal}
        product={selectedProduct}
        onRefresh={handleRefresh}
        onDelete={handleDelete}
        onProductUpdate={handleProductUpdate}
      />
    </div>
  );
}
