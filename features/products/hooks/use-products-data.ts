"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ScrapedProduct } from "@/types";
import { ProductsStats, ProductsPagination, SmartPreset } from "../types";
import { resolveProductForRefresh } from "@/lib/product-extraction";
import { useToast } from "@/components/toast-context";
import { useWorkspace } from "@/components/workspace-context";

interface UseProductsDataParams {
  sortBy: string;
  smartPreset: SmartPreset;
  debouncedSearch: string;
  debouncedBrand: string;
  platform: string;
  categoryFilter: string;
  selectedNiches: string[];
  selectedSubNiches: string[];
  statusFilter: string;
  hideInactive: boolean;
  discoveryFilter: string;
  discoveryFrom: string;
  discoveryTo: string;
  adLaunchFilter: string;
  adLaunchFrom: string;
  adLaunchTo: string;
  stillRunningOnly: boolean;
  groupCarousels: boolean;
}

export function useProductsData(filters: UseProductsDataParams) {
  const { showToast } = useToast();
  const { activeWorkspace } = useWorkspace();

  const {
    sortBy,
    smartPreset,
    debouncedSearch,
    debouncedBrand,
    platform,
    categoryFilter,
    selectedNiches,
    selectedSubNiches,
    statusFilter,
    hideInactive,
    discoveryFilter,
    discoveryFrom,
    discoveryTo,
    adLaunchFilter,
    adLaunchFrom,
    adLaunchTo,
    stillRunningOnly,
    groupCarousels,
  } = filters;

  const nichesKey = selectedNiches.join(",");
  const subNichesKey = selectedSubNiches.join(",");

  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [refreshingProductIds, setRefreshingProductIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isCatalogRefreshing, setIsCatalogRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [groupedCarouselsCount, setGroupedCarouselsCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<ProductsPagination>({
    page: 1,
    limit: 24,
    total: 0,
    totalPages: 1,
  });

  const [autoLoadCount, setAutoLoadCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<ProductsStats>({
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
    nicheCounts: [],
  });

  const lastStatsFetchedRef = useRef(0);

  // Async stats fetcher (cached on backend, does not block product feed)
  const fetchStats = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && now - lastStatsFetchedRef.current < 45000 && lastStatsFetchedRef.current > 0) {
      setStatsLoading(false);
      return;
    }
    lastStatsFetchedRef.current = now;
    if (forceRefresh) {
      setStatsLoading(true);
    }
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

  // Fetch products implementation
  const fetchProducts = useCallback(
    async (targetPage = 1, append = false, forceRefresh = false) => {
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
        });

        // Only bust cache if the user explicitly clicked manual refresh
        if (forceRefresh) {
          query.set("_t", Date.now().toString());
        }

        if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());
        if (debouncedBrand.trim()) query.set("brand", debouncedBrand.trim());
        if (platform !== "all") query.set("platform", platform);
        if (nichesKey) {
          query.set("niche", nichesKey);
        } else if (categoryFilter !== "all") {
          query.set("category", categoryFilter);
        }
        if (subNichesKey) {
          query.set("subNiche", subNichesKey);
        }
        if (statusFilter !== "all") query.set("status", statusFilter);
        if (hideInactive) query.set("hideInactive", "true");
        if (discoveryFilter !== "all") query.set("discovery", discoveryFilter);
        if (discoveryFilter === "custom") {
          if (discoveryFrom) query.set("discoveryFrom", discoveryFrom);
          if (discoveryTo) query.set("discoveryTo", discoveryTo);
        }
        if (adLaunchFilter !== "all") query.set("adLaunch", adLaunchFilter);
        if (adLaunchFilter === "custom") {
          if (adLaunchFrom) query.set("adLaunchFrom", adLaunchFrom);
          if (adLaunchTo) query.set("adLaunchTo", adLaunchTo);
        }
        query.set("stillRunning", stillRunningOnly ? "true" : "false");
        query.set("groupCarousels", groupCarousels ? "true" : "false");
        const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
        if (tz) query.set("tz", tz);

        const res = await fetch(`/api/products?${query.toString()}`, {
          signal: currentController.signal,
          cache: forceRefresh ? "no-store" : "default",
        });
        if (!res.ok) {
          throw new Error(`Failed to load products (${res.status})`);
        }

        const data = await res.json();
        if (data.success) {
          const newItems: ScrapedProduct[] = data.products || [];
          if (typeof data.groupedCarouselsCount === "number") {
            setGroupedCarouselsCount(data.groupedCarouselsCount);
          }
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
      nichesKey,
      subNichesKey,
      statusFilter,
      hideInactive,
      discoveryFilter,
      discoveryFrom,
      discoveryTo,
      adLaunchFilter,
      adLaunchFrom,
      adLaunchTo,
      stillRunningOnly,
      groupCarousels,
    ]
  );

  // Trigger fetch on filter/sort change
  useEffect(() => {
    setPage(1);
    setAutoLoadCount(0);
    fetchProducts(1, false);
  }, [fetchProducts]);

  // Re-fetch products when workspace switches (skip initial mount to avoid duplicate fetch)
  const activeWorkspaceId = activeWorkspace?.id;
  const isInitialMountRef = useRef(true);
  const fetchProductsRef = useRef(fetchProducts);
  fetchProductsRef.current = fetchProducts;
  const fetchStatsRef = useRef(fetchStats);
  fetchStatsRef.current = fetchStats;

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (activeWorkspaceId) {
      setPage(1);
      setAutoLoadCount(0);
      fetchProductsRef.current(1, false);
      fetchStatsRef.current(true);
    }
  }, [activeWorkspaceId]);

  // Manual catalog refresh handler (force busts cache for both products & stats)
  const handleRefreshCatalog = useCallback(async () => {
    setIsCatalogRefreshing(true);
    try {
      await Promise.all([
        fetchProducts(1, false, true),
        fetchStats(true),
      ]);
    } finally {
      setIsCatalogRefreshing(false);
    }
  }, [fetchProducts, fetchStats]);

  // Load next page function
  const loadNextPage = useCallback(() => {
    if (loading || isFetchingMore || page >= pagination.totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setAutoLoadCount((prev) => prev + 1);
    fetchProducts(nextPage, true);
  }, [loading, isFetchingMore, page, pagination.totalPages, fetchProducts]);

  // Manual Load More button handler
  const handleManualLoadMore = useCallback(() => {
    if (loading || isFetchingMore || page >= pagination.totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setAutoLoadCount(0); // Reset the 3-batch pause
    fetchProducts(nextPage, true);
  }, [loading, isFetchingMore, page, pagination.totalPages, fetchProducts]);

  // Toggle favorite with optimistic rollback
  const handleToggleFavorite = useCallback(
    async (productId: string, nextFavorite: boolean) => {
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
    },
    [showToast]
  );

  // Re-extract landing page refresh handler
  const handleRefresh = useCallback(
    async (
      productId: string,
      productOverride?: ScrapedProduct,
      onRefreshed?: (product: ScrapedProduct) => void
    ): Promise<void> => {
      const prod = resolveProductForRefresh(productId, products, productOverride);
      if (!prod || !prod.url) {
        showToast({
          type: "error",
          title: "Refresh Unavailable",
          message: "This product has no usable landing-page URL to re-extract.",
        });
        return;
      }

      setRefreshingProductIds((prev) => new Set(prev).add(productId));

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
          onRefreshed?.(data.product as ScrapedProduct);
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
      } finally {
        setRefreshingProductIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [products, showToast]
  );

  const handleProductUpdate = useCallback((updatedProduct: ScrapedProduct) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
  }, []);

  const handleDelete = useCallback(
    async (productId: string, onDeleted?: () => void) => {
      const targetProduct = products.find((p) => p.id === productId);
      const targetIndex = products.findIndex((p) => p.id === productId);
      if (!targetProduct) return;

      setProducts((prev) => prev.filter((p) => p.id !== productId));
      onDeleted?.();

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
    },
    [products, showToast]
  );

  return {
    products,
    setProducts,
    loading,
    isFetchingMore,
    error,
    groupedCarouselsCount,
    page,
    setPage,
    pagination,
    autoLoadCount,
    setAutoLoadCount,
    refreshingProductIds,
    stats,
    statsLoading,
    isCatalogRefreshing,
    fetchProducts,
    fetchStats,
    handleRefreshCatalog,
    loadNextPage,
    handleManualLoadMore,
    handleToggleFavorite,
    handleRefresh,
    handleProductUpdate,
    handleDelete,
  };
}
