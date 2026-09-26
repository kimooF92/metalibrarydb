"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScrapedProduct } from "@/types";
import { ProductCard } from "@/components/products/product-card";
import { ProductRow } from "@/components/products/product-row";
import { ProductDetailsModal } from "@/components/products/product-details-modal";
import { ProductsKpiBar } from "@/components/products/products-kpi-bar";
import type { SmartPreset } from "@/components/products/products-kpi-bar";
import { ProductsFilterToolbar } from "@/components/products/products-filter-toolbar";
import { ProductsEmptyState } from "@/components/products/products-empty-state";
import { resolveProductForRefresh } from "@/lib/product-extraction";
import { useToast } from "@/components/toast-context";
import {
  ShoppingBag,
  RotateCw,
  Eye,
  ArrowUp,
  Loader2,
  CheckCircle2,
} from "lucide-react";

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
      if (platformParam) setPlatform(platformParam);
      const categoryParam = params.get("category");
      if (categoryParam) setCategoryFilter(categoryParam);
      const statusParam = params.get("status");
      if (statusParam) setStatusFilter(statusParam);
      const sortByParam = params.get("sortBy");
      if (sortByParam) setSortBy(sortByParam);
      const hideInactiveParam = params.get("hideInactive");
      if (hideInactiveParam === "true") setHideInactive(true);
      const discoveryParam = params.get("discovery");
      if (discoveryParam) setDiscoveryFilter(discoveryParam);
      const discoveryFromParam = params.get("discoveryFrom");
      if (discoveryFromParam) setDiscoveryFrom(discoveryFromParam);
      const discoveryToParam = params.get("discoveryTo");
      if (discoveryToParam) setDiscoveryTo(discoveryToParam);

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
        body: JSON.stringify({
          productId: prod.id,
          url: prod.url,
          pageId: prod.pageId,
          forceRefresh: true,
        }),
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
    const targetProduct = products.find((p) => p.id === productId);
    const targetIndex = products.findIndex((p) => p.id === productId);
    if (!targetProduct) return;

    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setSelectedProduct((prev) => (prev?.id === productId ? null : prev));
    setIsModalOpen((prev) => (selectedProduct?.id === productId ? false : prev));

    fetch(`/api/products?id=${productId}`, { method: "DELETE" }).catch((err) =>
      console.error("[Delete API Error]:", err)
    );

    showToast({
      type: "info",
      title: "Product Deleted",
      message: `"${targetProduct.title || "Product"}" removed.`,
      duration: 6000,
      action: {
        label: "↩ Undo",
        onClick: async () => {
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

  // Modal sequential navigation
  const currentProductIndex = selectedProduct
    ? products.findIndex((p) => p.id === selectedProduct.id)
    : -1;

  const handleNavigatePrev = useCallback(() => {
    if (currentProductIndex > 0) {
      handleViewDetails(products[currentProductIndex - 1]);
    }
  }, [currentProductIndex, products, handleViewDetails]);

  const handleNavigateNext = useCallback(() => {
    if (currentProductIndex >= 0 && currentProductIndex < products.length - 1) {
      handleViewDetails(products[currentProductIndex + 1]);
    }
  }, [currentProductIndex, products, handleViewDetails]);

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

  // KPI bar preset handler — also updates sortBy when a default is provided
  const handleSelectPreset = useCallback((preset: SmartPreset, defaultSort?: string) => {
    setSmartPreset(preset);
    if (defaultSort) setSortBy(defaultSort);
    setPage(1);
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
    <div className="space-y-3 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200 dark:border-slate-800/60">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              Product Intelligence &amp; Catalog Hub
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

      {/* 1. KPI Bar */}
      <ProductsKpiBar
        stats={stats}
        statsLoading={statsLoading}
        smartPreset={smartPreset}
        onSelectPreset={handleSelectPreset}
      />

      {/* 2. Filter Toolbar (preset pills + primary toolbar + drawer + chips) */}
      <ProductsFilterToolbar
        smartPreset={smartPreset}
        onSelectPreset={handleSelectPreset}
        searchInput={searchInput}
        onChangeSearch={(v) => { setSearchInput(v); setPage(1); }}
        onClearSearch={() => { setSearchInput(""); setDebouncedSearch(""); setPage(1); }}
        sortBy={sortBy}
        onChangeSortBy={(v) => { setSortBy(v); setPage(1); }}
        hideInactive={hideInactive}
        onToggleHideInactive={() => { setHideInactive((prev) => !prev); setPage(1); }}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        isFiltersOpen={isFiltersOpen}
        onToggleFilters={() => setIsFiltersOpen((prev) => !prev)}
        brandInput={brandInput}
        onChangeBrand={(v) => { setBrandInput(v); setPage(1); }}
        onClearBrand={() => { setBrandInput(""); setDebouncedBrand(""); setPage(1); }}
        debouncedBrand={debouncedBrand}
        categoryFilter={categoryFilter}
        onChangeCategoryFilter={(v) => { setCategoryFilter(v); setPage(1); }}
        platform={platform}
        onChangePlatform={(v) => { setPlatform(v); setPage(1); }}
        statusFilter={statusFilter}
        onChangeStatusFilter={(v) => { setStatusFilter(v); setPage(1); }}
        discoveryFilter={discoveryFilter}
        onChangeDiscoveryFilter={(v) => { setDiscoveryFilter(v); setPage(1); }}
        discoveryFrom={discoveryFrom}
        onChangeDiscoveryFrom={(v) => { setDiscoveryFrom(v); setPage(1); }}
        discoveryTo={discoveryTo}
        onChangeDiscoveryTo={(v) => { setDiscoveryTo(v); setPage(1); }}
        onResetFilters={handleResetFilters}
        activeFilterCount={activeFilterCount}
        discoveryLabels={discoveryLabels}
        stats={stats}
      />

      {/* 3. Products Display Area */}
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
        <ProductsEmptyState
          smartPreset={smartPreset}
          debouncedSearch={debouncedSearch}
          debouncedBrand={debouncedBrand}
          platform={platform}
          categoryFilter={categoryFilter}
          statusFilter={statusFilter}
          hideInactive={hideInactive}
          discoveryFilter={discoveryFilter}
          onClearSearch={() => { setSearchInput(""); setDebouncedSearch(""); setPage(1); }}
          onClearBrand={() => { setBrandInput(""); setDebouncedBrand(""); setPage(1); }}
          onClearPlatform={() => { setPlatform("all"); setPage(1); }}
          onClearCategory={() => { setCategoryFilter("all"); setPage(1); }}
          onClearStatus={() => { setStatusFilter("all"); setPage(1); }}
          onClearDiscovery={() => { setDiscoveryFilter("all"); setDiscoveryFrom(""); setDiscoveryTo(""); setPage(1); }}
          onClearHideInactive={() => { setHideInactive(false); setPage(1); }}
          onClearPreset={() => { setSmartPreset("all"); setPage(1); }}
          onResetAll={handleResetFilters}
        />
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
            <div className="w-full max-w-xs flex flex-col items-center space-y-1.5">
              <div className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>
                  Showing{" "}
                  <strong className="text-slate-900 dark:text-white font-bold">{products.length}</strong>{" "}
                  of{" "}
                  <strong className="text-slate-900 dark:text-white font-bold">{pagination.total}</strong>{" "}
                  products
                </span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{progressPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

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
        currentIndex={currentProductIndex}
        totalCount={products.length}
        hasPrev={currentProductIndex > 0}
        hasNext={currentProductIndex >= 0 && currentProductIndex < products.length - 1}
        onNavigatePrev={handleNavigatePrev}
        onNavigateNext={handleNavigateNext}
      />
    </div>
  );
}
